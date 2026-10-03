import "server-only";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, like, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { marketProvider } from "@/lib/data/market";
import { istDate, type MarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol, isMfSymbol } from "@/lib/instruments/asset-classes";
import { classOfSymbol } from "@/lib/instruments/catalog";
import { NIFTY, SECTOR_INDICES } from "@/lib/instruments/sectors";
import { latestTradeDate, priceHistory, shiftDate, snapshotsAsOf } from "@/lib/market/store";
import { collectBatch, collectQuotes } from "@/lib/pipeline/collect";
import { logger } from "@/lib/logger";
import { HISTORY_DAYS, PERSONAS, PERSONA_SYMBOLS, PERSONA_VERSION, TEST_ACCOUNTS, TEST_PASSWORD, templateEmail, type Persona, type PersonaHolding } from "./config";

/**
 * Test accounts on live data. There is no captured or hand-written market data anywhere: a test
 * account is an ordinary account whose holdings are priced by the same sources, the same nightly
 * checkup and the same refresh-on-open as everyone else's.
 *
 * What makes them useful on day one is history. When a persona is first built, the real alert
 * engine is replayed over the last 45 real market sessions (from the price history the data
 * sources return), the persona's ratings are applied (small moves "not useful", big ones
 * "useful"), and the real tuner then raises the threshold. After that the nightly checkup keeps
 * adding real alerts like for any account.
 *
 * Because the accounts are shared, they are put back once a day: each one is wiped and copied
 * again from its persona's hidden template account.
 */

/** Wall-clock time for a session's checkup (4:47 PM IST). */
const checkupAt = (iso: string, minutes = 0) => new Date(new Date(`${iso}T11:17:00Z`).getTime() + minutes * 60_000);

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/** One row records when the accounts were last put back (kind "maintenance"). */
async function marker(db: DB) {
  const [r] = await db.select().from(schema.pipelineRuns).where(eq(schema.pipelineRuns.kind, "maintenance")).orderBy(desc(schema.pipelineRuns.startedAt)).limit(1);
  return r ?? null;
}

export type EnsureResult = { today: string; rebuilt: boolean; built?: string[]; reason?: string };

/**
 * Makes sure the test accounts exist and are in their starting state. Runs at most once a day
 * (build, first local start, and the nightly maintenance job all call it); `force` runs it now.
 */
export async function ensureTestAccounts(db: DB, opts: { force?: boolean; provider?: MarketDataProvider; now?: Date; budgetMs?: number } = {}): Promise<EnsureResult> {
  const today = istDate(opts.now ?? new Date());
  const m = await marker(db);
  // Already done today, for the personas as they are now defined.
  if (!opts.force && m?.runDate === today && m.status === "done" && m.stage === "accounts" && (m.stats as { version?: string })?.version === PERSONA_VERSION) return { today, rebuilt: false };
  // Personas or rules changed since the templates were built: replay their history again.
  const outdated = Boolean(m) && (m!.stats as { version?: string })?.version !== PERSONA_VERSION;
  // Claim the run so two instances don't rebuild at once.
  const lockedUntil = new Date(Date.now() + 300_000);
  if (m) {
    const claimed = await db
      .update(schema.pipelineRuns)
      .set({ status: "running", stage: "accounts", lockedUntil })
      .where(and(eq(schema.pipelineRuns.id, m.id), sql`(${schema.pipelineRuns.lockedUntil} is null or ${schema.pipelineRuns.lockedUntil} < now())`))
      .returning({ id: schema.pipelineRuns.id });
    if (!claimed.length) return { today, rebuilt: false, reason: "busy" };
  } else {
    const ins = await db.insert(schema.pipelineRuns).values({ id: randomUUID(), kind: "maintenance", runDate: today, stage: "accounts", status: "running", lockedUntil }).onConflictDoNothing().returning({ id: schema.pipelineRuns.id });
    if (!ins.length) return { today, rebuilt: false, reason: "busy" };
  }
  const finish = (status: "done" | "failed", stats: Record<string, unknown>) =>
    db.update(schema.pipelineRuns).set({ runDate: today, status, stage: "accounts", lockedUntil: null, finishedAt: new Date(), stats }).where(eq(schema.pipelineRuns.kind, "maintenance"));

  const t0 = Date.now();
  try {
    await removeCapturedData(db);
    const date = await ensureMarket(db, opts.provider ?? marketProvider, Date.now() + (opts.budgetMs ?? 150_000));
    const built: string[] = [];
    if (date) {
      await backfillSessions(db, date);
      for (const persona of Object.values(PERSONAS)) if (await buildTemplate(db, persona, date, Boolean(opts.force) || outdated)) built.push(persona.id);
    }
    await resetAccounts(db);
    // Without market data the personas can't be built: leave the run open so the next call retries.
    await finish(date ? "done" : "failed", { ms: Date.now() - t0, built, date, version: PERSONA_VERSION });
    logger.info({ today, date, built, ms: Date.now() - t0 }, "test accounts ready");
    return { today, rebuilt: true, built, reason: date ? undefined : "no market data" };
  } catch (e) {
    await finish("failed", { error: String((e as Error)?.message ?? e).slice(0, 300) });
    throw e;
  }
}

/** One-time clean-up of the old captured demo: its prices, its anonymous visitor accounts and its template. */
async function removeCapturedData(db: DB) {
  await db.update(schema.users).set({ isDemo: false, demoExpiresAt: null }).where(inArray(schema.users.email, TEST_ACCOUNTS.map((a) => a.email)));
  await db.delete(schema.users).where(eq(schema.users.isDemo, true));
  for (const t of [schema.priceDaily, schema.symbolSnapshots, schema.resultsEvents]) await db.delete(t).where(eq(t.source, "demo"));
}

/* ------------------------------------------------------------------ */
/* Live market data for the personas' symbols                          */
/* ------------------------------------------------------------------ */

/**
 * Fetches whatever the personas hold that Nazar doesn't have yet: today's quotes for everything,
 * then history, profile and health for symbols seen for the first time (the same collect the
 * nightly checkup runs). Returns the market's latest session, or null when the sources are unreachable.
 */
async function ensureMarket(db: DB, provider: MarketDataProvider, deadline: number): Promise<string | null> {
  const indices = [NIFTY, ...SECTOR_INDICES];
  const q = await collectQuotes(db, provider, [...indices, ...PERSONA_SYMBOLS], "live").catch((e) => {
    logger.warn({ err: String((e as Error)?.message ?? e).slice(0, 200) }, "test accounts: quotes failed");
    return null;
  });
  const date = q?.marketDate ?? (await latestTradeDate(db, ["live"]));
  if (!date) return null;
  const counts = await db
    .select({ s: schema.priceDaily.symbol, n: sql<number>`count(*)::int` })
    .from(schema.priceDaily)
    .where(and(inArray(schema.priceDaily.symbol, [...indices, ...PERSONA_SYMBOLS]), eq(schema.priceDaily.source, "live")))
    .groupBy(schema.priceDaily.symbol);
  const have = new Map(counts.map((c) => [c.s, Number(c.n)]));
  const known = new Set((await db.select({ s: schema.instruments.symbol }).from(schema.instruments).where(inArray(schema.instruments.symbol, PERSONA_SYMBOLS))).map((r) => r.s));
  // Indices first: every beta is measured against stored Nifty history.
  const needIndices = indices.filter((s) => (have.get(s) ?? 0) < 150);
  const need = PERSONA_SYMBOLS.filter((s) => (have.get(s) ?? 0) < 150 || !known.has(s));
  if (needIndices.length) await collectBatch(db, provider, needIndices, 0, date, deadline, "live");
  if (need.length) {
    const r = await collectBatch(db, provider, need, 0, date, deadline, "live");
    if (!r.done || r.failed) logger.warn({ need: need.length, processed: r.processed, failed: r.failed }, "test accounts: some symbols still missing");
  }
  return date;
}

/** The last trading sessions up to `date`, oldest first (the Nifty's own trading days). */
async function sessionsUpTo(db: DB, date: string, n: number): Promise<string[]> {
  const rows = await db
    .select({ d: schema.priceDaily.date })
    .from(schema.priceDaily)
    .where(and(eq(schema.priceDaily.symbol, NIFTY), eq(schema.priceDaily.source, "live"), sql`${schema.priceDaily.date} <= ${date}`))
    .orderBy(desc(schema.priceDaily.date))
    .limit(n);
  return rows.map((r) => r.d).reverse();
}

/**
 * The nightly checkup stores one snapshot per symbol per session. For sessions before Nazar started
 * tracking a symbol those are missing, so they are written here from the real closing prices in
 * its history. Beta, health and metrics are the latest known ones; sessions that already have a
 * snapshot are left alone.
 */
async function backfillSessions(db: DB, date: string) {
  const sessions = await sessionsUpTo(db, date, HISTORY_DAYS + 1);
  if (sessions.length < 2) return;
  const all = [NIFTY, ...SECTOR_INDICES, ...PERSONA_SYMBOLS];
  const [hist, latest] = await Promise.all([priceHistory(db, all, ["live"], shiftDate(sessions[0], -10), date), snapshotsAsOf(db, all, date, ["live"])]);
  const rows: (typeof schema.symbolSnapshots.$inferInsert)[] = [];
  for (const symbol of all) {
    const bars = [...(hist.get(symbol) ?? [])];
    const last = latest.get(symbol);
    if (bars.length < 2) continue;
    let i = 0, close: number | null = null;
    for (const d of sessions) {
      const prev: number | null = close; // what it was worth at the previous session
      // The latest close on or before this session (a fund has no NAV on some market days).
      while (i < bars.length && bars[i][0] <= d) close = bars[i++][1];
      if (close == null || prev == null) continue;
      rows.push({
        symbol, tradeDate: d, source: "live", price: close, prevClose: prev, changePct: prev ? close / prev - 1 : null,
        marketCap: last?.marketCap ?? null, metrics: last?.metrics ?? {}, beta: last?.beta ?? null, vol1y: last?.vol1y ?? null, health: last?.health ?? null,
        nextResultsDate: last?.nextResultsDate && last.nextResultsDate >= d ? last.nextResultsDate : null, lastQuarterEnd: last?.lastQuarterEnd ?? null, quarterly: last?.quarterly ?? null,
        asOf: checkupAt(d, -77), fetchedAt: checkupAt(d), status: "ok",
      });
    }
  }
  await chunked(rows, 200, (c) => db.insert(schema.symbolSnapshots).values(c).onConflictDoNothing());
}

/* ------------------------------------------------------------------ */
/* Personas                                                            */
/* ------------------------------------------------------------------ */

const unitsFor = (symbol: string, value: number, price: number) => {
  const raw = value / price;
  if (isMfSymbol(symbol)) return Math.round(raw * 1000) / 1000;
  if (isCryptoSymbol(symbol)) return Math.round(raw * 1e5) / 1e5; // coins are held in fractions
  return Math.max(1, Math.round(raw));
};

/**
 * Turns "about ₹X of this, bought over the last N days" into a quantity, an average price and a
 * first-purchase date, using the real price history. The persona bought gradually, so the average
 * sits at a typical (35th-percentile) price of that window, and the first day at or below it is the
 * buy date. Prices are real; only the persona's entry points are invented.
 */
function holdingsFor(list: PersonaHolding[], hist: Map<string, Map<string, number>>) {
  return list.flatMap((h, i) => {
    const bars = [...(hist.get(h.symbol) ?? [])];
    if (bars.length < 20) return []; // not fetched yet: the next run adds it
    const last = bars.at(-1)![1];
    const from = bars.findIndex(([d]) => d >= shiftDate(bars.at(-1)![0], -h.daysAgo));
    const window = bars.slice(Math.max(0, from), -8);
    const target = [...window].map(([, c]) => c).sort((a, b) => a - b)[Math.floor(window.length * 0.35)] ?? last;
    const buy = window.find(([, c]) => c <= target) ?? bars[Math.max(0, from)];
    const avgPrice = Math.round(target * (1 + ((i % 3) + 1) * 0.004) * 100) / 100;
    return [{ symbol: h.symbol, assetClass: classOfSymbol(h.symbol) ?? ("stock" as const), quantity: unitsFor(h.symbol, h.value, last), avgPrice, buyDate: buy[0] }];
  });
}

/** Builds a persona's hidden template account, replaying the alert engine over recent real sessions. */
async function buildTemplate(db: DB, persona: Persona, date: string, force: boolean): Promise<boolean> {
  const email = templateEmail(persona.id);
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing && !force) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.holdings).innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId)).where(eq(schema.portfolios.userId, existing.id));
    const wanted = persona.portfolios.reduce((a, p) => a + p.holdings.length + p.manual.length, 0);
    if (Number(n) >= wanted) return false; // complete: the nightly checkup keeps it current
  }
  const sessions = await sessionsUpTo(db, date, HISTORY_DAYS + 1);
  const symbols = [...new Set(persona.portfolios.flatMap((p) => p.holdings.map((h) => h.symbol)))];
  const hist = await priceHistory(db, symbols, ["live"], shiftDate(date, -400), date);

  await db.delete(schema.users).where(eq(schema.users.email, email));
  const userId = randomUUID();
  await db.insert(schema.users).values({ id: userId, email, name: "Template", isTestAccount: true, emailVerifiedAt: new Date(), createdAt: checkupAt(shiftDate(date, -90)) });
  for (const [i, p] of persona.portfolios.entries()) {
    const portfolioId = randomUUID();
    await db.insert(schema.portfolios).values({ id: portfolioId, userId, name: p.name, ownerLabel: p.ownerLabel, language: p.language, isDefault: i === 0, sortOrder: i });
    const market = holdingsFor(p.holdings, hist).map((h) => ({ id: randomUUID(), portfolioId, source: "manual" as const, ...h }));
    const manual = p.manual.map((m) => {
      const id = randomUUID();
      return {
        id, portfolioId, symbol: `MANUAL:${id.toUpperCase()}`, assetClass: m.assetClass, quantity: 1, avgPrice: m.invested, buyDate: shiftDate(date, -m.startDaysAgo), rawName: m.name, source: "manual" as const,
        details: { value: m.value, valueAsOf: shiftDate(date, -m.valueDaysAgo), ratePct: m.ratePct ?? null, maturityDate: m.maturesInDays ? shiftDate(date, m.maturesInDays) : null },
      };
    });
    if (market.length + manual.length) await db.insert(schema.holdings).values([...market, ...manual]);
    if (p.recipient) await db.insert(schema.recipients).values({ id: randomUUID(), userId, portfolioId, email: p.recipient, confirmedAt: checkupAt(shiftDate(date, -70)) });
  }
  if (persona.watching.length) await db.insert(schema.watching).values(persona.watching.map((symbol) => ({ userId, symbol })));
  // History starts on "everything" so small moves alert; the replayed ratings then teach the tuner.
  await db.insert(schema.alertSettings).values({ userId, sensitivity: "everything", emailDigest: false, quietMode: false });

  const { evaluateUser, runTuner } = await import("@/lib/pipeline/evaluate");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const tuneIndex = sessions.length - 8;
  let smallCount = 0;
  for (let i = 1; i < sessions.length; i++) {
    const d = sessions[i];
    const created = await evaluateUser(user, { date: d, sources: ["live"], news: false, tune: false, createdAt: checkupAt(d) });
    if (i < sessions.length - 1) smallCount += await rateReplayed(db, userId, created.created, d, smallCount);
    if (i === tuneIndex) await runTuner(userId, "everything", d, checkupAt(d, 600));
  }
  // Older alerts read; the last two sessions stay unread.
  await db.execute(sql`update alert_events set read_at = created_at + interval '2 hours' where user_id = ${userId} and trade_date < ${sessions.at(-2) ?? date}`);

  // Weekly reports for the last two completed weeks.
  const { generateWeekly } = await import("@/lib/reports/generate");
  const fridays = sessions.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5 && shiftDate(d, 2) < date).slice(-2);
  const pfs = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, userId)).orderBy(asc(schema.portfolios.sortOrder));
  for (const f of fridays) for (const p of pfs) await generateWeekly(user, p, f, ["live"], new Date(`${shiftDate(f, 2)}T03:00:00Z`));
  return true;
}

/** Deterministic ratings for replayed alerts: small moves mostly "not useful", big moves and results "useful". */
async function rateReplayed(db: DB, userId: string, ids: string[], date: string, smallSoFar: number) {
  if (!ids.length) return 0;
  const alerts = await db.select().from(schema.alertEvents).where(inArray(schema.alertEvents.id, ids));
  let small = 0;
  for (const a of alerts) {
    let rating: "up" | "down" | null = null;
    if (a.type === "stock_move") {
      const m = Number(a.data.magnitude ?? 0);
      if (m < 5) {
        rating = (smallSoFar + small) % 5 === 3 ? "up" : "down";
        small++;
      } else rating = "up";
    } else if (a.type === "portfolio_move") {
      // Whole-portfolio wiggles under 2% felt like noise to this persona; bigger days were useful.
      rating = Number(a.data.magnitude ?? 0) < 2 ? ((smallSoFar + small) % 4 === 1 ? "up" : "down") : "up";
    } else if (["results", "health_change", "concentration"].includes(a.type)) rating = "up";
    if (rating) await db.insert(schema.alertFeedback).values({ alertId: a.id, userId, rating, source: "app", createdAt: checkupAt(date, 900) }).onConflictDoNothing();
  }
  return small;
}

/**
 * Copies template `T` into `userId` with fresh ids (md5 of old id + new user keeps references
 * consistent without temp tables). A handful of INSERT … SELECT statements: fast on Neon's HTTP driver.
 */
export async function cloneTemplate(db: DB, T: string, userId: string) {
  const U = userId;
  const nid = (col: string) => sql.raw(`(md5(${col} || ':' || '${U.replace(/'/g, "")}'))::uuid::text`);
  await db.execute(sql`insert into portfolios (id, user_id, name, owner_label, language, alerts_enabled, is_default, sort_order, created_at)
    select ${nid("id")}, ${U}, name, owner_label, language, alerts_enabled, is_default, sort_order, created_at from portfolios where user_id = ${T}`);
  await db.execute(sql`insert into holdings (id, portfolio_id, symbol, asset_class, quantity, avg_price, buy_date, isin, raw_name, details, source, created_at, updated_at)
    select ${nid("h.id")}, ${nid("h.portfolio_id")}, case when h.symbol like 'MANUAL:%' then 'MANUAL:' || upper(${nid("h.id")}) else h.symbol end, h.asset_class, h.quantity, h.avg_price, h.buy_date, h.isin, h.raw_name, h.details, h.source, h.created_at, h.updated_at
    from holdings h join portfolios p on p.id = h.portfolio_id where p.user_id = ${T}`);
  await db.execute(sql`insert into watching (user_id, symbol, added_at) select ${U}, symbol, added_at from watching where user_id = ${T}`);
  await db.execute(sql`insert into recipients (id, user_id, portfolio_id, email, confirmed_at, unsubscribed_at, created_at)
    select ${nid("id")}, ${U}, ${nid("portfolio_id")}, email, confirmed_at, unsubscribed_at, created_at from recipients where user_id = ${T}`);
  await db.execute(sql`insert into alert_settings (user_id, sensitivity, quiet_mode, email_digest, updated_at) select ${U}, sensitivity, quiet_mode, false, updated_at from alert_settings where user_id = ${T}`);
  await db.execute(sql`insert into alert_thresholds (user_id, alert_type, value, muted, source, frozen_until, updated_at) select ${U}, alert_type, value, muted, source, frozen_until, updated_at from alert_thresholds where user_id = ${T}`);
  await db.execute(sql`insert into threshold_changes (id, user_id, alert_type, old_value, new_value, muted, evidence, message_en, message_hi, created_at, undone_at)
    select ${nid("id")}, ${U}, alert_type, old_value, new_value, muted, evidence, message_en, message_hi, created_at, undone_at from threshold_changes where user_id = ${T}`);
  await db.execute(sql`insert into alert_events (id, user_id, portfolio_id, type, symbol, severity, trade_date, dedupe_key, title_en, body_en, title_hi, body_hi, data, is_simulated, created_at, read_at)
    select ${nid("a.id")}, ${U}, case when a.portfolio_id is null then null else ${nid("a.portfolio_id")} end, a.type, a.symbol, a.severity, a.trade_date,
      case when a.portfolio_id is null then a.dedupe_key else replace(a.dedupe_key, a.portfolio_id, ${nid("a.portfolio_id")}) end, a.title_en, a.body_en, a.title_hi, a.body_hi,
      case when a.data ? 'thresholdChangeId' then jsonb_set(a.data, '{thresholdChangeId}', to_jsonb(${nid("(a.data->>'thresholdChangeId')")})) else a.data end,
      a.is_simulated, a.created_at, a.read_at from alert_events a where a.user_id = ${T} and a.is_simulated = false`);
  await db.execute(sql`insert into alert_feedback (alert_id, user_id, rating, source, created_at)
    select ${nid("alert_id")}, ${U}, rating, source, created_at from alert_feedback where user_id = ${T}`);
  await db.execute(sql`insert into reports (id, user_id, portfolio_id, week_start, week_end, content, created_at)
    select ${nid("id")}, ${U}, ${nid("portfolio_id")}, week_start, week_end, content, created_at from reports where user_id = ${T}`);
}

/** Wipes a user's own data (keeps the account). */
async function wipeUserData(db: DB, userId: string) {
  await db.delete(schema.alertEvents).where(eq(schema.alertEvents.userId, userId));
  await db.delete(schema.thresholdChanges).where(eq(schema.thresholdChanges.userId, userId));
  await db.delete(schema.alertThresholds).where(eq(schema.alertThresholds.userId, userId));
  await db.delete(schema.alertSettings).where(eq(schema.alertSettings.userId, userId));
  await db.delete(schema.watching).where(eq(schema.watching.userId, userId));
  await db.delete(schema.portfolios).where(eq(schema.portfolios.userId, userId));
  await db.delete(schema.priceTargets).where(eq(schema.priceTargets.userId, userId));
  await db.delete(schema.chats).where(eq(schema.chats.userId, userId));
  await db.update(schema.users).set({ simState: null }).where(eq(schema.users.id, userId));
  await db.execute(sql`delete from symbol_snapshots where source = ${`sim:${userId}`}`);
  await db.execute(sql`delete from price_daily where source = ${`sim:${userId}`}`);
}

/** Puts every test account back: wiped, then copied from its persona's template (or left empty). */
async function resetAccounts(db: DB) {
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  for (const acc of TEST_ACCOUNTS) {
    let [u] = await db.select().from(schema.users).where(eq(schema.users.email, acc.email)).limit(1);
    if (!u) {
      await db.insert(schema.users).values({ id: randomUUID(), email: acc.email, name: acc.name, passwordHash: hash, emailVerifiedAt: new Date(), isTestAccount: true });
      [u] = await db.select().from(schema.users).where(eq(schema.users.email, acc.email)).limit(1);
    } else {
      await db.update(schema.users).set({ name: acc.name, passwordHash: hash, emailVerifiedAt: u.emailVerifiedAt ?? new Date(), isTestAccount: true, isDemo: false, demoExpiresAt: null, tourCompletedAt: null }).where(eq(schema.users.id, u.id));
    }
    await wipeUserData(db, u.id);
    const [template] = acc.persona ? await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, templateEmail(acc.persona))).limit(1) : [];
    if (template) await cloneTemplate(db, template.id, u.id);
    // Their addresses are made up, so nothing is ever emailed.
    else await db.insert(schema.alertSettings).values({ userId: u.id, emailDigest: false }).onConflictDoNothing();
  }
  // A template keeps collecting real alerts every night; keep roughly four months of them.
  const templates = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "template+%@nazar.internal"));
  if (templates.length) await db.delete(schema.alertEvents).where(and(inArray(schema.alertEvents.userId, templates.map((t) => t.id)), lt(schema.alertEvents.tradeDate, shiftDate(istDate(new Date()), -120))));
}

/** An isolated copy of a persona's data under a new account. Nothing in the app creates one; tests use it to check that copies never share state. */
export async function createCopy(db: DB, persona: Persona["id"]) {
  const [template] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, templateEmail(persona))).limit(1);
  if (!template) throw new Error("Persona template missing");
  const id = randomUUID();
  await db.insert(schema.users).values({ id, email: `copy-${id}@nazar.internal`, name: "Copy", isTestAccount: true, emailVerifiedAt: new Date() });
  await cloneTemplate(db, template.id, id);
  return id;
}
