/** A deterministic fake market-data provider (stands in for Yahoo in integration tests). */
import type { QuarterRow } from "@/lib/db/schema";
import { istDate, type MarketDataProvider, type SymbolSummary } from "@/lib/data/provider";
import type { Quote } from "@/lib/data/yahoo";
import { NIFTY, SECTOR_INDICES } from "@/lib/instruments/sectors";
import { prevWeekday, shiftDate } from "@/lib/market/store";

const PROFILE: Record<string, { base: number; beta: number; k: number; sector: string; industry: string; name: string }> = {
  "TMPV.NS": { base: 700, beta: 1.3, k: 1, sector: "Consumer Cyclical", industry: "Auto Manufacturers", name: "Tata Motors Passenger Vehicles Limited" },
  "INFY.NS": { base: 1500, beta: 0.8, k: 2, sector: "Technology", industry: "Information Technology Services", name: "Infosys Limited" },
  "HDFCBANK.NS": { base: 950, beta: 0.9, k: 3, sector: "Financial Services", industry: "Banks - Regional", name: "HDFC Bank Limited" },
};
/**
 * Symbols a test opts in to a generated profile of their own (any stock, fund, ETF or metal).
 * Stocks swing enough to trip small-move alerts; funds and metals move gently.
 */
export const GENERIC = new Set<string>();
const SECTORS = [["Financial Services", "Banks - Regional"], ["Technology", "Information Technology Services"], ["Consumer Cyclical", "Auto Manufacturers"], ["Consumer Defensive", "Household Products"], ["Energy", "Oil & Gas"]] as const;
function generic(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const calm = s.startsWith("MF:") || s.startsWith("CMD:");
  const [sector, industry] = SECTORS[h % SECTORS.length];
  return { base: 60 + (h % 1900), beta: calm ? 0.5 : 0.7 + (h % 7) / 10, k: h % 13, swing: calm ? 0.004 : 0.07, sector: calm || !s.endsWith(".NS") ? null : sector, industry: calm || !s.endsWith(".NS") ? null : industry, name: s };
}
const ord = (iso: string) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
const market = (t: number) => 0.04 * Math.sin(t / 11) + 0.02 * Math.sin(t / 3.1);
const closeOn = (s: string, iso: string) => {
  const t = ord(iso);
  if (s === NIFTY) return 25000 * Math.exp(market(t));
  if (GENERIC.has(s) && !PROFILE[s]) {
    const g = generic(s);
    return g.base * Math.exp(g.beta * market(t) + g.swing * Math.sin(t / 1.7 + g.k));
  }
  if (s.startsWith("^") || s.endsWith(".NS") && !PROFILE[s]) return 50000 * Math.exp(market(t));
  const p = PROFILE[s];
  return p.base * Math.exp(p.beta * market(t) + 0.015 * Math.sin(t / 2.3 + p.k));
};
const quote = (symbol: string, prev: number, price: number, day: string): Quote => ({
  symbol, name: symbol, currency: "INR", exchange: "NSE", price, change: price - prev, changePercent: (price / prev - 1) * 100, previousClose: prev,
  open: prev, dayHigh: Math.max(prev, price), dayLow: Math.min(prev, price), volume: 1_000_000, marketCap: 1e12, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null,
  trailingPE: null, marketState: "CLOSED", asOf: `${day}T10:00:00.000Z`, timeZone: "Asia/Kolkata",
});
export const q = (end: string, revenue: number, earnings: number, eps: number): QuarterRow => ({ quarterEnd: end, revenue, earnings, epsActual: eps, epsEstimate: eps * 0.98 });

export function fakeMarket() {
  const state = {
    day: "",
    moves: {} as Record<string, number>,
    prevClose: {} as Record<string, number>,
    quarters: { "INFY.NS": [q("2025-12-31", 41000, 6800, 16.4), q("2026-03-31", 42000, 7000, 16.9)] } as Record<string, QuarterRow[]>,
    broken: new Set<string>(),
    calls: { quotes: 0, summary: 0, history: 0 },
  };
  const priceFor = (s: string) => {
    const prev = state.prevClose[s] ?? closeOn(s, prevWeekday(state.day));
    return { prev, price: prev * (1 + (state.moves[s] ?? state.moves["*"] ?? 0)) };
  };
  const provider: MarketDataProvider = {
    name: "fake",
    async quotes(symbols) {
      state.calls.quotes++;
      return symbols.filter((s) => !state.broken.has(s)).map((s) => {
        const { prev, price } = priceFor(s);
        return quote(s, prev, price, state.day);
      });
    },
    async dailyHistory(symbol, from) {
      state.calls.history++;
      const out: { date: string; close: number; volume: number | null }[] = [];
      for (let d = istDate(from); d < state.day; d = shiftDate(d, 1)) {
        if ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) continue;
        out.push({ date: d, close: closeOn(symbol, d), volume: 1_000_000 });
      }
      return out;
    },
    async summary(symbol): Promise<SymbolSummary> {
      state.calls.summary++;
      if (state.broken.has(symbol)) throw new Error("Not Found: no data for symbol");
      const p = PROFILE[symbol] ?? (GENERIC.has(symbol) ? generic(symbol) : undefined);
      return { raw: {}, name: p?.name ?? symbol, sector: p?.sector ?? null, industry: p?.industry ?? null, currency: "INR", reportingCurrency: "INR", marketCap: 1e12, nextResultsDate: null, exDividendDate: null, quarters: state.quarters[symbol] ?? [] };
    },
    async annualFundamentals() {
      return [];
    },
    async fx() {
      return null;
    },
  };
  /** Closes the day: today's prices become tomorrow's previous closes. */
  const advance = (day: string) => {
    for (const s of [NIFTY, ...SECTOR_INDICES, ...Object.keys(PROFILE)]) state.prevClose[s] = priceFor(s).price;
    state.day = day;
    state.moves = {};
  };
  return { provider, state, advance };
}
