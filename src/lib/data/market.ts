import "server-only";
import { BULLION_IMPORT_DUTY, COMMODITIES, GRAMS_PER_TROY_OUNCE, isCommoditySymbol, isMfSymbol, isSyntheticSymbol, mfCode } from "@/lib/instruments/asset-classes";
import { parseAmfi, type AmfiScheme } from "./amfi-parse";
import { istDate, yahooProvider, type MarketDataProvider, type SymbolSummary } from "./provider";
import { withRetry } from "./resilience";
import type { Quote } from "./yahoo";

/**
 * The market-data provider the app uses: Yahoo for anything traded on an exchange, plus two free
 * sources Yahoo doesn't cover well.
 *   Mutual funds  AMFI's daily NAV file (one download covers every scheme) for today's NAV, and
 *                 mfapi.in for a scheme's NAV history.
 *   Gold, silver  the international futures price × USD/INR, per gram, plus India's import duty.
 * Symbols tell the sources apart: "MF:<scheme code>", "CMD:<metal>", anything else is Yahoo's.
 */
const AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
const MFAPI = "https://api.mfapi.in/mf";
const UA = { "user-agent": "Mozilla/5.0 (Nazar portfolio watchdog)" };
const USDINR = "USDINR=X";

async function getText(url: string): Promise<string> {
  return withRetry(
    async () => {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
      return res.text();
    },
    { attempts: 3, baseMs: 800 },
  );
}

/** A quote for something that isn't an exchange listing (no volume, market cap or day range). */
function syntheticQuote(symbol: string, name: string, price: number, previousClose: number | null, asOf: string): Quote {
  return {
    symbol, name, currency: "INR", exchange: "", price, previousClose,
    change: previousClose != null ? price - previousClose : null,
    changePercent: previousClose ? (price / previousClose - 1) * 100 : null,
    open: null, dayHigh: null, dayLow: null, volume: null, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, trailingPE: null,
    marketState: "CLOSED", asOf, timeZone: "Asia/Kolkata",
  };
}

/* ------------------------------------------------------------------ */
/* Mutual funds                                                        */
/* ------------------------------------------------------------------ */

const g = globalThis as unknown as { __amfi?: { at: number; value: Promise<Map<string, AmfiScheme>> } };

/** Latest NAV for every scheme, keyed by scheme code. One 1.5 MB download, cached for 30 minutes. */
export function amfiNavs(): Promise<Map<string, AmfiScheme>> {
  if (g.__amfi && Date.now() - g.__amfi.at < 30 * 60_000) return g.__amfi.value;
  const value = getText(AMFI_NAV_URL).then((t) => new Map(parseAmfi(t).map((s) => [s.code, s])));
  value.catch(() => (g.__amfi = undefined));
  g.__amfi = { at: Date.now(), value };
  return value;
}

async function fundQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const navs = await amfiNavs();
  return symbols.flatMap((s) => {
    const f = navs.get(mfCode(s));
    // A NAV is the value at the close of its date; the previous NAV comes from stored history.
    return f && f.nav > 0 ? [syntheticQuote(s, f.name, f.nav, null, `${f.date}T10:00:00.000Z`)] : [];
  });
}

/** A scheme's NAV history from mfapi.in: `{ data: [{ date: "01-10-2026", nav: "88.25690" }] }`, newest first. */
async function fundHistory(symbol: string, from: Date) {
  const j = JSON.parse(await getText(`${MFAPI}/${mfCode(symbol)}`)) as { data?: { date: string; nav: string }[] };
  const since = istDate(from);
  return (j.data ?? [])
    .map((r) => ({ date: r.date.split("-").reverse().join("-"), close: Number(r.nav), volume: null }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close > 0 && r.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Gold and silver                                                     */
/* ------------------------------------------------------------------ */

const commodity = (symbol: string) => COMMODITIES.find((c) => c.symbol === symbol) ?? null;
/** USD per troy ounce → rupees per gram in India. */
const perGram = (usdPerOunce: number, usdInr: number, purity: number) => ((usdPerOunce * usdInr) / GRAMS_PER_TROY_OUNCE) * (1 + BULLION_IMPORT_DUTY) * purity;

async function commodityQuotes(symbols: string[]): Promise<Quote[]> {
  const list = symbols.map(commodity).filter((c) => c != null);
  if (!list.length) return [];
  const quotes = new Map((await yahooProvider.quotes([...new Set(list.map((c) => c.future)), USDINR])).map((q) => [q.symbol, q]));
  const fx = quotes.get(USDINR);
  if (fx?.price == null) return [];
  return list.flatMap((c) => {
    const f = quotes.get(c.future);
    if (f?.price == null) return [];
    const prev = f.previousClose != null && fx.previousClose != null ? perGram(f.previousClose, fx.previousClose, c.purity) : null;
    return [syntheticQuote(c.symbol, c.short, perGram(f.price, fx.price!, c.purity), prev, f.asOf ?? new Date().toISOString())];
  });
}

async function commodityHistory(symbol: string, from: Date) {
  const c = commodity(symbol);
  if (!c) return [];
  const [metal, fx] = await Promise.all([yahooProvider.dailyHistory(c.future, from), yahooProvider.dailyHistory(USDINR, from)]);
  let rate: number | null = null, i = 0;
  const out: { date: string; close: number; volume: number | null }[] = [];
  for (const bar of metal) {
    // The currency market keeps different holidays: use the latest rate on or before each day.
    while (i < fx.length && fx[i].date <= bar.date) rate = fx[i++].close;
    if (rate != null) out.push({ date: bar.date, close: perGram(bar.close, rate, c.purity), volume: null });
  }
  return out;
}

/* ------------------------------------------------------------------ */

const emptySummary = (name: string | null): SymbolSummary => ({ raw: {}, name, sector: null, industry: null, currency: "INR", reportingCurrency: "INR", marketCap: null, nextResultsDate: null, exDividendDate: null, quarters: [] });

export const marketProvider: MarketDataProvider = {
  name: "market",
  async quotes(symbols) {
    const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()))];
    const funds = list.filter(isMfSymbol), metals = list.filter(isCommoditySymbol), listed = list.filter((s) => !isSyntheticSymbol(s));
    // One source failing (AMFI down, say) must not lose the others' prices.
    const parts = await Promise.all([listed.length ? yahooProvider.quotes(listed) : [], fundQuotes(funds).catch(() => []), commodityQuotes(metals).catch(() => [])]);
    return parts.flat();
  },
  dailyHistory: (symbol, from) => (isMfSymbol(symbol) ? fundHistory(symbol, from) : isCommoditySymbol(symbol) ? commodityHistory(symbol, from) : yahooProvider.dailyHistory(symbol, from)),
  async summary(symbol) {
    if (isMfSymbol(symbol)) return emptySummary((await amfiNavs()).get(mfCode(symbol))?.name ?? null);
    if (isCommoditySymbol(symbol)) return emptySummary(commodity(symbol)?.short ?? null);
    return yahooProvider.summary(symbol);
  },
  annualFundamentals: (symbol) => (isSyntheticSymbol(symbol) ? Promise.resolve([]) : yahooProvider.annualFundamentals(symbol)),
  fx: (from, to) => yahooProvider.fx(from, to),
};
