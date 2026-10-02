/**
 * Portfolio maths: valuation, P&L, XIRR vs Nifty, H2 attribution, H3 stress test / clusters /
 * concentration, and the health rollup. Pure functions over plain data, unit-tested.
 */
import { round, xirr } from "@/lib/analytics/stats";

export type HoldingState = {
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgPrice: number;
  buyDate: string | null;
  price: number | null;
  prevClose: number | null;
  beta: number | null;
  health: number | null;
  isFinancial?: boolean;
};

const valueOf = (h: HoldingState) => h.quantity * (h.price ?? h.prevClose ?? h.avgPrice);
const prevValueOf = (h: HoldingState) => h.quantity * (h.prevClose ?? h.price ?? h.avgPrice);

/* ------------------------------------------------------------------ */
/* Valuation and P&L                                                    */
/* ------------------------------------------------------------------ */

export function valuation(holdings: HoldingState[]) {
  const value = holdings.reduce((a, h) => a + valueOf(h), 0);
  const prev = holdings.reduce((a, h) => a + prevValueOf(h), 0);
  const invested = holdings.reduce((a, h) => a + h.quantity * h.avgPrice, 0);
  const priced = holdings.filter((h) => h.price != null).length;
  return {
    value,
    invested,
    unrealised: value - invested,
    unrealisedPct: invested ? value / invested - 1 : null,
    dayChange: value - prev,
    dayChangePct: prev ? value / prev - 1 : null,
    priced,
    total: holdings.length,
  };
}

export function weights(holdings: HoldingState[]): Map<string, number> {
  const total = holdings.reduce((a, h) => a + valueOf(h), 0);
  return new Map(holdings.map((h) => [h.symbol, total ? valueOf(h) / total : 0]));
}

/* ------------------------------------------------------------------ */
/* H2: why did my portfolio move today?                                 */
/* ------------------------------------------------------------------ */

export type Attribution = {
  total: number;
  totalPct: number | null;
  kind: "down" | "up" | "flat" | "none";
  /** The smallest set (max 3) moving with the total that explains ≥ 60% of it. */
  drivers: { symbol: string; name: string; amount: number }[];
  driversSum: number;
  /** On mixed days: the biggest holding moving against the total. */
  offset: { symbol: string; name: string; amount: number } | null;
  breakdown: { symbol: string; name: string; amount: number; pct: number | null; marketPart: number; specificPart: number; weight: number }[];
  marketPart: number;
  specificPart: number;
  niftyPct: number | null;
};

export function attribution(holdings: HoldingState[], niftyPct: number | null, flatThreshold = 0.001): Attribution {
  const v = valuation(holdings);
  const w = weights(holdings);
  const rows = holdings
    .map((h) => {
      const amount = h.price != null && h.prevClose != null ? h.quantity * (h.price - h.prevClose) : 0;
      const prevVal = prevValueOf(h);
      const b = adjustedBeta(h.beta);
      const marketPart = niftyPct != null ? prevVal * b * niftyPct : 0;
      return { symbol: h.symbol, name: h.name, amount, pct: h.prevClose && h.price != null ? h.price / h.prevClose - 1 : null, marketPart, specificPart: amount - marketPart, weight: w.get(h.symbol) ?? 0 };
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const total = v.dayChange;
  const base = { total, totalPct: v.dayChangePct, breakdown: rows, marketPart: rows.reduce((a, r) => a + r.marketPart, 0), specificPart: rows.reduce((a, r) => a + r.specificPart, 0), niftyPct };
  if (!holdings.length || v.priced === 0) return { ...base, kind: "none", drivers: [], driversSum: 0, offset: null };
  if (v.dayChangePct == null || Math.abs(v.dayChangePct) < flatThreshold) return { ...base, kind: "flat", drivers: [], driversSum: 0, offset: null };
  const sign = Math.sign(total);
  const withMove = rows.filter((r) => Math.sign(r.amount) === sign);
  const drivers: { symbol: string; name: string; amount: number }[] = [];
  let sum = 0;
  for (const r of withMove) {
    if (drivers.length >= 3) break;
    drivers.push({ symbol: r.symbol, name: r.name, amount: r.amount });
    sum += r.amount;
    if (Math.abs(sum) >= 0.6 * Math.abs(total)) break;
  }
  const against = rows.find((r) => Math.sign(r.amount) === -sign && Math.abs(r.amount) >= 0.25 * Math.abs(total));
  return { ...base, kind: sign < 0 ? "down" : "up", drivers, driversSum: sum, offset: against ? { symbol: against.symbol, name: against.name, amount: against.amount } : null };
}

/* ------------------------------------------------------------------ */
/* XIRR vs Nifty (public-market equivalent)                             */
/* ------------------------------------------------------------------ */

/**
 * Money-weighted return on holdings that have a buy date, and what the same rupees would have
 * returned in the Nifty 50 bought on the same dates. Holdings without a buy date are excluded
 * (coverage is reported so the UI can say so).
 */
export function xirrVsNifty(holdings: HoldingState[], today: Date, niftyOn: (date: string) => number | null, niftyNow: number | null) {
  const dated = holdings.filter((h) => h.buyDate && h.price != null);
  const coverage = holdings.length ? dated.length / holdings.length : 0;
  if (!dated.length) return { xirr: null, niftyXirr: null, coverage, dated: 0 };
  const flows = dated.map((h) => ({ date: new Date(h.buyDate!), amount: -h.quantity * h.avgPrice }));
  const value = dated.reduce((a, h) => a + h.quantity * h.price!, 0);
  const mine = xirr([...flows, { date: today, amount: value }]);
  let niftyXirr: number | null = null;
  if (niftyNow) {
    let units = 0;
    let ok = true;
    for (const h of dated) {
      const p = niftyOn(h.buyDate!);
      if (!p) { ok = false; break; }
      units += (h.quantity * h.avgPrice) / p;
    }
    if (ok) niftyXirr = xirr([...flows, { date: today, amount: units * niftyNow }]);
  }
  return { xirr: round(mine), niftyXirr: round(niftyXirr), coverage, dated: dated.length };
}

/* ------------------------------------------------------------------ */
/* Health rollup (outer ring)                                           */
/* ------------------------------------------------------------------ */

export function healthRollup(holdings: HoldingState[]) {
  const w = weights(holdings);
  const scored = holdings.filter((h) => h.health != null);
  const wSum = scored.reduce((a, h) => a + (w.get(h.symbol) ?? 0), 0);
  const score = wSum ? scored.reduce((a, h) => a + (w.get(h.symbol) ?? 0) * h.health!, 0) / wSum : null;
  return { score: score == null ? null : Math.round(score), scored: scored.length, total: holdings.length, coverageByValue: round(wSum, 3) };
}

/* ------------------------------------------------------------------ */
/* H3a: stress test                                                     */
/* ------------------------------------------------------------------ */

/** Blume-adjusted beta (0.67β + 0.33), clamped to [0, 2.5]; unknown beta counts as 1. */
export function adjustedBeta(beta: number | null | undefined): number {
  if (beta == null || !Number.isFinite(beta)) return 1;
  return Math.min(2.5, Math.max(0, 0.67 * beta + 0.33));
}

export function stressTest(holdings: HoldingState[], niftyShock: number) {
  const v = valuation(holdings);
  const per = holdings
    .map((h) => {
      const val = valueOf(h);
      const b = adjustedBeta(h.beta);
      return { symbol: h.symbol, name: h.name, value: val, beta: b, betaKnown: h.beta != null, loss: val * b * niftyShock };
    })
    .sort((a, b) => a.loss - b.loss);
  const loss = per.reduce((a, r) => a + r.loss, 0);
  const portfolioBeta = v.value ? per.reduce((a, r) => a + r.value * r.beta, 0) / v.value : 1;
  return { shock: niftyShock, loss, lossPct: v.value ? loss / v.value : 0, valueAfter: v.value + loss, portfolioBeta: round(portfolioBeta, 2)!, perHolding: per, unknownBeta: per.filter((r) => !r.betaKnown).map((r) => r.symbol) };
}

/* ------------------------------------------------------------------ */
/* H3b: hidden clusters ("less diversified than it looks")              */
/* ------------------------------------------------------------------ */

/**
 * Average-linkage agglomerative clustering on correlation: repeatedly merge the two clusters with
 * the highest average pairwise correlation while it is ≥ threshold.
 */
export function correlationClusters(symbols: string[], matrix: (number | null)[][], threshold = 0.5): string[][] {
  let clusters = symbols.map((_, i) => [i]);
  const c = (i: number, j: number) => matrix[i]?.[j] ?? 0;
  const avg = (a: number[], b: number[]) => {
    let s = 0;
    for (const i of a) for (const j of b) s += c(i, j);
    return s / (a.length * b.length);
  };
  while (clusters.length > 1) {
    let best = -Infinity, bi = -1, bj = -1;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const a = avg(clusters[i], clusters[j]);
        if (a > best) { best = a; bi = i; bj = j; }
      }
    if (best < threshold) break;
    clusters = clusters.filter((_, k) => k !== bi && k !== bj).concat([[...clusters[bi], ...clusters[bj]]]);
  }
  return clusters.map((cl) => cl.map((i) => symbols[i]));
}

/**
 * Effective number of independent bets = 1 / (wᵀ C w) with correlation matrix C.
 * All independent (C = I) → 1 / Σw² (inverse Herfindahl); all perfectly correlated → 1.
 */
export function effectiveBets(w: number[], matrix: (number | null)[][]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) s += w[i] * w[j] * (i === j ? 1 : (matrix[i]?.[j] ?? 0));
  return s > 0 ? 1 / s : w.length;
}

export function diversification(holdings: HoldingState[], symbols: string[], matrix: (number | null)[][], threshold = 0.5) {
  const w = weights(holdings);
  const ws = symbols.map((s) => w.get(s) ?? 0);
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  const norm = ws.map((x) => x / total);
  const clusters = correlationClusters(symbols, matrix, threshold)
    .filter((cl) => cl.length >= 2)
    .map((cl) => {
      const idx = cl.map((s) => symbols.indexOf(s));
      let pairs = 0, sum = 0;
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) { sum += matrix[idx[a]]?.[idx[b]] ?? 0; pairs++; }
      return { symbols: cl, weight: cl.reduce((a, s) => a + (w.get(s) ?? 0), 0), avgCorrelation: round(pairs ? sum / pairs : 0, 2)! };
    })
    .sort((a, b) => b.weight - a.weight);
  return { clusters, effectiveBets: round(effectiveBets(norm, matrix), 1)!, holdings: symbols.length };
}

/* ------------------------------------------------------------------ */
/* H3c: concentration                                                   */
/* ------------------------------------------------------------------ */

export function sectorAllocation(holdings: HoldingState[]) {
  const total = holdings.reduce((a, h) => a + valueOf(h), 0) || 1;
  const m = new Map<string, number>();
  for (const h of holdings) m.set(h.sector ?? "Other", (m.get(h.sector ?? "Other") ?? 0) + valueOf(h));
  return [...m.entries()].map(([sector, value]) => ({ sector, value, weight: value / total })).sort((a, b) => b.value - a.value);
}

export function concentration(holdings: HoldingState[], limits = { stock: 0.25, sector: 0.4, top3: 0.6 }) {
  const w = [...weights(holdings).entries()].sort((a, b) => b[1] - a[1]);
  const sectors = sectorAllocation(holdings);
  const hhi = w.reduce((a, [, x]) => a + x * x, 0);
  const top3 = w.slice(0, 3).reduce((a, [, x]) => a + x, 0);
  const name = (s: string) => holdings.find((h) => h.symbol === s)?.name ?? s;
  return {
    topStock: w[0] ? { symbol: w[0][0], name: name(w[0][0]), weight: w[0][1] } : null,
    top3,
    hhi: round(hhi, 4)!,
    sectors,
    flags: [
      ...w.filter(([, x]) => x >= limits.stock).map(([s, x]) => ({ kind: "stock" as const, label: name(s), weight: x, limit: limits.stock })),
      ...sectors.filter((s) => s.weight >= limits.sector && s.sector !== "Other").map((s) => ({ kind: "sector" as const, label: s.sector, weight: s.weight, limit: limits.sector })),
      ...(top3 >= limits.top3 && holdings.length > 3 ? [{ kind: "top3" as const, label: "Top 3 holdings", weight: top3, limit: limits.top3 }] : []),
    ],
  };
}

/**
 * Inner ring (0–100): diversification and risk. 50% effective bets (8+ independent bets = full),
 * 30% concentration (largest position; ≤10% = full, ≥40% = none), 20% market sensitivity
 * (portfolio beta ≤1 = full, ≥1.6 = none).
 */
export function diversificationScore(effBets: number | null, topWeight: number | null, portfolioBeta: number | null): number | null {
  if (effBets == null && topWeight == null) return null;
  const a = effBets == null ? 0.5 : Math.min(1, Math.max(0, (effBets - 1) / 7));
  const b = topWeight == null ? 0.5 : Math.min(1, Math.max(0, (0.4 - topWeight) / 0.3));
  const c = portfolioBeta == null ? 0.5 : Math.min(1, Math.max(0, (1.6 - portfolioBeta) / 0.6));
  return Math.round(100 * (0.5 * a + 0.3 * b + 0.2 * c));
}
