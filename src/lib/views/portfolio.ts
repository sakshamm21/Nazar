import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/lib/db";
import { correlationMatrix, topByWeight, trendLabel, valuationVsPeers } from "@/lib/analytics/models";
import { attributionLine, marketSplitLine } from "@/lib/portfolio/words";
import { groupOf, isManualSymbol, manualValue } from "@/lib/instruments/asset-classes";
import { NIFTY } from "@/lib/instruments/sectors";
import { loadPortfolioDay, displayName } from "@/lib/market/portfolio-day";
import { dateSources, latestTradeDate, priceHistory, shiftDate, sourcesFor } from "@/lib/market/store";
import { buildPerformance } from "@/lib/portfolio/performance";
import { financialYear, unrealisedParts } from "@/lib/portfolio/capital-gains";
import { incomeForPortfolios } from "@/lib/repo/income";
import { amfiCategory } from "@/lib/instruments/catalog";
import { lotRemaining } from "@/lib/portfolio/lots";
import { lotsForPortfolios } from "@/lib/repo/lots";
import type { Lot } from "@/lib/portfolio/lots";
import { recentSplits } from "@/lib/pipeline/corporate-actions";
import { salesForPortfolio, salesForUser } from "@/lib/repo/sales";
import { assetAllocation, attribution, betaOf, concentration, diversification, diversificationScore, healthRollup, sectorAllocation, stressTest, valuation, weights, xirrVsNifty, type HoldingState } from "@/lib/portfolio/math";
import { listPortfolios, listWatching } from "@/lib/repo/portfolios";
import { logger } from "@/lib/logger";

type User = typeof schema.users.$inferSelect;
type HoldingRow = typeof schema.holdings.$inferSelect;

/** The id that stands for every portfolio at once. */
export const ALL = "all";
/** The portfolio a view is about: one of the user's, or all of them together. */
export type ActivePortfolio = { id: string; name: string; isDefault: boolean; combined?: boolean };

/**
 * Every portfolio's holdings as one: the same symbol in two portfolios is one position (units added,
 * average weighted, every purchase kept), so a stock is never counted, charted or weighted twice.
 */
export function mergeHoldings(rows: HoldingRow[], lots: Map<string, Lot[]>) {
  const bySymbol = new Map<string, HoldingRow[]>();
  for (const r of rows) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), r]);
  const out: HoldingRow[] = [];
  const outLots = new Map<string, Lot[]>();
  for (const [symbol, group] of bySymbol) {
    if (group.length === 1) {
      out.push(group[0]);
      outLots.set(group[0].id, lots.get(group[0].id) ?? []);
      continue;
    }
    const quantity = group.reduce((a, r) => a + r.quantity, 0);
    const cost = group.reduce((a, r) => a + r.quantity * r.avgPrice, 0);
    const dates = group.map((r) => r.buyDate).filter((d): d is string => !!d).sort();
    const id = `${ALL}:${symbol}`;
    out.push({ ...group[0], id, quantity, avgPrice: quantity ? cost / quantity : 0, buyDate: dates[0] ?? null });
    outLots.set(id, group.flatMap((r) => lots.get(r.id) ?? []));
  }
  return { rows: out, lots: outLots };
}

export type Note = { id: string; kind: "results" | "concentration" | "upcoming" | "stale" | "cluster" | "split"; title: string; body: string; href: string };

/**
 * Everything the Home "Portfolio X-ray" shows, computed from stored snapshots (never from Yahoo):
 * value, today's move and why (H2), P&L, XIRR vs Nifty, health rings, attention list (H1/H4/H5),
 * hidden-risk summary (H3), sectors and one card per holding.
 */
export async function buildPortfolioView(user: User, portfolioId?: string | null) {
  const db = await getDb();
  const sources = sourcesFor(user);
  // Queries that do not depend on each other are sent together. Each is a network round trip to
  // the database, and one after another they were most of what a portfolio answer waited for.
  const [portfolios, tradeDate, watching] = await Promise.all([listPortfolios(user.id), latestTradeDate(db, sources), listWatching(user.id)]);
  // Nothing picked on this device: the portfolio the person chose to open on.
  portfolioId ??= user.prefs?.defaultPortfolio ?? null;
  // With two or more portfolios, "All" is a choice of its own, and the one shown when none was picked.
  const combined = portfolios.length >= 2 && (portfolioId === ALL || !portfolios.some((p) => p.id === portfolioId));
  const active: ActivePortfolio | null = combined
    ? { id: ALL, name: "All portfolios", isDefault: false, combined: true }
    : ((portfolios.find((p) => p.id === portfolioId) ?? portfolios.find((p) => p.isDefault) ?? portfolios[0] ?? null) as ActivePortfolio | null);
  const base = { user, portfolios, active, tradeDate, sources, watchingCount: watching.length };
  if (!active || !tradeDate) return { ...base, empty: true as const };

  const ids = combined ? portfolios.map((p) => p.id) : [active.id];
  const [ownRows, ownLots, sales, income] = await Promise.all([
    db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, ids)),
    lotsForPortfolios(ids),
    combined ? salesForUser(user.id) : salesForPortfolio(active.id),
    incomeForPortfolios(ids),
  ]);
  const { rows: holdingsRows, lots: lotsByHolding } = combined ? mergeHoldings(ownRows, ownLots) : { rows: ownRows, lots: ownLots };
  if (!holdingsRows.length) return { ...base, empty: true as const };

  const symbols = holdingsRows.map((h) => h.symbol).filter((s) => !isManualSymbol(s));
  const [day, hist, peerSnaps] = await Promise.all([
    loadPortfolioDay(db, holdingsRows, tradeDate, sources),
    priceHistory(db, [...symbols, NIFTY], sources, shiftDate(tradeDate, -400), tradeDate),
    // Valuation vs peers: P/E against other same-sector stocks Nazar tracks on this date.
    db
      .select({ symbol: schema.symbolSnapshots.symbol, metrics: schema.symbolSnapshots.metrics, sector: schema.instruments.sector, industry: schema.instruments.industry })
      .from(schema.symbolSnapshots)
      .innerJoin(schema.instruments, eq(schema.instruments.symbol, schema.symbolSnapshots.symbol))
      .where(and(eq(schema.symbolSnapshots.tradeDate, tradeDate), inArray(schema.symbolSnapshots.source, dateSources(sources)))),
  ]);
  const states: HoldingState[] = day.holdings;
  const v = valuation(states);
  const w = weights(states);
  const attr = attribution(states, day.niftyPct);
  const nifty = hist.get(NIFTY) ?? new Map<string, number>();
  const niftyOn = (d: string) => {
    let best: number | null = null;
    for (const [k, c] of nifty) {
      if (k <= d) best = c;
      else break;
    }
    return best ?? [...nifty.values()][0] ?? null;
  };
  // Each purchase and each sale placed on its own day, so a SIP or a later sale is counted when it happened.
  const lotsBySymbol = new Map(holdingsRows.map((r) => [r.symbol, lotsByHolding.get(r.id) ?? []]));
  // Money that came back: sales (with the purchases they used), and dividends and interest.
  const saleFlows = [...sales.map((s) => ({ date: s.date, amount: s.units * s.price, parts: s.parts })), ...income.map((x) => ({ date: x.date, amount: x.amount }))];
  const xirr = xirrVsNifty(states, new Date(`${tradeDate}T10:00:00Z`), niftyOn, nifty.get(tradeDate) ?? [...nifty.values()].at(-1) ?? null, { lots: lotsBySymbol, sales: saleFlows });
  const health = healthRollup(states);
  const stress10 = stressTest(states, -0.1);

  // Correlation clusters over the last year of daily returns (H3b). Capped to the largest
  // positions: correlation is quadratic, and what decides the portfolio's behaviour is the money.
  const withHist = topByWeight(symbols.filter((s) => (hist.get(s)?.size ?? 0) > 60), (s) => w.get(s) ?? 0);
  let div: ReturnType<typeof diversification> | null = null;
  if (withHist.length >= 2) {
    try {
      const cm = correlationMatrix(withHist.map((s) => new Map([...hist.get(s)!].slice(-253))));
      div = diversification(states.filter((h) => withHist.includes(h.symbol)), withHist, cm.matrix, 0.5);
    } catch (e) {
      // Not a reason to fail the page: the view simply reports no clustering. Logged so a genuine
      // data problem is visible instead of silently disappearing into a null.
      logger.warn({ err: String((e as Error)?.message ?? e).slice(0, 200), symbols: withHist.length }, "correlation clustering skipped");
      div = null;
    }
  }
  const conc = concentration(states);
  const inner = diversificationScore(div?.effectiveBets ?? null, conc.topStock?.weight ?? null, stress10.portfolioBeta);

  const cards = day.holdings
    .map((h) => {
      const value = h.quantity * (h.price ?? h.avgPrice);
      const invested = h.quantity * h.avgPrice;
      const closes = [...(hist.get(h.symbol)?.values() ?? [])];
      const peers = peerSnaps.filter((p) => p.symbol !== h.symbol && p.industry && p.industry === h.industry).map((p) => p.metrics?.trailingPE);
      const sparkline = closes.slice(-30);
      return {
        symbol: h.symbol,
        name: h.name,
        assetClass: h.assetClass,
        category: h.category,
        /** Deposits, property and the like have no detail page. */
        href: isManualSymbol(h.symbol) ? null : `/stock/${encodeURIComponent(h.symbol)}`,
        sector: h.sectorLabel,
        quantity: h.quantity,
        avgPrice: h.avgPrice,
        price: h.price,
        changePct: h.changePct,
        dayImpact: h.price != null && h.prevClose != null ? h.quantity * (h.price - h.prevClose) : null,
        value,
        weight: w.get(h.symbol) ?? 0,
        pnl: value - invested,
        pnlPct: invested ? value / invested - 1 : null,
        health: h.health,
        healthKind: h.snapshot?.health?.kind ?? "none",
        beta: h.beta,
        trend: trendLabel(closes),
        valuation: valuationVsPeers(h.snapshot?.metrics?.trailingPE, peers),
        stale: h.stale,
        pending: h.pending,
        nextResultsDate: h.nextResultsDate,
        results: h.results,
        sparkline,
      };
    })
    .sort((a, b) => b.value - a.value);

  // The value of today's holdings on each past session, and why it changed over each period.
  const dates = [...nifty.keys()].filter((d) => d <= tradeDate);
  if (dates.at(-1) !== tradeDate) dates.push(tradeDate);
  const rowOf = new Map(holdingsRows.map((r) => [r.symbol, r]));
  const perfHoldings = day.holdings.map((h) => {
      const row = rowOf.get(h.symbol)!;
      const manual = isManualSymbol(h.symbol);
      return {
        symbol: h.symbol,
        name: h.name,
        group: groupOf(h.assetClass),
        quantity: h.quantity,
        avgPrice: h.avgPrice,
        price: h.price,
        prevClose: h.prevClose,
        beta: betaOf(h),
        pending: h.pending,
        closes: manual ? null : [...(hist.get(h.symbol)?.entries() ?? [])],
        valueOn: manual ? (d: string) => manualValue(row.assetClass, row.details, row.avgPrice, d) : undefined,
      };
    });
  const performance = buildPerformance(perfHoldings, dates, nifty);

  // Capital gains: the gains sitting in the portfolio, one part per purchase still held, so a
  // holding topped up recently is part short-term and part long-term. Dated by the trade date, the
  // day in India, rather than the server clock.
  const dayBySymbol = new Map(day.holdings.map((h) => [h.symbol, h]));
  const gains = unrealisedParts(
    holdingsRows
      .filter((h) => !isManualSymbol(h.symbol))
      .map((h) => {
        const state = dayBySymbol.get(h.symbol);
        const assetClass = state?.assetClass ?? h.assetClass;
        const held = (lotsByHolding.get(h.id) ?? []).filter((l) => lotRemaining(l) > 0);
        return {
          symbol: h.symbol,
          name: state?.name ?? displayName(h.symbol),
          assetClass,
          category: assetClass === "mf" ? amfiCategory(h.symbol) : (state?.category ?? null),
          price: state?.price ?? null,
          // A holding with no ledger yet is one purchase at its average price.
          lots: held.length ? held.map((l) => ({ units: lotRemaining(l), price: l.price, date: l.date })) : [{ units: h.quantity, price: h.avgPrice, date: h.buyDate }],
        };
      }),
    tradeDate,
  );

  return {
    ...base,
    empty: false as const,
    asOf: day.asOf,
    /** When Nazar last fetched a price for anything in this portfolio. */
    checkedAt: day.holdings.reduce<Date | null>((a, h) => (h.snapshot?.fetchedAt && (!a || h.snapshot.fetchedAt > a) ? h.snapshot.fetchedAt : a), null),
    niftyPct: day.niftyPct,
    gains,
    sales,
    income,
    returns: returnsSummary(v.unrealised, sales, income, tradeDate),
    taxSlabPct: user.prefs?.taxSlabPct ?? null,
    valuation: v,
    attribution: attr,
    h2: { line: attributionLine(attr), split: marketSplitLine(attr) },
    xirr,
    health,
    innerRing: inner,
    risk: { portfolioBeta: stress10.portfolioBeta, stress10: { loss: stress10.loss, lossPct: stress10.lossPct }, diversification: div, concentration: conc },
    sectors: sectorAllocation(states.filter((h) => (h.assetClass ?? "stock") === "stock")),
    allocation: assetAllocation(states),
    performance,
    cards,
    /** Each holding as the portfolio maths sees it, for a scenario worked out on request. */
    states,
    notes: [...splitNotes(await recentSplits(db, symbols, shiftDate(tradeDate, -30)), day, holdingsRows), ...notesFor(tradeDate, day, conc, div)],
    staleCount: cards.filter((c) => c.stale).length,
    /** Each holding as the value history sees it, and the dates, for comparisons built on top. */
    perf: { holdings: perfHoldings, dates },
    /** The closes already read for this portfolio, so a page can reuse them instead of re-querying. */
    history: hist,
  };
}

export type PortfolioView = Awaited<ReturnType<typeof buildPortfolioView>>;
export type FullPortfolioView = Extract<PortfolioView, { empty: false }>;

/**
 * The view, computed at most once per request per portfolio. A single page can ask for it more than
 * once — /risk renders it and then re-reads price history for its correlation table — and each call
 * otherwise reads 400 days of closes and recomputes clustering, XIRR and the stress tests.
 */
export const portfolioView = cache(async (user: User, portfolioId?: string | null) => buildPortfolioView(user, portfolioId));

/** Things worth knowing about the portfolio right now: results, hidden clusters, concentration, old prices. */
/**
 * What the money has made, three ways: gains still in the portfolio, gains already taken by selling,
 * and income paid out, each in total and for this financial year (April to March).
 */
export function returnsSummary(unrealised: number, sales: { units: number; price: number; cost: number; date: string }[], income: { amount: number; date: string }[], today: string) {
  const fy = financialYear(today);
  const inYear = (d: string) => d >= fy.from && d <= fy.to;
  const realisedOf = (xs: typeof sales) => xs.reduce((a, s) => a + s.units * s.price - s.cost, 0);
  const incomeOf = (xs: typeof income) => xs.reduce((a, x) => a + x.amount, 0);
  const realised = realisedOf(sales), paid = incomeOf(income);
  return {
    fy: fy.label,
    unrealised,
    realised,
    realisedThisYear: realisedOf(sales.filter((s) => inYear(s.date))),
    income: paid,
    incomeThisYear: incomeOf(income.filter((x) => inYear(x.date))),
    total: unrealised + realised + paid,
    sales: sales.length,
  };
}

/** A split or bonus issue in the last month on something held: what it did to the share count. */
function splitNotes(splits: Awaited<ReturnType<typeof recentSplits>>, day: Awaited<ReturnType<typeof loadPortfolioDay>>, rows: (typeof schema.holdings.$inferSelect)[]): Note[] {
  return splits.map((s) => {
    const name = day.holdings.find((h) => h.symbol === s.symbol)?.name ?? displayName(s.symbol);
    const units = rows.find((r) => r.symbol === s.symbol)?.quantity;
    const ratio = s.ratio >= 1 ? `1:${+s.ratio.toFixed(2)}` : `${+(1 / s.ratio).toFixed(2)}:1`;
    const when = new Date(`${s.exDate}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
    return {
      id: `split-${s.symbol}-${s.exDate}`,
      kind: "split" as const,
      title: `${name} ${s.ratio >= 1 ? "split" : "consolidated"} its shares ${ratio}`,
      body: `From ${when}, each share became ${+s.ratio.toFixed(4)}.${units != null && s.holdingsAdjusted ? ` Nazar adjusted your holding to ${units.toLocaleString("en-IN", { maximumFractionDigits: 3 })} shares at the new price; what you paid is unchanged.` : ""}`,
      href: `/stock/${encodeURIComponent(s.symbol)}`,
    };
  });
}

function notesFor(tradeDate: string, day: Awaited<ReturnType<typeof loadPortfolioDay>>, conc: ReturnType<typeof concentration>, div: ReturnType<typeof diversification> | null): Note[] {
  const items: Note[] = [];
  for (const h of day.holdings) {
    if (!h.results || h.results.detectedOn < shiftDate(tradeDate, -7)) continue;
    items.push({ id: `results-${h.symbol}`, kind: "results", title: `${h.name} reported results`, body: "See what improved and what got worse in the quarter.", href: `/stock/${encodeURIComponent(h.symbol)}#results` });
  }
  const cl = div?.clusters[0];
  if (cl && cl.symbols.length >= 3 && cl.weight >= 0.25) {
    const names = cl.symbols.map((s) => day.holdings.find((h) => h.symbol === s)?.name ?? s);
    items.push({ id: "cluster", kind: "cluster", title: "Less diversified than it looks", body: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} tend to move together: ${Math.round(cl.weight * 100)}% of your money behaves like one bet.`, href: "/risk" });
  }
  for (const f of conc.flags.filter((x) => x.kind !== "top3").slice(0, 2))
    items.push({ id: `conc-${f.label}`, kind: "concentration", title: `${f.label} is ${Math.round(f.weight * 100)}% of this portfolio`, body: "One company or sector's news now moves a large part of your money.", href: "/risk" });
  const soon = day.holdings.filter((h) => h.nextResultsDate && h.nextResultsDate > tradeDate && h.nextResultsDate <= shiftDate(tradeDate, 14)).sort((a, b) => a.nextResultsDate!.localeCompare(b.nextResultsDate!));
  if (soon.length) items.push({ id: "upcoming", kind: "upcoming", title: `${soon.length === 1 ? `${soon[0].name} reports` : `${soon.length} of your companies report`} results soon`, body: soon.map((h) => `${h.name} (${new Date(`${h.nextResultsDate}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })})`).join(", "), href: `/stock/${encodeURIComponent(soon[0].symbol)}` });
  const pending = day.holdings.filter((h) => h.pending);
  if (pending.length)
    items.push({ id: "pending", kind: "stale", title: `${pending.length === 1 ? "1 fund has" : `${pending.length} funds have`} not published today's NAV yet`, body: `${pending.map((h) => h.name).slice(0, 3).join(", ")}${pending.length > 3 ? ` and ${pending.length - 3} more` : ""} ${pending.length === 1 ? "shows" : "show"} the previous NAV and no move for today until the evening's NAV is out.`, href: "/portfolio" });
  const stale = day.holdings.filter((h) => h.stale);
  if (stale.length) items.push({ id: "stale", kind: "stale", title: `${stale.length} ${stale.length === 1 ? "price is" : "prices are"} from an earlier day`, body: `Nazar couldn't refresh ${stale.map((h) => h.name).slice(0, 3).join(", ")} in the last check. Values use the last known price.`, href: "/portfolio?tab=manage" });
  return items;
}
