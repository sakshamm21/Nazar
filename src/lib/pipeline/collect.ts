import "server-only";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import type { HealthInfo, QuarterRow, ResultsData } from "@/lib/db/schema";
import type { AssetClass } from "@/lib/instruments/asset-classes";
import { betaAndVol, buildHealth } from "@/lib/analytics/models";
import { metricsFromSummary } from "@/lib/data/yahoo";
import { CircuitBreaker, CircuitOpenError, Limiter } from "@/lib/data/resilience";
import { istDate, type MarketDataProvider } from "@/lib/data/provider";
import { isManualSymbol, isSyntheticSymbol } from "@/lib/instruments/asset-classes";
import { catalogItem, classOfSymbol } from "@/lib/instruments/catalog";
import { getMaster, shortName } from "@/lib/instruments/master";
import { NIFTY, isIndex, sectorOf } from "@/lib/instruments/sectors";
import { latestTradeDate, priceHistory, shiftDate, snapshotsAsOf } from "@/lib/market/store";
import { logger } from "@/lib/logger";

/**
 * Collect stage of the nightly checkup. For each unique symbol, once:
 *  1. one batched quote call per 50 symbols → today's price, change and "as of" time
 *  2. incremental daily history (only days we don't have; ~400 days the first time)
 *  3. one quoteSummary call → profile, the 42 metrics, next results date, quarterly results
 *  4. annual statements only weekly or after new results → health score (Piotroski/Altman or lender check)
 *  5. beta and volatility vs the Nifty from stored prices (Yahoo's NSE beta is unreliable)
 *  6. results detection: a quarter end we haven't seen before → results_events row (H4)
 * Resumable: processes symbols from `cursor` until the deadline, returns the next cursor.
 */
export type CollectStats = { quotes: number; processed: number; failed: number; stale: string[]; results: number; marketDate: string | null; circuitOpen: boolean };

/**
 * Stores one batch of quotes as today's price and snapshot per symbol. Safe to run any number of
 * times a day (the nightly checkup, a first look, or a refresh when someone opens the app): every
 * write is an upsert, and a new day's snapshot starts from the previous day's beta, health and
 * metrics so the portfolio reads correctly before the full nightly collect has run.
 */
export async function collectQuotes(db: DB, provider: MarketDataProvider, symbols: string[], source = "live") {
  const quotes = (await provider.quotes(symbols)).filter((q) => q.price != null);
  const dateOf = (q: (typeof quotes)[number]) => (q.asOf ? istDate(new Date(q.asOf)) : istDate(new Date()));
  const niftyQuote = quotes.find((q) => q.symbol === NIFTY);
  const marketDate = niftyQuote ? dateOf(niftyQuote) : null;
  // Fund NAVs and metal prices have no exchange session of their own: they belong to the market's.
  const session = marketDate ?? (await latestTradeDate(db, [source])) ?? istDate(new Date());
  const earlier = await snapshotsAsOf(db, quotes.map((q) => q.symbol), session, [source], true);
  for (const q of quotes) {
    const price = q.price!;
    const pinned = isSyntheticSymbol(q.symbol);
    const tradeDate = pinned ? session : dateOf(q);
    const before = earlier.get(q.symbol);
    await db.insert(schema.priceDaily).values({ symbol: q.symbol, date: dateOf(q), source, close: price, volume: q.volume }).onConflictDoUpdate({ target: [schema.priceDaily.symbol, schema.priceDaily.date, schema.priceDaily.source], set: { close: price, volume: q.volume } });
    // A pinned price moves against what Nazar showed for the previous session, so a NAV that hasn't been published yet reads as no change rather than yesterday's change again.
    const prevClose = pinned ? (before?.price ?? q.previousClose) : q.previousClose;
    const changePct = !pinned && q.changePercent != null ? q.changePercent / 100 : prevClose ? price / prevClose - 1 : null;
    const base = { price, prevClose, changePct, marketCap: q.marketCap ?? before?.marketCap ?? null, asOf: q.asOf ? new Date(q.asOf) : null, fetchedAt: new Date(), status: "ok" as const };
    const carried = before && before.tradeDate < tradeDate ? { metrics: before.metrics, beta: before.beta, vol1y: before.vol1y, health: before.health, nextResultsDate: before.nextResultsDate && before.nextResultsDate >= tradeDate ? before.nextResultsDate : null, lastQuarterEnd: before.lastQuarterEnd, quarterly: before.quarterly } : {};
    await db
      .insert(schema.symbolSnapshots)
      .values({ symbol: q.symbol, tradeDate, source, ...carried, ...base })
      .onConflictDoUpdate({ target: [schema.symbolSnapshots.symbol, schema.symbolSnapshots.tradeDate, schema.symbolSnapshots.source], set: base });
  }
  return { count: quotes.length, marketDate, priced: new Set(quotes.map((q) => q.symbol)) };
}

async function lastStoredDate(db: DB, symbol: string, source: string) {
  const [r] = await db.select({ d: schema.priceDaily.date, n: sql<number>`count(*) over ()` }).from(schema.priceDaily).where(and(eq(schema.priceDaily.symbol, symbol), eq(schema.priceDaily.source, source))).orderBy(desc(schema.priceDaily.date)).limit(1);
  return r ? { date: r.d, count: Number(r.n) } : null;
}

async function previousSnapshot(db: DB, symbol: string, source: string, before: string) {
  const [r] = await db
    .select()
    .from(schema.symbolSnapshots)
    .where(and(eq(schema.symbolSnapshots.symbol, symbol), eq(schema.symbolSnapshots.source, source), sql`${schema.symbolSnapshots.tradeDate} < ${before}`))
    .orderBy(desc(schema.symbolSnapshots.tradeDate))
    .limit(1);
  return r ?? null;
}

async function collectSymbol(db: DB, provider: MarketDataProvider, symbol: string, marketDate: string, source = "live") {
  // 1. Incremental history
  const last = await lastStoredDate(db, symbol, source);
  const from = !last || last.count < 200 ? new Date(Date.now() - 400 * 86400000) : new Date(`${shiftDate(last.date, -5)}T00:00:00Z`);
  const bars = await provider.dailyHistory(symbol, from);
  for (let i = 0; i < bars.length; i += 200) {
    const chunk = bars.slice(i, i + 200).map((b) => ({ symbol, date: b.date, source, close: b.close, volume: b.volume }));
    if (chunk.length) await db.insert(schema.priceDaily).values(chunk).onConflictDoNothing();
  }
  if (isIndex(symbol)) return { results: false };
  const assetClass = classOfSymbol(symbol) ?? "stock";
  if (assetClass !== "stock") return collectFund(db, provider, symbol, assetClass, marketDate, source);

  // 2. Profile, metrics, calendar, quarters
  const sum = await provider.summary(symbol);
  const master = symbol.endsWith(".NS") ? getMaster().bySymbol.get(symbol.slice(0, -3)) : undefined;
  const sec = sectorOf(sum.sector, sum.industry);
  const name = master?.name ?? sum.name ?? symbol;
  await db
    .insert(schema.instruments)
    .values({ symbol, isin: master?.isin ?? null, name, shortName: shortName(name), sector: sum.sector, industry: sum.industry, isFinancial: sec.financial, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.instruments.symbol, set: { name, shortName: shortName(name), sector: sum.sector, industry: sum.industry, isFinancial: sec.financial, updatedAt: new Date() } });
  const fx = sum.reportingCurrency !== sum.currency ? await provider.fx(sum.reportingCurrency, sum.currency) : null;
  const { values: metrics } = metricsFromSummary(sum.raw, fx);

  // 3. Health: reuse last week's unless stale or new results arrived
  const prev = await previousSnapshot(db, symbol, source, marketDate);
  const latestQuarter = sum.quarters.at(-1) ?? null;
  const newResults = !!latestQuarter && !!prev?.lastQuarterEnd && latestQuarter.quarterEnd > prev.lastQuarterEnd;
  const healthAge = prev?.health ? daysSince((prev.metrics as Record<string, unknown>)?.__healthOn as string | undefined) : Infinity;
  let health: HealthInfo | null = prev?.health ?? null;
  let healthOn = (prev?.metrics as Record<string, unknown> | undefined)?.__healthOn as string | undefined;
  if (!health || healthAge > 7 || newResults) {
    const rows = sec.financial ? [] : await provider.annualFundamentals(symbol).catch(() => []);
    const fxToReporting = sum.reportingCurrency !== sum.currency ? (fx ? 1 / fx : null) : 1;
    health = buildHealth({ rows: rows as Record<string, unknown>[], metrics, sector: sum.sector, industry: sum.industry, marketCapReporting: sum.marketCap != null && fxToReporting ? sum.marketCap * fxToReporting : null });
    healthOn = marketDate;
  }

  // 4. Beta and volatility vs the Nifty, 1 year of stored closes
  const hist = await priceHistory(db, [symbol, NIFTY], [source], shiftDate(marketDate, -400));
  const bv = hist.get(symbol) && hist.get(NIFTY) ? betaAndVol(hist.get(symbol)!, hist.get(NIFTY)!) : { beta: null, vol: null };

  // 5. Results detection (never on the first fetch, so onboarding doesn't fire old results)
  if (newResults && latestQuarter) await recordResults(db, symbol, source, sum.quarters, marketDate, prev?.health?.score ?? null, health?.score ?? null, health?.periods?.at(-1) !== prev?.health?.periods?.at(-1));
  // First fetch: keep the latest quarter so the stock page can explain it. It is dated at its quarter
  // end, long past, so it never raises a "results are out" alert.
  // This has to be able to fire again on a later day: a fetch that came back with fewer than two
  // quarters — a thin response, a source hiccup — would otherwise leave the symbol permanently
  // without a results card, because `lastQuarterEnd` is set from the very first snapshot onwards.
  // recordResults is keyed on (symbol, quarter, source), so re-recording is a no-op.
  else if (sum.quarters.length >= 2 && !(await hasResults(db, symbol, source))) await recordResults(db, symbol, source, sum.quarters, latestQuarter!.quarterEnd, null, health?.score ?? null, false, true);

  const set = {
    metrics: { ...metrics, __healthOn: healthOn ?? null } as Record<string, number | null>,
    beta: bv.beta,
    vol1y: bv.vol,
    health,
    nextResultsDate: sum.nextResultsDate && sum.nextResultsDate >= marketDate ? sum.nextResultsDate : null,
    lastQuarterEnd: latestQuarter?.quarterEnd ?? prev?.lastQuarterEnd ?? null,
    quarterly: sum.quarters.slice(-6) as QuarterRow[],
    marketCap: sum.marketCap,
    fetchedAt: new Date(),
    status: "ok" as const,
  };
  await db
    .insert(schema.symbolSnapshots)
    .values({ symbol, tradeDate: marketDate, source, ...set })
    .onConflictDoUpdate({ target: [schema.symbolSnapshots.symbol, schema.symbolSnapshots.tradeDate, schema.symbolSnapshots.source], set });
  return { results: newResults };
}

/**
 * ETFs, mutual funds, REITs and gold have no company accounts: store the name and category, and
 * the beta and volatility from their own price history. No health score, results or metrics.
 */
async function collectFund(db: DB, provider: MarketDataProvider, symbol: string, assetClass: AssetClass, marketDate: string, source: string) {
  const item = catalogItem(symbol);
  const name = item?.name ?? (await provider.summary(symbol).catch(() => null))?.name ?? symbol;
  const row = { name, shortName: name, assetClass, category: item?.sub ?? null, isin: item?.isin ?? null, sector: null, industry: null, isFinancial: false, updatedAt: new Date() };
  await db.insert(schema.instruments).values({ symbol, ...row }).onConflictDoUpdate({ target: schema.instruments.symbol, set: row });
  const hist = await priceHistory(db, [symbol, NIFTY], [source], shiftDate(marketDate, -400));
  const bv = hist.get(symbol) && hist.get(NIFTY) ? betaAndVol(hist.get(symbol)!, hist.get(NIFTY)!) : { beta: null, vol: null };
  const set = { beta: bv.beta, vol1y: bv.vol, health: null, fetchedAt: new Date(), status: "ok" as const };
  await db.update(schema.symbolSnapshots).set(set).where(and(eq(schema.symbolSnapshots.symbol, symbol), eq(schema.symbolSnapshots.tradeDate, marketDate), eq(schema.symbolSnapshots.source, source)));
  return { results: false };
}

async function recordResults(db: DB, symbol: string, source: string, quarters: QuarterRow[], detectedOn: string, healthBefore: number | null, healthAfter: number | null, annualHealthUpdated: boolean, backfilled = false) {
  const cur = quarters.at(-1)!;
  const prevQ = quarters.at(-2) ?? null;
  const yearAgo = quarters.find((q) => q.quarterEnd === shiftDate(cur.quarterEnd, -365) || q.quarterEnd.slice(5) === cur.quarterEnd.slice(5) && Number(q.quarterEnd.slice(0, 4)) === Number(cur.quarterEnd.slice(0, 4)) - 1) ?? null;
  const data: ResultsData = { current: cur, previous: prevQ, yearAgo, annualHealthUpdated, ...(backfilled ? { backfilled } : {}) };
  await db.insert(schema.resultsEvents).values({ id: randomUUID(), symbol, source, quarterEnd: cur.quarterEnd, detectedOn, data, healthBefore, healthAfter }).onConflictDoNothing();
}

/** Has anything ever been recorded for this symbol from this source? */
async function hasResults(db: DB, symbol: string, source: string) {
  const [row] = await db.select({ id: schema.resultsEvents.id }).from(schema.resultsEvents).where(and(eq(schema.resultsEvents.symbol, symbol), eq(schema.resultsEvents.source, source))).limit(1);
  return !!row;
}

const daysSince = (iso?: string) => (iso ? (Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000 : Infinity);

/** Runs collectSymbol over `symbols[cursor..]` until the deadline. */
export async function collectBatch(db: DB, provider: MarketDataProvider, symbols: string[], cursor: number, marketDate: string, deadline: number, source = "live") {
  const limiter = new Limiter(Number(process.env.PIPELINE_CONCURRENCY) || 4);
  const breaker = new CircuitBreaker(5);
  const stats = { processed: 0, failed: 0, results: 0, stale: [] as string[], circuitOpen: false };
  let next = cursor;
  while (next < symbols.length && Date.now() < deadline && !breaker.open) {
    const batch = symbols.slice(next, next + 8);
    await Promise.all(
      batch.map((s) =>
        limiter.run(async () => {
          try {
            const r = await breaker.run(() => collectSymbol(db, provider, s, marketDate, source));
            stats.processed++;
            if (r.results) stats.results++;
          } catch (e) {
            stats.failed++;
            stats.stale.push(s);
            if (!(e instanceof CircuitOpenError)) logger.warn({ symbol: s, err: String((e as Error)?.message ?? e).slice(0, 200) }, "collect failed");
            await db.update(schema.symbolSnapshots).set({ status: "stale" }).where(and(eq(schema.symbolSnapshots.symbol, s), eq(schema.symbolSnapshots.tradeDate, marketDate), eq(schema.symbolSnapshots.source, source)));
          }
        }),
      ),
    );
    next += batch.length;
  }
  stats.circuitOpen = breaker.open;
  return { next, done: next >= symbols.length, ...stats };
}

/** Every symbol any real (non-demo) user holds or watches, plus the market indices. */
export async function liveUniverse(db: DB): Promise<string[]> {
  const held = await db
    .selectDistinct({ s: schema.holdings.symbol })
    .from(schema.holdings)
    .innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId))
    .innerJoin(schema.users, eq(schema.users.id, schema.portfolios.userId))
    .where(eq(schema.users.isDemo, false));
  const watched = await db.selectDistinct({ s: schema.watching.symbol }).from(schema.watching).innerJoin(schema.users, eq(schema.users.id, schema.watching.userId)).where(eq(schema.users.isDemo, false));
  return [...new Set([...held, ...watched].map((r) => r.s))].filter((s) => !isManualSymbol(s)).sort();
}

/** Symbols with no live snapshot yet (newly imported) — fetched once right away instead of waiting for tonight. */
export async function missingLive(db: DB, symbols: string[]): Promise<string[]> {
  symbols = symbols.filter((s) => !isManualSymbol(s));
  if (!symbols.length) return [];
  const have = await db.selectDistinct({ s: schema.symbolSnapshots.symbol }).from(schema.symbolSnapshots).where(and(inArray(schema.symbolSnapshots.symbol, symbols), eq(schema.symbolSnapshots.source, "live")));
  const set = new Set(have.map((h) => h.s));
  return symbols.filter((s) => !set.has(s));
}
