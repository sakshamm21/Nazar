import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { correlationMatrix, trendLabel, valuationVsPeers } from "@/lib/analytics/models";
import { attributionLine, marketSplitLine } from "@/lib/portfolio/words";
import { groupOf, isManualSymbol, manualValue } from "@/lib/instruments/asset-classes";
import { NIFTY } from "@/lib/instruments/sectors";
import { loadPortfolioDay } from "@/lib/market/portfolio-day";
import { dateSources, latestTradeDate, priceHistory, shiftDate, sourcesFor } from "@/lib/market/store";
import { buildPerformance } from "@/lib/portfolio/performance";
import { assetAllocation, attribution, betaOf, concentration, diversification, diversificationScore, healthRollup, sectorAllocation, stressTest, valuation, weights, xirrVsNifty, type HoldingState } from "@/lib/portfolio/math";
import { listPortfolios, listWatching } from "@/lib/repo/portfolios";

type User = typeof schema.users.$inferSelect;

export type Note = { id: string; kind: "results" | "concentration" | "upcoming" | "stale" | "cluster"; title: string; body: string; href: string };

/**
 * Everything the Home "Portfolio X-ray" shows, computed from stored snapshots (never from Yahoo):
 * value, today's move and why (H2), P&L, XIRR vs Nifty, health rings, attention list (H1/H4/H5),
 * hidden-risk summary (H3), sectors and one card per holding.
 */
export async function buildPortfolioView(user: User, portfolioId?: string | null) {
  const db = await getDb();
  const sources = sourcesFor(user);
  const portfolios = await listPortfolios(user.id);
  const active = portfolios.find((p) => p.id === portfolioId) ?? portfolios.find((p) => p.isDefault) ?? portfolios[0] ?? null;
  const tradeDate = await latestTradeDate(db, sources);
  const watching = await listWatching(user.id);
  const base = { user, portfolios, active, tradeDate, sources, watchingCount: watching.length };
  if (!active || !tradeDate) return { ...base, empty: true as const };

  const holdingsRows = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, active.id));
  if (!holdingsRows.length) return { ...base, empty: true as const };

  const day = await loadPortfolioDay(db, holdingsRows, tradeDate, sources);
  const states: HoldingState[] = day.holdings;
  const v = valuation(states);
  const w = weights(states);
  const attr = attribution(states, day.niftyPct);
  const symbols = holdingsRows.map((h) => h.symbol).filter((s) => !isManualSymbol(s));
  const hist = await priceHistory(db, [...symbols, NIFTY], sources, shiftDate(tradeDate, -400), tradeDate);
  const nifty = hist.get(NIFTY) ?? new Map<string, number>();
  const niftyOn = (d: string) => {
    let best: number | null = null;
    for (const [k, c] of nifty) {
      if (k <= d) best = c;
      else break;
    }
    return best ?? [...nifty.values()][0] ?? null;
  };
  const xirr = xirrVsNifty(states, new Date(`${tradeDate}T10:00:00Z`), niftyOn, nifty.get(tradeDate) ?? [...nifty.values()].at(-1) ?? null);
  const health = healthRollup(states);
  const stress10 = stressTest(states, -0.1);

  // Correlation clusters over the last year of daily returns (H3b).
  const withHist = symbols.filter((s) => (hist.get(s)?.size ?? 0) > 60);
  let div: ReturnType<typeof diversification> | null = null;
  if (withHist.length >= 2) {
    try {
      const cm = correlationMatrix(withHist.map((s) => new Map([...hist.get(s)!].slice(-253))));
      div = diversification(states.filter((h) => withHist.includes(h.symbol)), withHist, cm.matrix, 0.5);
    } catch {
      div = null;
    }
  }
  const conc = concentration(states);
  const inner = diversificationScore(div?.effectiveBets ?? null, conc.topStock?.weight ?? null, stress10.portfolioBeta);

  // Valuation vs peers: P/E against other same-sector stocks Nazar tracks on this date.
  const peerSnaps = await db
    .select({ symbol: schema.symbolSnapshots.symbol, metrics: schema.symbolSnapshots.metrics, sector: schema.instruments.sector, industry: schema.instruments.industry })
    .from(schema.symbolSnapshots)
    .innerJoin(schema.instruments, eq(schema.instruments.symbol, schema.symbolSnapshots.symbol))
    .where(and(eq(schema.symbolSnapshots.tradeDate, tradeDate), inArray(schema.symbolSnapshots.source, dateSources(sources))));

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
  const performance = buildPerformance(
    day.holdings.map((h) => {
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
        closes: manual ? null : [...(hist.get(h.symbol)?.entries() ?? [])],
        valueOn: manual ? (d: string) => manualValue(row.assetClass, row.details, row.avgPrice, d) : undefined,
      };
    }),
    dates,
    nifty,
  );


  return {
    ...base,
    empty: false as const,
    asOf: day.asOf,
    niftyPct: day.niftyPct,
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
    notes: notesFor(tradeDate, day, conc, div),
    staleCount: cards.filter((c) => c.stale).length,
  };
}

export type PortfolioView = Awaited<ReturnType<typeof buildPortfolioView>>;
export type FullPortfolioView = Extract<PortfolioView, { empty: false }>;

/** Things worth knowing about the portfolio right now: results, hidden clusters, concentration, old prices. */
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
  const stale = day.holdings.filter((h) => h.stale);
  if (stale.length) items.push({ id: "stale", kind: "stale", title: `${stale.length} ${stale.length === 1 ? "price is" : "prices are"} from an earlier day`, body: `Nazar couldn't refresh ${stale.map((h) => h.name).slice(0, 3).join(", ")} in the last check. Values use the last known price.`, href: "/portfolio?tab=manage" });
  return items;
}
