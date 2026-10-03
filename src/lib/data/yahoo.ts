import "server-only";
import YahooFinance from "yahoo-finance2";
import { Limiter, withRetry } from "./resilience";

/**
 * Yahoo Finance data layer. Used live only by the Ask tab; the nightly pipeline
 * reaches it through `provider.ts`. Pages never call it: they read snapshots from Postgres.
 */

const g = globalThis as unknown as { __yf?: InstanceType<typeof YahooFinance>; __yfLimiter?: Limiter };
export const yf: any = (g.__yf ??= new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] }));

export const NV = { validateResult: false } as const;

/* ------------------------------------------------------------------ */
/* Reliability: every Yahoo call goes through one limiter (max 6 at    */
/* once per instance), exponential backoff with jitter, and a short    */
/* cache so parallel tool calls don't hammer the API.                  */
/* ------------------------------------------------------------------ */

const limiter = (g.__yfLimiter ??= new Limiter(Number(process.env.YAHOO_CONCURRENCY) || 6));

/** Runs one Yahoo call with the shared limiter and retry policy. */
export function yahooCall<T>(fn: () => Promise<T>): Promise<T> {
  return limiter.run(() => withRetry(fn, { attempts: 3, baseMs: 800 }));
}

const cache = new Map<string, { at: number; value: Promise<any> }>();
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = yahooCall(fn).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

/** Yahoo often wraps numbers as {raw, fmt}. Normalise to a plain number. */
export function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && "raw" in v) return num(v.raw);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function toDate(v: any): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString().slice(0, 10);
  if (typeof v === "object" && "raw" in v) return toDate(v.raw);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export const clean = (s: string) => s.trim().toUpperCase();

/* ------------------------------------------------------------------ */
/* Metric catalog — the metrics the agent can query by key             */
/* ------------------------------------------------------------------ */

export type MetricFormat = "currency" | "large" | "percent" | "ratio" | "number" | "date";

export interface MetricDef {
  key: string;
  label: string;
  category: "Price" | "Valuation" | "Profitability" | "Growth" | "Financial health" | "Dividends" | "Risk & ownership" | "Per share";
  format: MetricFormat;
  path: [module: string, field: string];
}

export const METRICS: MetricDef[] = [
  { key: "price", label: "Price", category: "Price", format: "currency", path: ["price", "regularMarketPrice"] },
  { key: "changePercent", label: "Day change", category: "Price", format: "percent", path: ["price", "regularMarketChangePercent"] },
  { key: "marketCap", label: "Market cap", category: "Price", format: "large", path: ["price", "marketCap"] },
  { key: "enterpriseValue", label: "Enterprise value", category: "Valuation", format: "large", path: ["defaultKeyStatistics", "enterpriseValue"] },
  { key: "fiftyTwoWeekHigh", label: "52-week high", category: "Price", format: "currency", path: ["summaryDetail", "fiftyTwoWeekHigh"] },
  { key: "fiftyTwoWeekLow", label: "52-week low", category: "Price", format: "currency", path: ["summaryDetail", "fiftyTwoWeekLow"] },
  { key: "fiftyTwoWeekChange", label: "52-week change", category: "Price", format: "percent", path: ["defaultKeyStatistics", "52WeekChange"] },
  { key: "averageVolume", label: "Avg volume (3M)", category: "Price", format: "large", path: ["summaryDetail", "averageVolume"] },
  { key: "trailingPE", label: "P/E (TTM)", category: "Valuation", format: "ratio", path: ["summaryDetail", "trailingPE"] },
  { key: "forwardPE", label: "Forward P/E", category: "Valuation", format: "ratio", path: ["summaryDetail", "forwardPE"] },
  { key: "pegRatio", label: "PEG ratio", category: "Valuation", format: "ratio", path: ["defaultKeyStatistics", "pegRatio"] },
  { key: "priceToBook", label: "Price / book", category: "Valuation", format: "ratio", path: ["defaultKeyStatistics", "priceToBook"] },
  { key: "priceToSales", label: "Price / sales (TTM)", category: "Valuation", format: "ratio", path: ["summaryDetail", "priceToSalesTrailing12Months"] },
  { key: "evToRevenue", label: "EV / revenue", category: "Valuation", format: "ratio", path: ["defaultKeyStatistics", "enterpriseToRevenue"] },
  { key: "evToEbitda", label: "EV / EBITDA", category: "Valuation", format: "ratio", path: ["defaultKeyStatistics", "enterpriseToEbitda"] },
  { key: "grossMargin", label: "Gross margin", category: "Profitability", format: "percent", path: ["financialData", "grossMargins"] },
  { key: "operatingMargin", label: "Operating margin", category: "Profitability", format: "percent", path: ["financialData", "operatingMargins"] },
  { key: "ebitdaMargin", label: "EBITDA margin", category: "Profitability", format: "percent", path: ["financialData", "ebitdaMargins"] },
  { key: "profitMargin", label: "Net margin", category: "Profitability", format: "percent", path: ["financialData", "profitMargins"] },
  { key: "returnOnEquity", label: "Return on equity", category: "Profitability", format: "percent", path: ["financialData", "returnOnEquity"] },
  { key: "returnOnAssets", label: "Return on assets", category: "Profitability", format: "percent", path: ["financialData", "returnOnAssets"] },
  { key: "revenue", label: "Revenue (TTM)", category: "Growth", format: "large", path: ["financialData", "totalRevenue"] },
  { key: "revenueGrowth", label: "Revenue growth (YoY)", category: "Growth", format: "percent", path: ["financialData", "revenueGrowth"] },
  { key: "earningsGrowth", label: "Earnings growth (YoY)", category: "Growth", format: "percent", path: ["financialData", "earningsGrowth"] },
  { key: "ebitda", label: "EBITDA (TTM)", category: "Growth", format: "large", path: ["financialData", "ebitda"] },
  { key: "freeCashFlow", label: "Free cash flow (TTM)", category: "Financial health", format: "large", path: ["financialData", "freeCashflow"] },
  { key: "operatingCashFlow", label: "Operating cash flow", category: "Financial health", format: "large", path: ["financialData", "operatingCashflow"] },
  { key: "totalCash", label: "Total cash", category: "Financial health", format: "large", path: ["financialData", "totalCash"] },
  { key: "totalDebt", label: "Total debt", category: "Financial health", format: "large", path: ["financialData", "totalDebt"] },
  { key: "debtToEquity", label: "Debt / equity (%)", category: "Financial health", format: "ratio", path: ["financialData", "debtToEquity"] },
  { key: "currentRatio", label: "Current ratio", category: "Financial health", format: "ratio", path: ["financialData", "currentRatio"] },
  { key: "quickRatio", label: "Quick ratio", category: "Financial health", format: "ratio", path: ["financialData", "quickRatio"] },
  { key: "trailingEps", label: "EPS (TTM)", category: "Per share", format: "currency", path: ["defaultKeyStatistics", "trailingEps"] },
  { key: "forwardEps", label: "EPS (forward)", category: "Per share", format: "currency", path: ["defaultKeyStatistics", "forwardEps"] },
  { key: "bookValue", label: "Book value / share", category: "Per share", format: "currency", path: ["defaultKeyStatistics", "bookValue"] },
  { key: "dividendYield", label: "Dividend yield", category: "Dividends", format: "percent", path: ["summaryDetail", "dividendYield"] },
  { key: "dividendRate", label: "Dividend / share", category: "Dividends", format: "currency", path: ["summaryDetail", "dividendRate"] },
  { key: "payoutRatio", label: "Payout ratio", category: "Dividends", format: "percent", path: ["summaryDetail", "payoutRatio"] },
  { key: "beta", label: "Beta (5Y)", category: "Risk & ownership", format: "ratio", path: ["summaryDetail", "beta"] },
  { key: "shortPercentOfFloat", label: "Short % of float", category: "Risk & ownership", format: "percent", path: ["defaultKeyStatistics", "shortPercentOfFloat"] },
  { key: "heldPercentInsiders", label: "Insider ownership", category: "Risk & ownership", format: "percent", path: ["defaultKeyStatistics", "heldPercentInsiders"] },
  { key: "heldPercentInstitutions", label: "Institutional ownership", category: "Risk & ownership", format: "percent", path: ["defaultKeyStatistics", "heldPercentInstitutions"] },
];

export const METRIC_KEYS = METRICS.map((m) => m.key) as [string, ...string[]];
const METRIC_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData"];

export async function quoteSummary(symbol: string, modules: string[]): Promise<any> {
  const s = clean(symbol);
  return cached(`qs:${s}:${[...modules].sort().join(",")}`, 60_000, () => yf.quoteSummary(s, { modules }, NV));
}

/** Money fields in financialData that Yahoo reports in the company's *reporting* currency. */
const REPORTING_CCY_KEYS = new Set(["revenue", "ebitda", "freeCashFlow", "operatingCashFlow", "totalCash", "totalDebt"]);
/** Ratios Yahoo computes by dividing trading-currency prices by reporting-currency financials. */
const MIXED_CCY_RATIOS = new Set(["enterpriseValue", "priceToSales", "evToRevenue", "evToEbitda"]);

export async function fxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const [q] = await fetchQuotes([`${from}${to}=X`]).catch(() => []);
  return q?.price ?? null;
}

/**
 * Pure: the 42-metric catalog from a quoteSummary payload. `fx` converts the reporting currency to
 * the trading currency (null when they're the same or the rate is unknown).
 */
export function metricsFromSummary(qs: any, fx: number | null) {
  const currency: string = qs?.price?.currency ?? "USD";
  const reporting: string = qs?.financialData?.financialCurrency ?? currency;
  const raw = (key: string) => {
    const m = METRICS.find((x) => x.key === key)!;
    return num(qs?.[m.path[0]]?.[m.path[1]]);
  };
  let value = (key: string) => raw(key);
  let fxNote: string | null = null;

  // Companies that report in a different currency than they trade in (Infosys: USD vs INR,
  // Wipro ADR: INR vs USD). Yahoo mixes the two, producing e.g. P/S of 198x. Convert the
  // reporting-currency amounts at the live FX rate and recompute the ratios ourselves.
  if (reporting !== currency) {
    const conv = (key: string) => (fx == null ? null : raw(key) == null ? null : raw(key)! * fx);
    const mcap = raw("marketCap");
    const rev = conv("revenue"), ebitda = conv("ebitda"), cash = conv("totalCash"), debt = conv("totalDebt");
    const ev = mcap != null && cash != null && debt != null ? mcap + debt - cash : null;
    const fixed: Record<string, number | null> = {
      enterpriseValue: ev,
      priceToSales: mcap != null && rev ? mcap / rev : null,
      evToRevenue: ev != null && rev ? ev / rev : null,
      evToEbitda: ev != null && ebitda ? ev / ebitda : null,
    };
    value = (key: string) => (MIXED_CCY_RATIOS.has(key) ? fixed[key] : REPORTING_CCY_KEYS.has(key) ? conv(key) : raw(key));
    fxNote = fx == null ? `Reports in ${reporting}; FX rate unavailable, so ${reporting} amounts are omitted.` : `Reports in ${reporting}; amounts converted to ${currency} at ${fx.toFixed(4)}.`;
  }
  const values: Record<string, number | null> = Object.fromEntries(METRICS.map((m) => [m.key, value(m.key)]));
  // Yahoo's beta for NSE stocks is unreliable; Nazar computes beta from stored prices instead.
  if (/\.(NS|BO)$/.test(qs?.price?.symbol ?? "")) values.beta = null;
  return { currency, reporting, fxNote, values };
}

export async function fetchMetrics(symbol: string, keys?: string[]) {
  const qs = await quoteSummary(symbol, METRIC_MODULES);
  const currency: string = qs?.price?.currency ?? "USD";
  const reporting: string = qs?.financialData?.financialCurrency ?? currency;
  const wanted = keys?.length ? METRICS.filter((m) => keys.includes(m.key)) : METRICS;
  const fx = reporting !== currency ? await fxRate(reporting, currency) : null;
  const { values, fxNote } = metricsFromSummary(qs, fx);
  const rows = wanted.map((m) => ({ key: m.key, label: m.label, category: m.category, format: m.format, value: values[m.key] ?? null }));
  return {
    symbol: clean(symbol),
    name: qs?.price?.longName ?? qs?.price?.shortName ?? clean(symbol),
    currency,
    fxNote,
    metrics: rows,
  };
}

/** Maps a Yahoo quote payload to the shape the app uses. */
export function mapQuote(q: any) {
  return {
    symbol: q.symbol as string,
    name: (q.longName ?? q.shortName ?? q.symbol) as string,
    currency: (q.currency ?? "USD") as string,
    exchange: q.fullExchangeName ?? q.exchange,
    price: num(q.regularMarketPrice),
    change: num(q.regularMarketChange),
    changePercent: num(q.regularMarketChangePercent),
    previousClose: num(q.regularMarketPreviousClose),
    open: num(q.regularMarketOpen),
    dayHigh: num(q.regularMarketDayHigh),
    dayLow: num(q.regularMarketDayLow),
    volume: num(q.regularMarketVolume),
    marketCap: num(q.marketCap),
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
    trailingPE: num(q.trailingPE),
    marketState: q.marketState as string | undefined,
    asOf: q.regularMarketTime ? new Date(q.regularMarketTime instanceof Date ? q.regularMarketTime : Number(q.regularMarketTime) * 1000).toISOString() : null,
    timeZone: (q.exchangeTimezoneName ?? null) as string | null,
  };
}
export type Quote = ReturnType<typeof mapQuote>;

export async function fetchQuotes(symbols: string[]) {
  const list = [...new Set(symbols.map(clean))];
  const res: any[] = await cached(`q:${list.join(",")}`, 20_000, () => yf.quote(list, {}, NV)).then((r: any) => (Array.isArray(r) ? r : [r]));
  return res.filter(Boolean).map(mapQuote);
}

const RANGE_DAYS: Record<string, number> = { "5d": 5, "1mo": 31, "3mo": 92, "6mo": 183, ytd: 0, "1y": 366, "2y": 731, "5y": 1827, "10y": 3653, max: 365 * 40 };

export async function fetchHistory(symbol: string, range: string) {
  const now = new Date();
  const start = range === "ytd" ? new Date(now.getFullYear(), 0, 1) : new Date(now.getTime() - (RANGE_DAYS[range] ?? 366) * 86400000);
  const days = (now.getTime() - start.getTime()) / 86400000;
  const interval = days <= 7 ? "30m" : days <= 800 ? "1d" : days <= 3700 ? "1wk" : "1mo";
  const r: any = await cached(`chart:${clean(symbol)}:${range}`, 5 * 60_000, () => yf.chart(clean(symbol), { period1: start, period2: now, interval, return: "object" }, NV));
  const ts: number[] = (r?.timestamp ?? []).map((t: any) => (t instanceof Date ? t.getTime() / 1000 : Number(t)));
  const q = r?.indicators?.quote?.[0] ?? {};
  const points = ts
    .map((t, i) => ({
      date: interval === "30m" ? new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") : new Date(t * 1000).toISOString().slice(0, 10),
      close: num(q.close?.[i]),
      volume: num(q.volume?.[i]),
    }))
    .filter((p) => p.close != null);
  const divs = Object.values(r?.events?.dividends ?? {}).map((d: any) => ({ date: toDate(d.date), amount: num(d.amount) }));
  return {
    symbol: clean(symbol),
    currency: r?.meta?.currency ?? "USD",
    range,
    interval,
    points,
    dividends: divs,
  };
}

const STATEMENT_FIELDS: Record<string, { key: string; label: string }[]> = {
  income: [
    { key: "totalRevenue", label: "Revenue" },
    { key: "costOfRevenue", label: "Cost of revenue" },
    { key: "grossProfit", label: "Gross profit" },
    { key: "researchAndDevelopment", label: "R&D" },
    { key: "sellingGeneralAndAdministration", label: "SG&A" },
    { key: "operatingIncome", label: "Operating income" },
    { key: "EBITDA", label: "EBITDA" },
    { key: "netIncome", label: "Net income" },
    { key: "dilutedEPS", label: "Diluted EPS" },
  ],
  balance: [
    { key: "totalAssets", label: "Total assets" },
    { key: "totalLiabilitiesNetMinorityInterest", label: "Total liabilities" },
    { key: "stockholdersEquity", label: "Shareholders' equity" },
    { key: "cashAndCashEquivalents", label: "Cash & equivalents" },
    { key: "totalDebt", label: "Total debt" },
    { key: "netDebt", label: "Net debt" },
    { key: "workingCapital", label: "Working capital" },
  ],
  cashflow: [
    { key: "operatingCashFlow", label: "Operating cash flow" },
    { key: "capitalExpenditure", label: "Capex" },
    { key: "freeCashFlow", label: "Free cash flow" },
    { key: "repurchaseOfCapitalStock", label: "Buybacks" },
    { key: "cashDividendsPaid", label: "Dividends paid" },
    { key: "stockBasedCompensation", label: "Stock-based comp" },
  ],
};

export async function fetchFinancials(symbol: string, statement: "income" | "balance" | "cashflow", period: "annual" | "quarterly") {
  const moduleName = statement === "income" ? "financials" : statement === "balance" ? "balance-sheet" : "cash-flow";
  const yearsBack = period === "annual" ? 6 : 2;
  const period1 = new Date(Date.now() - yearsBack * 365 * 86400000);
  const [raw, cur]: [any[], { financialCurrency: string }] = await Promise.all([
    cached<any[]>(`fts:${clean(symbol)}:${statement}:${period}`, 30 * 60_000, () => yf.fundamentalsTimeSeries(clean(symbol), { period1, type: period, module: moduleName }, NV)),
    fetchCurrencies(symbol),
  ]);
  const fields = STATEMENT_FIELDS[statement];
  const periods = (Array.isArray(raw) ? raw : [])
    .map((r: any) => {
      const row: Record<string, number | string | null> = { period: toDate(r.date) ?? "" };
      for (const f of fields) row[f.key] = num(r[f.key]);
      return row;
    })
    .filter((r) => fields.some((f) => r[f.key] != null))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  return { symbol: clean(symbol), currency: cur.financialCurrency, statement, period, fields, periods };
}

/* ------------------------------------------------------------------ */
/* Market overview & Indian universe                                   */
/* ------------------------------------------------------------------ */

export const INDEX_SETS: Record<"IN" | "US" | "GLOBAL", { symbol: string; label: string }[]> = {
  IN: [
    { symbol: "^NSEI", label: "Nifty 50" },
    { symbol: "^BSESN", label: "Sensex" },
    { symbol: "^NSEBANK", label: "Nifty Bank" },
    { symbol: "^NSMIDCP", label: "Nifty Next 50" },
    { symbol: "^CNXSC", label: "Nifty Smallcap 100" },
    { symbol: "NIFTY_FIN_SERVICE.NS", label: "Nifty Financial Services" },
    { symbol: "^CNXIT", label: "Nifty IT" },
    { symbol: "^CNXAUTO", label: "Nifty Auto" },
    { symbol: "^CNXPHARMA", label: "Nifty Pharma" },
    { symbol: "^CNXFMCG", label: "Nifty FMCG" },
    { symbol: "^CNXMETAL", label: "Nifty Metal" },
    { symbol: "^CNXENERGY", label: "Nifty Energy" },
    { symbol: "^CNXREALTY", label: "Nifty Realty" },
    { symbol: "^CNXPSUBANK", label: "Nifty PSU Bank" },
    { symbol: "^INDIAVIX", label: "India VIX" },
    { symbol: "USDINR=X", label: "USD / INR" },
  ],
  US: [
    { symbol: "^GSPC", label: "S&P 500" },
    { symbol: "^IXIC", label: "Nasdaq Composite" },
    { symbol: "^DJI", label: "Dow Jones" },
    { symbol: "^RUT", label: "Russell 2000" },
    { symbol: "^VIX", label: "VIX" },
    { symbol: "^TNX", label: "US 10Y yield" },
  ],
  GLOBAL: [
    { symbol: "^GSPC", label: "S&P 500" },
    { symbol: "^IXIC", label: "Nasdaq" },
    { symbol: "^NSEI", label: "Nifty 50" },
    { symbol: "^BSESN", label: "Sensex" },
    { symbol: "^FTSE", label: "FTSE 100" },
    { symbol: "^GDAXI", label: "DAX" },
    { symbol: "^N225", label: "Nikkei 225" },
    { symbol: "^HSI", label: "Hang Seng" },
    { symbol: "USDINR=X", label: "USD / INR" },
    { symbol: "GC=F", label: "Gold" },
    { symbol: "CL=F", label: "Crude oil (WTI)" },
    { symbol: "BTC-USD", label: "Bitcoin" },
  ],
};

/**
 * Nifty 50 constituents (NSE). Yahoo has no Indian screeners, so Indian movers are computed
 * from this universe. Index membership changes twice a year — update this list when it does.
 */
export const NIFTY50 = [
  "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARTIARTL",
  "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HINDALCO",
  "HINDUNILVR", "ICICIBANK", "INDIGO", "INFY", "ITC", "JIOFIN", "JSWSTEEL", "KOTAKBANK", "LT", "M&M",
  "MARUTI", "MAXHEALTH", "NESTLEIND", "NTPC", "ONGC", "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SHRIRAMFIN",
  "SUNPHARMA", "TATACONSUM", "TMPV", "TATASTEEL", "TCS", "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
].map((s) => `${s}.NS`);

/** Currency that a company reports its financial statements in (can differ from the trading currency, e.g. ADRs). */
async function fetchCurrencies(symbol: string): Promise<{ currency: string; financialCurrency: string }> {
  const qs = await quoteSummary(symbol, ["price", "financialData"]).catch(() => null);
  const currency = qs?.price?.currency ?? "USD";
  return { currency, financialCurrency: qs?.financialData?.financialCurrency ?? currency };
}
