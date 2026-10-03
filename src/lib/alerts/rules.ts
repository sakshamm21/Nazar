/**
 * H1/H4 rule engine. Pure: takes one portfolio's day (holdings with today's and yesterday's
 * snapshot data, market moves, recent alerts) and returns alert candidates with stable dedupe keys.
 * The pipeline inserts them with `on conflict do nothing`, so re-runs never duplicate.
 */
import type { AlertData, AlertType, QuarterRow, Severity } from "@/lib/db/schema";
import { sectorOf } from "@/lib/instruments/sectors";
import { attribution, valuation, weights, type HoldingState } from "@/lib/portfolio/math";
import { classifyReason } from "./reason";
import type { EffectiveSettings } from "./thresholds";
import { concentrationText, digestText, healthChangeText, portfolioMoveText, priceTargetText, resultsPoints, resultsText, stockMoveText, upcomingText, type Bi } from "./templates";

export type DayHolding = HoldingState & {
  changePct: number | null;
  industry: string | null;
  sectorRaw: string | null;
  healthPrev: number | null;
  altmanZone?: string | null;
  altmanZonePrev?: string | null;
  healthAnnualChanged?: boolean;
  nextResultsDate: string | null;
  results: { id: string; quarterEnd: string; detectedOn: string; current: QuarterRow; previous: QuarterRow | null; yearAgo: QuarterRow | null; healthBefore: number | null; healthAfter: number | null; annualHealthUpdated: boolean } | null;
  prevWeight?: number | null;
};

export type DayInput = {
  tradeDate: string;
  portfolio: { id: string; ownerLabel: string | null };
  holdings: DayHolding[];
  niftyPct: number | null;
  sectorPct: Record<string, number | null>;
  /** Alerts for this portfolio in the last 30 days (for cooldowns). */
  recent: { type: AlertType; symbol: string | null; tradeDate: string }[];
  /** Days between tradeDate and an ISO date (calendar days). */
  priceTargets?: { id: string; symbol: string; direction: "above" | "below"; target: number; note: string | null }[];
};

export type Candidate = {
  type: AlertType;
  symbol: string | null;
  severity: Severity;
  dedupeKey: string;
  magnitude: number | null;
  title: Bi;
  body: Bi;
  data: AlertData;
};

const SEV_RANK: Record<Severity, number> = { critical: 0, important: 1, info: 2 };
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
export const MAX_ALERTS_PER_DAY = 5;

export function evaluate(day: DayInput, s: EffectiveSettings): Candidate[] {
  const out: Candidate[] = [];
  const v = valuation(day.holdings);
  const w = weights(day.holdings);
  const owner = day.portfolio.ownerLabel;
  const recentWithin = (type: AlertType, symbol: string | null, days: number) => day.recent.some((r) => r.type === type && r.symbol === symbol && daysBetween(r.tradeDate, day.tradeDate) < days);

  // 1. Big stock moves (H1)
  if (!s.muted.has("stock_move"))
    for (const h of day.holdings) {
      if (h.changePct == null || h.price == null || h.prevClose == null) continue;
      const movePct = Math.abs(h.changePct) * 100;
      if (movePct < s.stockMove) continue;
      const impact = h.quantity * (h.price - h.prevClose);
      if (v.value && Math.abs(impact) < s.materiality * v.value) continue;
      const sec = sectorOf(h.sectorRaw, h.industry);
      const sectorPct = sec.index ? (day.sectorPct[sec.index] ?? null) : null;
      const recentResults = !!h.results && daysBetween(h.results.detectedOn, day.tradeDate) <= 2;
      const reason = classifyReason({ stockPct: h.changePct, niftyPct: day.niftyPct, sectorPct, beta: h.beta, recentResults });
      const t = stockMoveText({ name: h.name, changePct: h.changePct, weight: w.get(h.symbol) ?? 0, impact, ownerLabel: owner, reason, niftyPct: day.niftyPct, sectorPct, sectorName: sec.label, sectorNameHi: sec.labelHi, sectorIndexName: sec.indexName });
      const critical = movePct >= 2 * s.stockMove || (v.value > 0 && Math.abs(impact) >= 0.01 * v.value);
      out.push({
        type: "stock_move",
        symbol: h.symbol,
        severity: critical ? "critical" : "important",
        dedupeKey: `${day.portfolio.id}:stock_move:${h.symbol}:${day.tradeDate}`,
        magnitude: movePct,
        title: t.title,
        body: t.body,
        data: { symbol: h.symbol, name: h.name, changePct: h.changePct, magnitude: movePct, impactInr: impact, weight: w.get(h.symbol) ?? 0, portfolioValue: v.value, reason: { kind: reason, marketPct: day.niftyPct, sectorPct, sectorName: sec.label }, resultsEventId: h.results?.id, why: t.why, impactText: t.impact },
      });
    }

  // 2. Whole-portfolio move (H1 + H2 line)
  if (!s.muted.has("portfolio_move") && v.dayChangePct != null && Math.abs(v.dayChangePct) * 100 >= s.portfolioMove) {
    const a = attribution(day.holdings, day.niftyPct);
    const t = portfolioMoveText({ attribution: a, ownerLabel: owner });
    const mag = Math.abs(v.dayChangePct) * 100;
    out.push({
      type: "portfolio_move",
      symbol: null,
      severity: mag >= 2 * s.portfolioMove ? "critical" : "important",
      dedupeKey: `${day.portfolio.id}:portfolio_move:${day.tradeDate}`,
      magnitude: mag,
      title: t.title,
      body: t.body,
      data: { changePct: v.dayChangePct, magnitude: mag, impactInr: v.dayChange, portfolioValue: v.value, items: a.drivers.map((d) => ({ title: d.name, symbol: d.symbol })) },
    });
  }

  // 3. Results out (H4) — always on
  for (const h of day.holdings) {
    const r = h.results;
    if (!r || r.detectedOn !== day.tradeDate) continue;
    const pts = resultsPoints(r.current, r.previous, r.yearAgo);
    const t = resultsText({ name: h.name, quarterEnd: r.quarterEnd, points: pts, healthBefore: r.healthBefore, healthAfter: r.healthAfter, annualHealthUpdated: r.annualHealthUpdated });
    out.push({
      type: "results",
      symbol: h.symbol,
      severity: "important",
      dedupeKey: `${day.portfolio.id}:results:${h.symbol}:${r.quarterEnd}`,
      magnitude: null,
      title: t.title,
      body: t.body,
      data: { symbol: h.symbol, name: h.name, resultsEventId: r.id, healthBefore: r.healthBefore, healthAfter: r.healthAfter, improved: t.improved, worse: t.worse, healthText: t.health, quarterEnd: r.quarterEnd },
    });
  }

  // 4. Health score change (annual statements updated)
  if (!s.muted.has("health_change"))
    for (const h of day.holdings) {
      if (h.health == null || h.healthPrev == null || !h.healthAnnualChanged) continue;
      const zoneChanged = !!h.altmanZone && !!h.altmanZonePrev && h.altmanZone !== h.altmanZonePrev;
      const delta = Math.abs(h.health - h.healthPrev);
      // F-score steps are ~11 points on the 0–100 scale (60% × 1/9 × 100 ≈ 6.7 per test; use 6.5).
      const minDelta = s.fScoreDelta == null ? Infinity : s.fScoreDelta * 6.5;
      if (!zoneChanged && delta < minDelta) continue;
      const t = healthChangeText({ name: h.name, before: h.healthPrev, after: h.health, zoneBefore: h.altmanZonePrev, zoneAfter: h.altmanZone });
      out.push({
        type: "health_change",
        symbol: h.symbol,
        severity: h.altmanZone === "Distress" && zoneChanged ? "critical" : "important",
        dedupeKey: `${day.portfolio.id}:health_change:${h.symbol}:${day.tradeDate}`,
        magnitude: delta,
        title: t.title,
        body: t.body,
        data: { symbol: h.symbol, name: h.name, healthBefore: h.healthPrev, healthAfter: h.health },
      });
    }

  // 5. Concentration crossing (stock), with a 30-day cooldown against flapping
  if (!s.muted.has("concentration") && day.holdings.length > 1)
    for (const h of day.holdings) {
      const cur = w.get(h.symbol) ?? 0;
      const prev = h.prevWeight ?? 0;
      const limit = s.concentration / 100;
      if (cur < limit || prev >= limit || recentWithin("concentration", h.symbol, 30)) continue;
      const t = concentrationText({ label: h.name, weight: cur, limit: s.concentration, kind: "stock", ownerLabel: owner });
      out.push({
        type: "concentration",
        symbol: h.symbol,
        severity: "important",
        dedupeKey: `${day.portfolio.id}:concentration:${h.symbol}:${day.tradeDate}`,
        magnitude: cur * 100,
        title: t.title,
        body: t.body,
        data: { symbol: h.symbol, name: h.name, weight: cur, magnitude: cur * 100 },
      });
    }

  // 6. Results in the next few days (info)
  if (s.upcoming)
    for (const h of day.holdings) {
      if (!h.nextResultsDate) continue;
      const d = daysBetween(day.tradeDate, h.nextResultsDate);
      if (d < 1 || d > 4) continue;
      const t = upcomingText({ name: h.name, date: h.nextResultsDate });
      out.push({
        type: "results_upcoming",
        symbol: h.symbol,
        severity: "info",
        dedupeKey: `${day.portfolio.id}:results_upcoming:${h.symbol}:${h.nextResultsDate}`,
        magnitude: null,
        title: t.title,
        body: t.body,
        data: { symbol: h.symbol, name: h.name, date: h.nextResultsDate },
      });
    }

  // 7. Price levels the user set
  for (const p of day.priceTargets ?? []) {
    const h = day.holdings.find((x) => x.symbol === p.symbol);
    const price = h?.price;
    if (price == null) continue;
    if (p.direction === "above" ? price < p.target : price > p.target) continue;
    const t = priceTargetText({ name: h!.name, direction: p.direction, target: p.target, price, note: p.note });
    out.push({ type: "price_target", symbol: p.symbol, severity: "important", dedupeKey: `price_target:${p.id}`, magnitude: null, title: t.title, body: t.body, data: { symbol: p.symbol, name: h!.name, priceTargetId: p.id } });
  }

  return capDaily(out, day);
}

/** At most MAX_ALERTS_PER_DAY per portfolio per day; the rest roll into one digest alert. */
export function capDaily(cands: Candidate[], day: Pick<DayInput, "tradeDate" | "portfolio">): Candidate[] {
  const sorted = [...cands].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (b.magnitude ?? 0) - (a.magnitude ?? 0));
  if (sorted.length <= MAX_ALERTS_PER_DAY) return sorted;
  const keep = sorted.slice(0, MAX_ALERTS_PER_DAY - 1);
  const rest = sorted.slice(MAX_ALERTS_PER_DAY - 1);
  const t = digestText({ count: rest.length });
  keep.push({
    type: "digest",
    symbol: null,
    severity: "info",
    dedupeKey: `${day.portfolio.id}:digest:${day.tradeDate}`,
    magnitude: null,
    title: t.title,
    body: t.body,
    data: { items: rest.map((c) => ({ title: c.title.en, symbol: c.symbol ?? undefined })) },
  });
  return keep;
}
