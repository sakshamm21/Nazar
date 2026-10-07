import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { NV, cached, clean, fetchMetrics, fetchQuotes, fxRate, num, quoteSummary, yf } from "../data/yahoo";
import { forModel, safe as safeData, symbol } from "./tool-utils";
import { buildHealth, comps, correlationMatrix, dupont, piotroskiAltman, riskReturn, sipBacktest, technicals, FINANCIAL_RE } from "../analytics/models";
import { round } from "../analytics/stats";

/**
 * Quant / modelling tools for the Ask tab. The maths lives in analytics/models.ts (pure, tested,
 * shared with the nightly pipeline); these wrappers fetch data through the cached, rate-limited
 * Yahoo layer and return the shapes the chart views and Excel models expect.
 */
const safe = <T,>(fn: () => Promise<T>) => safeData(fn, "analysis");

const RANGE_YEARS: Record<string, number> = { "6mo": 0.5, "1y": 1, "2y": 2, "3y": 3, "5y": 5, "10y": 10, "20y": 20 };

/** Daily (≤2y) or weekly closes as a date → close map. Cached 10 min, retried with backoff. */
async function closes(sym: string, range: string, interval?: "1d" | "1wk" | "1mo") {
  const years = RANGE_YEARS[range] ?? 1;
  const iv = interval ?? (years <= 2 ? "1d" : "1wk");
  const period1 = new Date(Date.now() - years * 365.25 * 86400000);
  const r: any = await cached(`closes:${clean(sym)}:${range}:${iv}`, 10 * 60_000, () => yf.chart(clean(sym), { period1, period2: new Date(), interval: iv, return: "object" }, NV));
  const ts: number[] = (r?.timestamp ?? []).map((t: any) => (t instanceof Date ? t.getTime() / 1000 : Number(t)));
  const q = r?.indicators?.quote?.[0] ?? {};
  const adj = r?.indicators?.adjclose?.[0]?.adjclose;
  const map = new Map<string, number>();
  ts.forEach((t, i) => {
    const c = num(adj?.[i]) ?? num(q.close?.[i]);
    if (c != null && c > 0) map.set(new Date(t * 1000).toISOString().slice(0, 10), c);
  });
  if (map.size < 10) throw new Error(`No data: not enough price history for ${clean(sym)}`);
  return { symbol: clean(sym), currency: r?.meta?.currency ?? "USD", interval: iv, map };
}

const benchmarkFor = (s: string) => (/\.(NS|BO)$/i.test(s) || /^\^(NSEI|BSESN|NSEBANK|CNX)/i.test(s) ? "^NSEI" : "^GSPC");
const riskFreeFor = (currency: string) => (currency === "INR" ? 0.065 : 0.04);

/** Annual fundamentals ("all" statements) sorted oldest → newest. Cached 30 min. */
async function annualFundamentals(sym: string) {
  const period1 = new Date(Date.now() - 6 * 365 * 86400000);
  const raw: any[] = await cached(`fts-all:${clean(sym)}`, 30 * 60_000, () => yf.fundamentalsTimeSeries(clean(sym), { period1, type: "annual", module: "all" }, NV));
  return (Array.isArray(raw) ? raw : []).filter((r) => r?.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export const analysisTools = {
  getRiskReturn: tool({
    description:
      "Risk & return profile vs a benchmark (Nifty 50 for Indian stocks, S&P 500 otherwise): CAGR, volatility, Sharpe, Sortino, max drawdown, beta, alpha, correlation. Renders a growth-of-100 chart; downloadable as an Excel model.",
    inputSchema: z.object({
      symbol,
      range: z.enum(["1y", "2y", "3y", "5y", "10y"]).default("3y"),
      benchmark: z.string().max(20).optional().describe("Override benchmark, e.g. ^NSEBANK, ^GSPC"),
    }),
    execute: async ({ symbol: s, range, benchmark }) =>
      safe(async () => {
        const bm = clean(benchmark ?? benchmarkFor(s));
        const [a, b] = await Promise.all([closes(s, range), closes(bm, range)]);
        const rf = riskFreeFor(a.currency);
        const r = riskReturn(a.map, b.map, { interval: a.interval, riskFree: rf });
        return { symbol: a.symbol, benchmark: bm, currency: a.currency, range, interval: a.interval, riskFree: rf, stats: r.stats, series: r.series, prices: r.dates.map((d, i) => [d, r.pa[i], r.pb[i]]) };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, benchmark: o.benchmark, range: o.range, riskFreeAssumed: o.riskFree, stats: o.stats })),
  }),

  getCorrelationMatrix: tool({
    description: "Correlation of returns between 2–8 stocks/indices (diversification check), plus each one's volatility. Renders a heatmap; downloadable as an Excel model with CORREL formulas.",
    inputSchema: z.object({ symbols: z.array(symbol).min(2).max(8), range: z.enum(["6mo", "1y", "2y", "3y", "5y"]).default("1y") }),
    execute: async ({ symbols, range }) =>
      safe(async () => {
        const list = [...new Set(symbols.map(clean))];
        const all = await Promise.all(list.map((s) => closes(s, range)));
        const c = correlationMatrix(all.map((x) => x.map), all[0].interval);
        return { symbols: list, range, interval: all[0].interval, observations: c.observations, matrix: c.matrix, volatility: c.volatility, prices: c.dates.map((d, i) => [d, ...c.prices.map((p) => p[i])]) };
      }),
    toModelOutput: forModel((o) => ({ symbols: o.symbols, range: o.range, observations: o.observations, matrix: o.matrix, annualisedVolatility: o.volatility })),
  }),

  runComparableValuation: tool({
    description:
      "Relative valuation (trading comps): compares the target with 2–8 peers on P/E, forward P/E, EV/EBITDA, P/B and P/S and shows what the peer medians would imply for the share price. Pick sensible same-sector peers (search tickers first). Downloadable as an Excel model with formulas.",
    inputSchema: z.object({ symbol, peers: z.array(symbol).min(2).max(8) }),
    execute: async ({ symbol: s, peers }) =>
      safe(async () => {
        const target = clean(s);
        const keys = ["price", "marketCap", "trailingPE", "forwardPE", "evToEbitda", "priceToBook", "priceToSales", "trailingEps", "forwardEps", "bookValue", "ebitda", "revenue", "totalCash", "totalDebt"];
        const peerList = [...new Set(peers.map(clean))].filter((p) => p !== target);
        const [t, ...ps] = await Promise.all([fetchMetrics(target, keys), ...peerList.map((p) => fetchMetrics(p, keys).catch(() => null))]);
        const qs = await quoteSummary(target, ["defaultKeyStatistics", "price"]);
        const shares = num(qs?.defaultKeyStatistics?.sharesOutstanding) ?? num(qs?.price?.sharesOutstanding);
        const asMetrics = (m: any) => ({ metrics: Object.fromEntries(m.metrics.map((x: any) => [x.key, x.value])) as Record<string, number | null> });
        const good = ps.filter(Boolean) as any[];
        const r = comps(asMetrics(t), good.map(asMetrics), shares);
        const multiples = ["trailingPE", "forwardPE", "evToEbitda", "priceToBook", "priceToSales"];
        const v = (m: any, k: string) => m?.metrics.find((x: any) => x.key === k)?.value ?? null;
        const row = (m: any) => ({ symbol: m.symbol, name: m.name, currency: m.currency, ...Object.fromEntries(multiples.map((k) => [k, round(v(m, k), 2)])) });
        return {
          symbol: target,
          name: t.name,
          currency: t.currency,
          price: r.price,
          shares,
          netDebt: r.netDebt,
          inputs: { trailingEps: v(t, "trailingEps"), forwardEps: v(t, "forwardEps"), ebitda: v(t, "ebitda"), bookValue: v(t, "bookValue"), revenue: v(t, "revenue") },
          target: row(t),
          peers: good.map(row),
          missingPeers: peerList.filter((p) => !good.some((gg) => gg.symbol === p)),
          medians: Object.fromEntries(Object.entries(r.medians).map(([k, x]) => [k, round(x, 2)])),
          implied: Object.fromEntries(Object.entries(r.implied).map(([k, x]) => [k, round(x, 2)])),
          blended: round(r.blended, 2),
          upside: round(r.upside),
          fxNote: t.fxNote,
        };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, price: o.price, currency: o.currency, target: o.target, peers: o.peers, medians: o.medians, impliedPrice: o.implied, blended: o.blended, gapVsPrice: o.upside, missingPeers: o.missingPeers })),
  }),

  getDupontAnalysis: tool({
    description: "DuPont analysis: breaks return on equity into net margin × asset turnover × equity multiplier (leverage) for the last 4–5 fiscal years, showing what drives ROE. Downloadable as Excel with formulas.",
    inputSchema: z.object({ symbol }),
    execute: async ({ symbol: s }) =>
      safe(async () => {
        const [rows, cur] = await Promise.all([annualFundamentals(s), quoteSummary(s, ["financialData", "price"])]);
        return { symbol: clean(s), currency: cur?.financialData?.financialCurrency ?? cur?.price?.currency ?? "USD", years: dupont(rows) };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, years: o.years.map((y: any) => ({ period: y.period, netMargin: y.netMargin, assetTurnover: y.assetTurnover, equityMultiplier: y.equityMultiplier, roe: y.roe })) })),
  }),

  getFinancialHealthScore: tool({
    description:
      "Financial health check: Piotroski F-score (9 accounting tests of profitability, leverage/liquidity and efficiency, 0–9) and Altman Z-score (bankruptcy-risk zones). For banks/insurers it returns a simplified lender check instead. Downloadable as Excel.",
    inputSchema: z.object({ symbol }),
    execute: async ({ symbol: s }) =>
      safe(async () => {
        const [rows, qs] = await Promise.all([annualFundamentals(s), quoteSummary(s, ["price", "financialData", "assetProfile", "defaultKeyStatistics", "summaryDetail"])]);
        const currency = qs?.price?.currency ?? "USD", reporting = qs?.financialData?.financialCurrency ?? currency;
        const fx = await fxRate(currency, reporting);
        const mcap = num(qs?.price?.marketCap);
        const sector = qs?.assetProfile?.sector ?? null, industry = qs?.assetProfile?.industry ?? null;
        const financial = FINANCIAL_RE.test(`${sector ?? ""} ${industry ?? ""}`);
        if (financial) {
          const m = await fetchMetrics(s);
          const h = buildHealth({ rows, metrics: Object.fromEntries(m.metrics.map((x) => [x.key, x.value])), sector, industry, marketCapReporting: null });
          return { symbol: clean(s), periods: [], fScore: h.lenderPassed ?? 0, scoredTests: (h.lenderTests ?? []).filter((x) => x.pass !== null).length, tests: (h.lenderTests ?? []).map((x) => ({ ...x, group: "Lender check" })), altman: null, financialSector: true, score: h.score, note: "Banks and lenders have different balance sheets, so Piotroski and Altman don't apply. This is Nazar's simplified lender check: return on equity, return on assets, profit growth and revenue growth." };
        }
        const pa = piotroskiAltman(rows, { marketCapReporting: mcap && fx ? mcap * fx : null });
        const h = buildHealth({ rows, metrics: {}, sector, industry, marketCapReporting: mcap && fx ? mcap * fx : null });
        return { symbol: clean(s), periods: pa.periods, fScore: pa.fScore, scoredTests: pa.scoredTests, tests: pa.tests, altman: pa.altman, financialSector: false, score: h.score, note: null };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, periods: o.periods, fScore: `${o.fScore}/${o.scoredTests} tests passed`, healthScore0to100: o.score, tests: o.tests.map((t: any) => `${t.pass === null ? "n/a" : t.pass ? "PASS" : "FAIL"} · ${t.name} (${t.detail})`), altman: o.altman, note: o.note })),
  }),

  runSipBacktest: tool({
    description:
      "SIP backtest: invests a fixed amount every month in a stock, index or ETF over past years and reports total invested, current value, XIRR, and a lump-sum comparison. Uses dividend-adjusted prices for stocks; indices like ^NSEI are price-only (no dividends), so say so. Downloadable as an Excel model with the monthly schedule and XIRR formula.",
    inputSchema: z.object({
      symbol,
      monthlyAmount: z.number().positive().max(10_000_000).default(10000).describe("Amount invested each month, in the instrument's currency"),
      years: z.number().int().min(1).max(20).default(5),
    }),
    execute: async ({ symbol: s, monthlyAmount, years }) =>
      safe(async () => {
        const px = await closes(s, years <= 1 ? "1y" : years <= 2 ? "2y" : years <= 3 ? "3y" : years <= 5 ? "5y" : years <= 10 ? "10y" : "20y", "1mo");
        const cutoff = new Date(Date.now() - (years * 365.25 + 31) * 86400000).toISOString().slice(0, 10);
        const months = [...px.map.entries()].filter(([d]) => d >= cutoff).sort(([a], [b]) => a.localeCompare(b)).slice(-years * 12);
        const [last] = await fetchQuotes([s]).catch(() => []);
        const lastPrice = last?.price ?? months.at(-1)![1];
        const r = sipBacktest(months, monthlyAmount, lastPrice);
        return { symbol: px.symbol, currency: last?.currency ?? px.currency, monthlyAmount, years, ...r };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, currency: o.currency, monthlyAmount: o.monthlyAmount, years: o.years, installments: o.installments, invested: o.invested, value: o.value, gain: o.gain, xirr: o.xirr, absoluteReturn: o.absoluteReturn, lumpSum: o.lumpSum })),
  }),

  getTechnicalIndicators: tool({
    description:
      "Technical snapshot: 20/50/200-day moving averages, RSI(14), MACD(12,26,9), distance from 52-week high/low, and plain-English trend descriptions. Renders price + moving averages and RSI charts. Educational only.",
    inputSchema: z.object({ symbol }),
    execute: async ({ symbol: s }) =>
      safe(async () => {
        const px = await closes(s, "2y", "1d");
        const dates = [...px.map.keys()].sort();
        return { symbol: px.symbol, currency: px.currency, ...technicals(dates, dates.map((d) => px.map.get(d)!)) };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, last: o.last, range52w: o.range52w, signals: o.signals })),
  }),
};
