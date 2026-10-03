import "server-only";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { correlationMatrix, trendLabel, valuationVsPeers } from "@/lib/analytics/models";
import { attributionLine, marketSplitLine } from "@/lib/alerts/templates";
import { effectiveSettings } from "@/lib/alerts/thresholds";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { NIFTY } from "@/lib/instruments/sectors";
import { loadPortfolioDay } from "@/lib/market/portfolio-day";
import { dateSources, latestTradeDate, priceHistory, shiftDate, sourcesFor } from "@/lib/market/store";
import { assetAllocation, attribution, concentration, diversification, diversificationScore, healthRollup, sectorAllocation, stressTest, valuation, weights, xirrVsNifty, type HoldingState } from "@/lib/portfolio/math";
import { getSettings, getThresholds, listThresholdChanges, unreadCount } from "@/lib/repo/alerts";
import { listPortfolios, listWatching } from "@/lib/repo/portfolios";

type User = typeof schema.users.$inferSelect;

export type AttentionItem = {
  id: string;
  kind: "alert" | "results" | "learned" | "concentration" | "upcoming" | "stale" | "cluster" | "simulated";
  severity: "critical" | "important" | "info";
  title: string;
  body: string;
  href: string;
  meta?: string;
};

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
  const base = { user, portfolios, active, tradeDate, sources, watchingCount: watching.length, simulated: user.simState ?? null };
  if (!active || !tradeDate) return { ...base, empty: true as const, unread: await unreadCount(user.id) };

  const holdingsRows = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, active.id));
  if (!holdingsRows.length) return { ...base, empty: true as const, unread: await unreadCount(user.id) };

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

  const attention = await attentionItems(user, active.id, tradeDate, day, conc, div);
  const settings = await getSettings(user.id);
  const eff = effectiveSettings(settings.sensitivity, await getThresholds(user.id));

  return {
    ...base,
    empty: false as const,
    unread: await unreadCount(user.id),
    asOf: day.asOf,
    niftyPct: day.niftyPct,
    valuation: v,
    attribution: attr,
    h2: { line: attributionLine(attr, active.ownerLabel), split: marketSplitLine(attr) },
    xirr,
    health,
    innerRing: inner,
    risk: { portfolioBeta: stress10.portfolioBeta, stress10: { loss: stress10.loss, lossPct: stress10.lossPct }, diversification: div, concentration: conc },
    sectors: sectorAllocation(states.filter((h) => (h.assetClass ?? "stock") === "stock")),
    allocation: assetAllocation(states),
    cards,
    attention,
    staleCount: cards.filter((c) => c.stale).length,
    thresholds: { stockMove: eff.stockMove, sensitivity: settings.sensitivity },
  };
}

export type PortfolioView = Awaited<ReturnType<typeof buildPortfolioView>>;
export type FullPortfolioView = Extract<PortfolioView, { empty: false }>;

async function attentionItems(user: User, portfolioId: string, tradeDate: string, day: Awaited<ReturnType<typeof loadPortfolioDay>>, conc: ReturnType<typeof concentration>, div: ReturnType<typeof diversification> | null): Promise<AttentionItem[]> {
  const db = await getDb();
  const items: AttentionItem[] = [];
  const hi = false; // Home is English; Hindi shows on alert cards for Hindi portfolios.

  // Today's (or the simulated day's) important alerts for this portfolio.
  const recent = await db
    .select()
    .from(schema.alertEvents)
    .where(and(eq(schema.alertEvents.userId, user.id), eq(schema.alertEvents.portfolioId, portfolioId), gte(schema.alertEvents.tradeDate, shiftDate(tradeDate, -1)), isNull(schema.alertEvents.readAt)))
    .orderBy(desc(schema.alertEvents.tradeDate), desc(schema.alertEvents.createdAt))
    .limit(8);
  for (const a of recent.filter((x) => x.type !== "results" && x.severity !== "info").slice(0, 3))
    items.push({ id: a.id, kind: a.isSimulated ? "simulated" : "alert", severity: a.severity, title: hi ? a.titleHi : a.titleEn, body: hi ? a.bodyHi : a.bodyEn, href: `/alerts/${a.id}` });

  // H4: results reported in the last few sessions.
  for (const h of day.holdings) {
    if (!h.results || h.results.detectedOn < shiftDate(tradeDate, -4)) continue;
    const alert = recent.find((a) => a.type === "results" && a.symbol === h.symbol);
    items.push({ id: `results-${h.symbol}`, kind: "results", severity: "important", title: `${h.name} reported results`, body: alert?.bodyEn ?? "See what improved and what got worse.", href: `/stock/${encodeURIComponent(h.symbol)}#results`, meta: h.results.detectedOn });
  }

  // H5: a recent learned-threshold change (with Undo in Settings).
  const [change] = (await listThresholdChanges(user.id)).filter((c) => !c.undoneAt && Date.now() - c.createdAt.getTime() < 21 * 86400000);
  if (change) items.push({ id: `learned-${change.id}`, kind: "learned", severity: "info", title: "Nazar adjusted your alerts", body: change.messageEn, href: "/settings#learned" });

  // H3: hidden cluster and concentration.
  const cl = div?.clusters[0];
  if (cl && cl.symbols.length >= 3 && cl.weight >= 0.25) {
    const names = cl.symbols.map((s) => day.holdings.find((h) => h.symbol === s)?.name ?? s);
    items.push({ id: "cluster", kind: "cluster", severity: "info", title: "Less diversified than it looks", body: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} tend to move together: ${Math.round(cl.weight * 100)}% of your money behaves like one bet.`, href: "/risk" });
  }
  for (const f of conc.flags.filter((x) => x.kind !== "top3").slice(0, 1))
    items.push({ id: `conc-${f.label}`, kind: "concentration", severity: "info", title: `${f.label} is ${Math.round(f.weight * 100)}% of this portfolio`, body: "One company or sector's news now moves a large part of your money.", href: "/risk" });

  // Upcoming results in the next 7 days.
  const soon = day.holdings.filter((h) => h.nextResultsDate && h.nextResultsDate > tradeDate && h.nextResultsDate <= shiftDate(tradeDate, 7)).sort((a, b) => a.nextResultsDate!.localeCompare(b.nextResultsDate!));
  if (soon.length) items.push({ id: "upcoming", kind: "upcoming", severity: "info", title: `${soon.length === 1 ? `${soon[0].name} reports` : `${soon.length} holdings report`} results this week`, body: soon.map((h) => `${h.name} (${new Date(`${h.nextResultsDate}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })})`).join(", "), href: `/stock/${encodeURIComponent(soon[0].symbol)}` });

  const stale = day.holdings.filter((h) => h.stale);
  if (stale.length) items.push({ id: "stale", kind: "stale", severity: "info", title: `${stale.length} ${stale.length === 1 ? "price is" : "prices are"} from an earlier day`, body: `Nazar couldn't refresh ${stale.map((h) => h.name).slice(0, 3).join(", ")} in the last check. Values use the last known price.`, href: "/portfolio" });
  return items;
}
