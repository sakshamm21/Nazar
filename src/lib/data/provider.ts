import "server-only";
import { NV, clean, mapQuote, num, toDate, yahooCall, yf, type Quote } from "@/lib/data/yahoo";

/**
 * What the nightly pipeline needs from a market-data source. Yahoo is the only implementation in
 * v2; a second provider (e.g. an exchange feed) only has to implement this interface.
 */
export interface MarketDataProvider {
  readonly name: string;
  /** Batched quotes (implementations chunk as needed). */
  quotes(symbols: string[]): Promise<Quote[]>;
  /** Daily closes since `from` (inclusive), oldest first. */
  dailyHistory(symbol: string, from: Date): Promise<{ date: string; close: number; volume: number | null }[]>;
  /** Profile, metrics inputs, calendar and quarterly results in one call. */
  summary(symbol: string): Promise<SymbolSummary>;
  /** Annual statement rows (oldest → newest) for the health score. */
  annualFundamentals(symbol: string): Promise<Record<string, unknown>[]>;
  /** FX rate from → to, null when unknown. */
  fx(from: string, to: string): Promise<number | null>;
}

export type SymbolSummary = {
  raw: any;
  name: string | null;
  sector: string | null;
  industry: string | null;
  currency: string;
  reportingCurrency: string;
  marketCap: number | null;
  nextResultsDate: string | null;
  exDividendDate: string | null;
  quarters: { quarterEnd: string; revenue: number | null; earnings: number | null; epsActual: number | null; epsEstimate: number | null }[];
};

const SUMMARY_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "calendarEvents", "earnings", "earningsHistory", "assetProfile"];

/** "2Q2026" (calendar quarter) → "2026-06-30". */
function quarterLabelToEnd(label: string): string | null {
  const m = /^([1-4])Q(\d{4})$/.exec(label?.trim() ?? "");
  if (!m) return null;
  const q = Number(m[1]), y = m[2];
  return `${y}-${["03-31", "06-30", "09-30", "12-31"][q - 1]}`;
}

/** Pure: merges Yahoo's quarterly revenue/earnings chart with EPS actual vs estimate. */
function quartersFromSummary(qs: any): SymbolSummary["quarters"] {
  const byEnd = new Map<string, SymbolSummary["quarters"][number]>();
  for (const q of qs?.earnings?.financialsChart?.quarterly ?? []) {
    const end = quarterLabelToEnd(String(q.date));
    if (end) byEnd.set(end, { quarterEnd: end, revenue: num(q.revenue), earnings: num(q.earnings), epsActual: null, epsEstimate: null });
  }
  for (const h of qs?.earningsHistory?.history ?? []) {
    const end = toDate(h.quarter);
    if (!end) continue;
    const row = byEnd.get(end) ?? { quarterEnd: end, revenue: null, earnings: null, epsActual: null, epsEstimate: null };
    row.epsActual = num(h.epsActual);
    row.epsEstimate = num(h.epsEstimate);
    byEnd.set(end, row);
  }
  return [...byEnd.values()].sort((a, b) => a.quarterEnd.localeCompare(b.quarterEnd));
}

function summaryFrom(qs: any): SymbolSummary {
  const currency = qs?.price?.currency ?? "INR";
  return {
    raw: qs,
    name: qs?.price?.longName ?? qs?.price?.shortName ?? null,
    sector: qs?.assetProfile?.sector ?? null,
    industry: qs?.assetProfile?.industry ?? null,
    currency,
    reportingCurrency: qs?.financialData?.financialCurrency ?? currency,
    marketCap: num(qs?.price?.marketCap),
    nextResultsDate: toDate(qs?.calendarEvents?.earnings?.earningsDate?.[0]),
    exDividendDate: toDate(qs?.calendarEvents?.exDividendDate),
    quarters: quartersFromSummary(qs),
  };
}

export const yahooProvider: MarketDataProvider = {
  name: "yahoo",
  async quotes(symbols) {
    const list = [...new Set(symbols.map(clean))];
    const out: Quote[] = [];
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const r: any = await yahooCall(() => yf.quote(chunk, {}, NV));
      out.push(...(Array.isArray(r) ? r : [r]).filter(Boolean).map(mapQuote));
    }
    return out;
  },
  async dailyHistory(symbol, from) {
    const r: any = await yahooCall(() => yf.chart(clean(symbol), { period1: from, period2: new Date(), interval: "1d", return: "object" }, NV));
    const ts: number[] = (r?.timestamp ?? []).map((t: any) => (t instanceof Date ? t.getTime() / 1000 : Number(t)));
    const q = r?.indicators?.quote?.[0] ?? {};
    return ts
      .map((t, i) => ({ date: istDate(new Date(t * 1000)), close: num(q.close?.[i]), volume: num(q.volume?.[i]) }))
      .filter((p): p is { date: string; close: number; volume: number | null } => p.close != null && p.close > 0);
  },
  async summary(symbol) {
    const qs = await yahooCall(() => yf.quoteSummary(clean(symbol), { modules: SUMMARY_MODULES }, NV));
    return summaryFrom(qs);
  },
  async annualFundamentals(symbol) {
    const period1 = new Date(Date.now() - 6 * 365 * 86400000);
    const raw: any[] = await yahooCall(() => yf.fundamentalsTimeSeries(clean(symbol), { period1, type: "annual", module: "all" }, NV));
    return (Array.isArray(raw) ? raw : []).filter((r) => r?.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },
  async fx(from, to) {
    if (from === to) return 1;
    const r: any = await yahooCall(() => yf.quote(`${from}${to}=X`, {}, NV)).catch(() => null);
    return num(r?.regularMarketPrice);
  },
};

/** Calendar date in India (exchange time) for a timestamp. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
