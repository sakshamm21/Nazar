import "server-only";
import { isCommoditySymbol, isForeignSymbol, isMfSymbol } from "@/lib/instruments/asset-classes";
import { withRetry } from "@/lib/data/resilience";
import { num, type Quote } from "@/lib/data/yahoo";
import type { MarketDataProvider, SymbolSummary } from "@/lib/data/provider";

/**
 * A second market-data source, used only when the primary one is unavailable.
 *
 * Yahoo's API is unofficial and fails in two distinct ways: it rate-limits with 429s and HTML error
 * pages, and its cookie/crumb flow breaks when that endpoint changes ("Invalid Crumb"). The chart
 * endpoint this provider uses needs neither a crumb nor a session, and Yahoo serves it from two
 * independent hosts, so a rate-limit or an outage on one can be retried on the other. That makes it a
 * real second path rather than a second name for the same dependency.
 *
 * It is deliberately narrow: quotes and daily closes for listed NSE/BSE symbols and nothing else. No
 * fundamentals, no FX, no fund NAVs. Where it has no bar for a symbol it returns no quote at all
 * rather than a stale or invented one, so a fallback can never replace a good price with a worse
 * guess. Mutual funds, gold and foreign holdings keep their last stored price instead.
 */

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Only listed exchange symbols; synthetic ones are priced by the app, not by a provider. */
const covered = (symbol: string) => !isMfSymbol(symbol) && !isCommoditySymbol(symbol) && !isForeignSymbol(symbol);

type Bar = { date: string; close: number; volume: number | null };
type Chart = { meta: any; bars: Bar[] };

/** The chart endpoint returns JSON without a crumb, so it needs no cookie or session. */
async function chartOnce(symbol: string, host: string, days: number): Promise<Chart | null> {
  const range = days <= 10 ? "5d" : days <= 62 ? "1mo" : days <= 370 ? "1y" : "5y";
  const res = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json", "user-agent": UA },
  });
  if (!res.ok) throw new Error(`chart ${res.status}`);
  const json: any = await res.json();
  const result = json?.chart?.result?.[0];
  // An unknown symbol comes back as result: null with an error object, not a 4xx.
  if (!result?.meta) return null;
  const ts: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = num(quote.close?.[i]);
    if (close == null || close <= 0) continue;
    bars.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close, volume: num(quote.volume?.[i]) });
  }
  return { meta: result.meta, bars: bars.sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Tries each host in turn, so a rate-limit or outage on one leaves the other usable. */
async function chart(symbol: string, days: number): Promise<Chart | null> {
  let last: unknown;
  for (const host of HOSTS) {
    try {
      const c = await withRetry(() => chartOnce(symbol, host, days), { attempts: 2, baseMs: 400 });
      if (c) return c;
    } catch (e) {
      last = e;
    }
  }
  if (last) throw last;
  return null;
}

const toQuote = (symbol: string, c: Chart): Quote | null => {
  const last = c.bars.at(-1);
  if (!last) return null;
  const prev = c.bars.at(-2);
  const previousClose = prev?.close ?? num(c.meta?.previousClose) ?? num(c.meta?.chartPreviousClose) ?? null;
  const change = previousClose != null ? last.close - previousClose : null;
  return {
    symbol,
    name: c.meta?.longName ?? c.meta?.shortName ?? symbol.replace(/\.(NS|BO)$/, ""),
    price: last.close,
    previousClose,
    change,
    changePercent: change != null && previousClose ? (change / previousClose) * 100 : num(c.meta?.regularMarketChangePercent),
    volume: last.volume ?? num(c.meta?.regularMarketVolume),
    marketCap: num(c.meta?.marketCap),
    asOf: `${last.date}T00:00:00.000Z`,
  } as Quote;
};

export const fallbackProvider: MarketDataProvider = {
  name: "yahoo-chart",
  async quotes(symbols) {
    const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(covered);
    const out: Quote[] = [];
    // Small batches: this path runs only when the primary source is already struggling.
    for (let i = 0; i < list.length; i += 4) {
      const chunk = await Promise.all(
        list.slice(i, i + 4).map(async (s) => {
          try {
            const c = await chart(s, 5);
            return c ? toQuote(s, c) : null;
          } catch {
            return null;
          }
        }),
      );
      out.push(...chunk.filter((q): q is Quote => q != null));
    }
    return out;
  },
  async dailyHistory(symbol, from) {
    if (!covered(symbol)) return [];
    const days = Math.ceil((Date.now() - from.getTime()) / 86400000);
    const c = await chart(symbol, days);
    return (c?.bars ?? []).filter((b) => b.date >= from.toISOString().slice(0, 10));
  },
  async summary(): Promise<SymbolSummary> {
    // This endpoint carries no fundamentals. An empty summary is honest: the caller keeps what it
    // already has, rather than having stored data replaced with blanks.
    return { raw: {}, name: null, sector: null, industry: null, currency: "INR", reportingCurrency: "INR", marketCap: null, nextResultsDate: null, exDividendDate: null, quarters: [] };
  },
  async annualFundamentals() {
    return [];
  },
  async fx() {
    // No FX here, and the rupee rate is what makes a foreign holding meaningful. Decline rather than
    // guess: those holdings keep their last stored value.
    return null;
  },
};