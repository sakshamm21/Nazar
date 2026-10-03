/**
 * How a portfolio did over a period, and why: the value of today's holdings on each past day,
 * each holding's share of the change, the part the market alone would explain, and the swings on
 * the way. Pure functions over plain data, unit-tested.
 *
 * The history is "what you hold today, priced on each past day". Purchases and sales along the
 * way are not replayed (Nazar keeps one lot per holding), and every screen that uses this says so.
 */
import { absPct, dayLabel, inr, signedPct } from "@/lib/format";
import type { AssetGroup } from "@/lib/instruments/asset-classes";

export const PERIODS = [
  { id: "1D", label: "Today", phrase: "today", days: 0 },
  { id: "1W", label: "1W", phrase: "over the last week", days: 7 },
  { id: "1M", label: "1M", phrase: "over the last month", days: 30 },
  { id: "3M", label: "3M", phrase: "over the last 3 months", days: 91 },
  { id: "6M", label: "6M", phrase: "over the last 6 months", days: 182 },
  { id: "1Y", label: "1Y", phrase: "over the last year", days: 365 },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

export type PerfHolding = {
  symbol: string;
  name: string;
  group: AssetGroup;
  quantity: number;
  avgPrice: number;
  price: number | null;
  prevClose: number | null;
  /** How closely it follows the Nifty (0 for deposits and the like). */
  beta: number;
  /** Daily closes, oldest first. Null when there is no price feed. */
  closes: [date: string, close: number][] | null;
  /** For assets with no price feed: their value on a date (entered value plus interest). */
  valueOn?: (date: string) => number;
};

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/** One holding's value on each of `dates` (ascending). Days before its first price use that first price. */
export function holdingSeries(h: PerfHolding, dates: string[]): number[] {
  if (h.valueOn) return dates.map(h.valueOn);
  const now = h.quantity * (h.price ?? h.avgPrice);
  const c = h.closes;
  if (!c?.length) return dates.map(() => now);
  let i = 0;
  const out = dates.map((d) => {
    while (i + 1 < c.length && c[i + 1][0] <= d) i++;
    return h.quantity * c[i][1];
  });
  // The last point is the price every other screen shows, so the totals agree.
  if (h.price != null && out.length) out[out.length - 1] = now;
  return out;
}

export type Contribution = { symbol: string; name: string; group: AssetGroup; amount: number; pct: number | null; weight: number };
export type Analysis = {
  period: PeriodId;
  /** False when the history is shorter than the period asked for; `from` is then the first day there is. */
  full: boolean;
  from: string;
  to: string;
  startValue: number;
  endValue: number;
  change: number;
  changePct: number | null;
  niftyPct: number | null;
  /** What the Nifty's move alone would explain (each holding's start value × beta × Nifty move). */
  marketPart: number;
  ownPart: number;
  contributors: Contribution[];
  groups: { group: AssetGroup; amount: number; pct: number | null; weight: number }[];
  rose: number;
  fell: number;
  bestDay: { date: string; amount: number; pct: number } | null;
  worstDay: { date: string; amount: number; pct: number } | null;
  /** Deepest fall from a peak inside the period, as a negative fraction. */
  drawdown: number;
  upDays: number;
  downDays: number;
};

export type Performance = {
  dates: string[];
  values: number[];
  /** Nifty closes on the same dates (null where missing). */
  nifty: (number | null)[];
  invested: number;
  /** Holdings with a real price history, out of all of them. */
  covered: number;
  total: number;
  periods: Record<PeriodId, Analysis | null>;
};

export function buildPerformance(holdings: PerfHolding[], dates: string[], niftyOn: Map<string, number>): Performance {
  const series = holdings.map((h) => holdingSeries(h, dates));
  const values = dates.map((_, i) => series.reduce((a, s) => a + s[i], 0));
  let last: number | null = null;
  const nifty = dates.map((d) => (last = niftyOn.get(d) ?? last));
  const periods = Object.fromEntries(PERIODS.map((p) => [p.id, analyse(p.id, holdings, series, dates, values, nifty)])) as Performance["periods"];
  return { dates, values, nifty, invested: holdings.reduce((a, h) => a + h.quantity * h.avgPrice, 0), covered: holdings.filter((h) => h.valueOn || (h.closes?.length ?? 0) > 1).length, total: holdings.length, periods };
}

function analyse(period: PeriodId, holdings: PerfHolding[], series: number[][], dates: string[], values: number[], nifty: (number | null)[]): Analysis | null {
  const n = dates.length;
  if (n < 2) return null;
  const days = PERIODS.find((p) => p.id === period)!.days;
  const end = n - 1;
  let start = end - 1;
  let full = true;
  if (days > 0) {
    const cutoff = shift(dates[end], days);
    start = 0;
    for (let i = 0; i < n; i++) if (dates[i] <= cutoff) start = i;
    full = dates[0] <= cutoff;
    if (start >= end) start = end - 1;
  }
  // Today's move uses yesterday's close as every other screen does, not the stored history.
  const startOf = (k: number) => (days === 0 && holdings[k].prevClose != null && holdings[k].price != null && !holdings[k].valueOn ? holdings[k].quantity * holdings[k].prevClose! : series[k][start]);
  const startValue = holdings.reduce((a, _, k) => a + startOf(k), 0);
  const endValue = values[end];
  const change = endValue - startValue;
  const niftyPct = nifty[start] && nifty[end] ? nifty[end]! / nifty[start]! - 1 : null;

  const contributors = holdings
    .map((h, k) => {
      const s = startOf(k), e = series[k][end];
      return { symbol: h.symbol, name: h.name, group: h.group, amount: e - s, pct: s ? e / s - 1 : null, weight: endValue ? e / endValue : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
  const marketPart = niftyPct == null ? 0 : holdings.reduce((a, h, k) => a + startOf(k) * h.beta * niftyPct, 0);

  const byGroup = new Map<AssetGroup, { amount: number; start: number; end: number }>();
  holdings.forEach((h, k) => {
    const g = byGroup.get(h.group) ?? { amount: 0, start: 0, end: 0 };
    byGroup.set(h.group, { amount: g.amount + series[k][end] - startOf(k), start: g.start + startOf(k), end: g.end + series[k][end] });
  });
  const groups = [...byGroup.entries()].map(([group, g]) => ({ group, amount: g.amount, pct: g.start ? g.end / g.start - 1 : null, weight: endValue ? g.end / endValue : 0 })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  let bestDay: Analysis["bestDay"] = null, worstDay: Analysis["worstDay"] = null, upDays = 0, downDays = 0, peak = values[start], drawdown = 0;
  for (let i = start + 1; i <= end; i++) {
    const prev = i === start + 1 ? startValue : values[i - 1];
    const amount = values[i] - prev;
    const pct = prev ? amount / prev : 0;
    if (pct > 0.00005) upDays++;
    else if (pct < -0.00005) downDays++;
    if (!bestDay || pct > bestDay.pct) bestDay = { date: dates[i], amount, pct };
    if (!worstDay || pct < worstDay.pct) worstDay = { date: dates[i], amount, pct };
    peak = Math.max(peak, values[i]);
    if (peak) drawdown = Math.min(drawdown, values[i] / peak - 1);
  }
  const eps = Math.max(1, endValue * 0.00005);
  return {
    period,
    full,
    from: dates[start],
    to: dates[end],
    startValue,
    endValue,
    change,
    changePct: startValue ? change / startValue : null,
    niftyPct,
    marketPart,
    ownPart: change - marketPart,
    contributors,
    groups,
    rose: contributors.filter((c) => c.amount > eps).length,
    fell: contributors.filter((c) => c.amount < -eps).length,
    bestDay,
    worstDay,
    drawdown,
    upDays,
    downDays,
  };
}

const rupees = (n: number) => inr(Math.round(Math.abs(n)), { decimals: 0 });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The analysis in plain sentences: what happened, why, and how it compares. */
export function explain(a: Analysis): { headline: string; what: string; why: string[]; how: string[] } {
  const p = PERIODS.find((x) => x.id === a.period)!;
  const when = a.full ? p.phrase : `since ${dayLabel(a.from, "en", false)}`;
  const flat = Math.abs(a.changePct ?? 0) < 0.0005;
  const dir = flat ? "flat" : a.change > 0 ? "up" : "down";
  const headline = flat ? `Barely moved ${when}` : `${dir === "up" ? "Up" : "Down"} ${rupees(a.change)} ${when}`;
  const what = flat
    ? `Your portfolio is almost unchanged ${when}, at ${rupees(a.endValue)}.`
    : `Your portfolio is ${dir} ${rupees(a.change)} (${absPct(a.changePct)}) ${when}: from ${rupees(a.startValue)} to ${rupees(a.endValue)}.`;

  const why: string[] = [];
  const ups = a.contributors.filter((c) => c.amount > 0).slice(0, 3);
  const downs = [...a.contributors].reverse().filter((c) => c.amount < 0).slice(0, 3);
  const moved = a.rose + a.fell;
  if (moved) why.push(`${a.rose} of your ${a.contributors.length} holdings rose and ${a.fell} fell.`);
  if (ups.length) why.push(`${list(ups.map((c) => `${c.name} (+${rupees(c.amount)})`))} added the most.`);
  if (downs.length) why.push(`${list(downs.map((c) => `${c.name} (−${rupees(c.amount)})`))} took the most away.`);
  if (a.niftyPct != null && !flat) {
    const share = a.change ? a.marketPart / a.change : 0;
    why.push(
      share >= 0.75
        ? `Almost all of it is the market: the Nifty moved ${signedPct(a.niftyPct)}, and holdings that follow it as yours do would have moved about ${inr(Math.round(a.marketPart), { sign: true, decimals: 0 })}.`
        : share <= 0.25
          ? `Little of it is the market: the Nifty moved ${signedPct(a.niftyPct)}, which explains only about ${inr(Math.round(a.marketPart), { sign: true, decimals: 0 })}. The rest, ${inr(Math.round(a.ownPart), { sign: true, decimals: 0 })}, is specific to what you own.`
          : `The market explains part of it: the Nifty moved ${signedPct(a.niftyPct)}, worth about ${inr(Math.round(a.marketPart), { sign: true, decimals: 0 })} for holdings like yours. The other ${inr(Math.round(a.ownPart), { sign: true, decimals: 0 })} is specific to what you own.`,
    );
  }

  const how: string[] = [];
  if (a.niftyPct != null && a.changePct != null) {
    const gap = (a.changePct - a.niftyPct) * 100;
    how.push(Math.abs(gap) < 0.1 ? `You moved in step with the Nifty (${signedPct(a.niftyPct)}).` : `You did ${gap > 0 ? "better" : "worse"} than the Nifty by ${Math.abs(gap).toFixed(1)} points (yours ${signedPct(a.changePct)}, Nifty ${signedPct(a.niftyPct)}).`);
  }
  const g = a.groups[0];
  if (g && a.groups.length > 1 && Math.abs(g.amount) > 1) how.push(`${g.group} did most of the moving: ${inr(Math.round(g.amount), { sign: true, decimals: 0 })}, with ${absPct(g.weight, 0)} of your money.`);
  if (a.period !== "1D" && a.worstDay && a.bestDay) {
    how.push(`Roughest day: ${signedPct(a.worstDay.pct)} on ${dayLabel(a.worstDay.date, "en", false)}. Best day: ${signedPct(a.bestDay.pct)} on ${dayLabel(a.bestDay.date, "en", false)}.`);
    if (a.drawdown < -0.005) how.push(`At its lowest it was ${absPct(a.drawdown)} below its high for the period. It rose on ${a.upDays} days and fell on ${a.downDays}.`);
  }
  return { headline, what, why, how };
}
