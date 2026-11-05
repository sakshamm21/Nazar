/**
 * Comparisons for dashboards: something the user owns against an index, both rebased to 100 at the
 * start of the period, so the two lines read as "₹100 here became…". Pure, over the same value
 * history the rest of the app uses (what is held today, priced on each past day).
 */
import { GROUP_ORDER, type AssetGroup } from "@/lib/instruments/asset-classes";
import { NIFTY } from "@/lib/instruments/sectors";
import { holdingSeries, type PerfHolding } from "@/lib/portfolio/performance";

export const BENCHMARKS = [
  { id: NIFTY, label: "Nifty 50" },
  { id: "^NSEBANK", label: "Nifty Bank" },
  { id: "NIFTY_FIN_SERVICE.NS", label: "Nifty Financial Services" },
  { id: "^CNXIT", label: "Nifty IT" },
  { id: "^CNXAUTO", label: "Nifty Auto" },
  { id: "^CNXFMCG", label: "Nifty FMCG" },
  { id: "^CNXPHARMA", label: "Nifty Pharma" },
  { id: "^CNXMETAL", label: "Nifty Metal" },
  { id: "^CNXENERGY", label: "Nifty Energy" },
  { id: "^CNXREALTY", label: "Nifty Realty" },
] as const;
export const benchmarkLabel = (id: string) => BENCHMARKS.find((b) => b.id === id)?.label ?? id;

export const DASH_PERIODS = [
  { id: "1M", label: "1 month", days: 30 },
  { id: "3M", label: "3 months", days: 91 },
  { id: "6M", label: "6 months", days: 182 },
  { id: "1Y", label: "1 year", days: 365 },
] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number]["id"];

/** What can be compared: everything, the part that moves with markets, one kind of asset, or one holding. */
export const MARKET_GROUPS: AssetGroup[] = ["Stocks", "Mutual funds", "ETFs", "REITs & InvITs", "US stocks", "Gold & silver", "Crypto"];
export function partLabel(part: string, names: Map<string, string> = new Map()) {
  if (part === "whole") return "Everything";
  if (part === "market") return "Stocks, funds and other market-linked";
  if (part.startsWith("symbol:")) return names.get(part.slice(7)) ?? part.slice(7);
  return part;
}
export function partFilter(part: string): (h: PerfHolding) => boolean {
  if (part === "whole") return () => true;
  if (part === "market") return (h) => MARKET_GROUPS.includes(h.group);
  if (part.startsWith("symbol:")) return (h) => h.symbol === part.slice(7);
  if ((GROUP_ORDER as string[]).includes(part)) return (h) => h.group === part;
  return () => false;
}

const shift = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);

export type Comparison = {
  from: string;
  to: string;
  points: { date: string; mine: number; index: number | null }[];
  minePct: number | null;
  indexPct: number | null;
  /** Rupees in the part compared, at the end. */
  value: number;
  holdings: number;
};

export function compare(holdings: PerfHolding[], dates: string[], part: string, benchmark: Map<string, number>, period: DashPeriod): Comparison | null {
  const chosen = holdings.filter(partFilter(part));
  if (!chosen.length || dates.length < 2) return null;
  const days = DASH_PERIODS.find((p) => p.id === period)!.days;
  const cutoff = shift(dates[dates.length - 1], days);
  let start = 0;
  for (let i = 0; i < dates.length; i++) if (dates[i] <= cutoff) start = i;
  const window = dates.slice(start);
  const series = chosen.map((h) => holdingSeries(h, dates).slice(start));
  const values = window.map((_, i) => series.reduce((a, s) => a + s[i], 0));
  const sortedBench = [...benchmark.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let k = 0, last: number | null = null;
  const bench = window.map((d) => {
    while (k < sortedBench.length && sortedBench[k][0] <= d) last = sortedBench[k++][1];
    return last;
  });
  const base = values[0], bBase = bench.find((x) => x != null) ?? null;
  const points = window.map((date, i) => ({ date, mine: base ? (values[i] / base) * 100 : 100, index: bBase && bench[i] != null ? (bench[i]! / bBase) * 100 : null }));
  const end = points[points.length - 1];
  return { from: window[0], to: window[window.length - 1], points, minePct: base ? end.mine / 100 - 1 : null, indexPct: end.index != null ? end.index / 100 - 1 : null, value: values[values.length - 1], holdings: chosen.length };
}

/** A new account's first dashboard: the comparisons people ask for first. */
export function defaultWidgets(id: () => string) {
  return [
    { id: id(), portfolio: "all", part: "whole", benchmark: NIFTY, period: "1Y" as const },
    { id: id(), portfolio: "all", part: "market", benchmark: NIFTY, period: "1Y" as const },
    { id: id(), portfolio: "all", part: "Mutual funds", benchmark: NIFTY, period: "6M" as const },
    { id: id(), portfolio: "all", part: "Stocks", benchmark: NIFTY, period: "3M" as const },
  ];
}
