import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from "ai";
import { z } from "zod";
import { clean, fetchMetrics, fetchQuotes, fxRate, isTransient, num, quoteSummary, toDate, yf } from "./finance";

/**
 * Quant / modelling tools. Each returns the full data the UI needs to draw a chart and build an
 * Excel model, and a compact `toModelOutput` so the LLM isn't re-sent long price series.
 */

async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.warn("[analysis] error:", msg.slice(0, 300));
    if (/Not Found|No fundamentals|Quote not found|delisted|No data/i.test(msg)) return { error: "Symbol not found or not enough data for this analysis." };
    if (isTransient(e)) return { error: "Yahoo Finance is rate-limiting or temporarily unavailable. Try again in a minute." };
    return { error: `This analysis couldn't be completed${/<|\{/.test(msg) ? "" : `: ${msg.slice(0, 120)}`}.` };
  }
}
const forModel = (fn: (o: any) => unknown) => (o: any) => ({ type: "json" as const, value: (o && typeof o === "object" && "error" in o ? o : fn(o)) as any });
const symbol = z.string().min(1).max(20).describe("Ticker symbol, e.g. TCS.NS, AAPL, ^NSEI");
const round = (x: number | null | undefined, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const median = (xs: number[]) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let num_ = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num_ += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num_ / Math.sqrt(da * db) : null;
};
const sample = <T,>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]));

const RANGE_YEARS: Record<string, number> = { "6mo": 0.5, "1y": 1, "2y": 2, "3y": 3, "5y": 5, "10y": 10, "20y": 20 };

/** Daily (≤2y) or weekly closes as a date → close map. */
async function closes(sym: string, range: string, interval?: "1d" | "1wk" | "1mo") {
  const years = RANGE_YEARS[range] ?? 1;
  const iv = interval ?? (years <= 2 ? "1d" : "1wk");
  const period1 = new Date(Date.now() - years * 365.25 * 86400000);
  const r: any = await yf.chart(clean(sym), { period1, period2: new Date(), interval: iv, return: "object" }, { validateResult: false });
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

const periodsPerYear = (iv: string) => (iv === "1d" ? 252 : iv === "1wk" ? 52 : 12);
const benchmarkFor = (s: string) => (/\.(NS|BO)$/i.test(s) || /^\^(NSEI|BSESN|NSEBANK|CNX)/i.test(s) ? "^NSEI" : "^GSPC");
const riskFreeFor = (currency: string) => (currency === "INR" ? 0.065 : 0.04);

/** Annual fundamentals ("all" statements) sorted oldest → newest. */
async function annualFundamentals(sym: string) {
  const period1 = new Date(Date.now() - 6 * 365 * 86400000);
  const raw: any[] = await yf.fundamentalsTimeSeries(clean(sym), { period1, type: "annual", module: "all" }, { validateResult: false });
  return (Array.isArray(raw) ? raw : []).filter((r) => r?.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Money-weighted return (XIRR) by Newton's method; flows: negative = invested, positive = value. */
function xirr(flows: { date: Date; amount: number }[]) {
  const t0 = flows[0].date.getTime();
  const yrs = flows.map((f) => (f.date.getTime() - t0) / (365.25 * 86400000));
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    let f = 0, df = 0;
    flows.forEach((fl, k) => {
      f += fl.amount / (1 + r) ** yrs[k];
      df += (-yrs[k] * fl.amount) / (1 + r) ** (yrs[k] + 1);
    });
    if (!df) break;
    const next = r - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - r) < 1e-8) return next;
    r = Math.max(-0.99, next);
  }
  return Number.isFinite(r) ? r : null;
}

const sma = (xs: number[], n: number) => xs.map((_, i) => (i + 1 < n ? null : mean(xs.slice(i + 1 - n, i + 1))));
const ema = (xs: number[], n: number) => {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
};
function rsi(xs: number[], n = 14) {
  const out: (number | null)[] = xs.map(() => null);
  let gain = 0, loss = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (i <= n) {
      gain += Math.max(d, 0);
      loss += Math.max(-d, 0);
      if (i === n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    } else {
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
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
        const dates = [...a.map.keys()].filter((d) => b.map.has(d)).sort();
        if (dates.length < 20) throw new Error("No data: too few overlapping dates with the benchmark");
        const pa = dates.map((d) => a.map.get(d)!), pb = dates.map((d) => b.map.get(d)!);
        const ra = pa.slice(1).map((p, i) => p / pa[i] - 1), rb = pb.slice(1).map((p, i) => p / pb[i] - 1);
        const ppy = periodsPerYear(a.interval);
        const years = (new Date(dates.at(-1)!).getTime() - new Date(dates[0]).getTime()) / (365.25 * 86400000);
        const cagr = (pa.at(-1)! / pa[0]) ** (1 / years) - 1;
        const bCagr = (pb.at(-1)! / pb[0]) ** (1 / years) - 1;
        const vol = stdev(ra) * Math.sqrt(ppy);
        const downside = Math.sqrt(mean(ra.map((r) => Math.min(r, 0) ** 2))) * Math.sqrt(ppy);
        const rf = riskFreeFor(a.currency);
        const covar = mean(ra.map((r, i) => (r - mean(ra)) * (rb[i] - mean(rb))));
        const beta = covar / (stdev(rb) ** 2 * ((rb.length - 1) / rb.length));
        let peak = -Infinity, maxDd = 0;
        for (const p of pa) { peak = Math.max(peak, p); maxDd = Math.min(maxDd, p / peak - 1); }
        return {
          symbol: a.symbol,
          benchmark: bm,
          currency: a.currency,
          range,
          interval: a.interval,
          riskFree: rf,
          stats: {
            totalReturn: round(pa.at(-1)! / pa[0] - 1),
            cagr: round(cagr),
            benchmarkCagr: round(bCagr),
            volatility: round(vol),
            benchmarkVolatility: round(stdev(rb) * Math.sqrt(ppy)),
            sharpe: round((cagr - rf) / vol, 2),
            sortino: round(downside ? (cagr - rf) / downside : null, 2),
            maxDrawdown: round(maxDd),
            beta: round(beta, 2),
            alpha: round(cagr - (rf + beta * (bCagr - rf))),
            correlation: round(corr(ra, rb), 2),
          },
          series: sample(dates.map((d, i) => ({ date: d, stock: round((pa[i] / pa[0]) * 100, 2), benchmark: round((pb[i] / pb[0]) * 100, 2) })), 260),
          prices: dates.map((d, i) => [d, pa[i], pb[i]]),
        };
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
        const dates = [...all[0].map.keys()].filter((d) => all.every((x) => x.map.has(d))).sort();
        if (dates.length < 20) throw new Error("No data: too few overlapping trading dates (different exchanges/holidays?)");
        const px = all.map((x) => dates.map((d) => x.map.get(d)!));
        const rets = px.map((p) => p.slice(1).map((v, i) => v / p[i] - 1));
        const ppy = periodsPerYear(all[0].interval);
        return {
          symbols: list,
          range,
          interval: all[0].interval,
          observations: rets[0].length,
          matrix: rets.map((a) => rets.map((b) => round(corr(a, b), 3))),
          volatility: rets.map((r) => round(stdev(r) * Math.sqrt(ppy))),
          prices: dates.map((d, i) => [d, ...px.map((p) => p[i])]),
        };
      }),
    toModelOutput: forModel((o) => ({ symbols: o.symbols, range: o.range, observations: o.observations, matrix: o.matrix, annualisedVolatility: o.volatility })),
  }),

  runComparableValuation: tool({
    description:
      "Relative valuation (trading comps): compares the target with 2–8 peers on P/E, forward P/E, EV/EBITDA, P/B and P/S, applies the peer medians to the target and gives implied share prices. Pick sensible same-sector peers (search tickers first). Downloadable as an Excel model with formulas.",
    inputSchema: z.object({ symbol, peers: z.array(symbol).min(2).max(8) }),
    execute: async ({ symbol: s, peers }) =>
      safe(async () => {
        const target = clean(s);
        const keys = ["price", "marketCap", "trailingPE", "forwardPE", "evToEbitda", "priceToBook", "priceToSales", "trailingEps", "forwardEps", "bookValue", "ebitda", "revenue", "totalCash", "totalDebt"];
        const peerList = [...new Set(peers.map(clean))].filter((p) => p !== target);
        const [t, ...ps] = await Promise.all([fetchMetrics(target, keys), ...peerList.map((p) => fetchMetrics(p, keys).catch(() => null))]);
        const qs = await quoteSummary(target, ["defaultKeyStatistics", "price"]);
        const shares = num(qs?.defaultKeyStatistics?.sharesOutstanding) ?? num(qs?.price?.sharesOutstanding);
        const v = (m: any, k: string) => m?.metrics.find((x: any) => x.key === k)?.value ?? null;
        const multiples = ["trailingPE", "forwardPE", "evToEbitda", "priceToBook", "priceToSales"] as const;
        const good = ps.filter(Boolean) as any[];
        const med: Record<string, number | null> = {};
        for (const k of multiples) med[k] = median(good.map((p) => v(p, k)).filter((x: any) => x != null && x > 0 && x < 500));
        const netDebt = (v(t, "totalDebt") ?? 0) - (v(t, "totalCash") ?? 0);
        const price = v(t, "price");
        const implied: Record<string, number | null> = {
          trailingPE: med.trailingPE && v(t, "trailingEps") > 0 ? med.trailingPE * v(t, "trailingEps") : null,
          forwardPE: med.forwardPE && v(t, "forwardEps") > 0 ? med.forwardPE * v(t, "forwardEps") : null,
          evToEbitda: med.evToEbitda && v(t, "ebitda") > 0 && shares ? (med.evToEbitda * v(t, "ebitda") - netDebt) / shares : null,
          priceToBook: med.priceToBook && v(t, "bookValue") > 0 ? med.priceToBook * v(t, "bookValue") : null,
          priceToSales: med.priceToSales && v(t, "revenue") > 0 && shares ? (med.priceToSales * v(t, "revenue")) / shares : null,
        };
        const vals = Object.values(implied).filter((x): x is number => x != null && x > 0);
        const blended = vals.length ? mean(vals) : null;
        const row = (m: any) => ({ symbol: m.symbol, name: m.name, currency: m.currency, ...Object.fromEntries(multiples.map((k) => [k, round(v(m, k), 2)])) });
        return {
          symbol: target,
          name: t.name,
          currency: t.currency,
          price,
          shares,
          netDebt,
          inputs: { trailingEps: v(t, "trailingEps"), forwardEps: v(t, "forwardEps"), ebitda: v(t, "ebitda"), bookValue: v(t, "bookValue"), revenue: v(t, "revenue") },
          target: row(t),
          peers: good.map(row),
          missingPeers: peerList.filter((p) => !good.some((g) => g.symbol === p)),
          medians: Object.fromEntries(Object.entries(med).map(([k, x]) => [k, round(x, 2)])),
          implied: Object.fromEntries(Object.entries(implied).map(([k, x]) => [k, round(x, 2)])),
          blended: round(blended, 2),
          upside: price && blended ? round(blended / price - 1) : null,
          fxNote: t.fxNote,
        };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, price: o.price, currency: o.currency, target: o.target, peers: o.peers, medians: o.medians, impliedPrice: o.implied, blended: o.blended, upside: o.upside, missingPeers: o.missingPeers })),
  }),

  getDupontAnalysis: tool({
    description: "DuPont analysis: breaks return on equity into net margin × asset turnover × equity multiplier (leverage) for the last 4–5 fiscal years, showing what drives ROE. Downloadable as Excel with formulas.",
    inputSchema: z.object({ symbol }),
    execute: async ({ symbol: s }) =>
      safe(async () => {
        const [rows, cur] = await Promise.all([annualFundamentals(s), quoteSummary(s, ["financialData", "price"])]);
        const years = rows
          .map((r: any) => {
            const ni = num(r.netIncome) ?? num(r.netIncomeCommonStockholders), rev = num(r.totalRevenue), ta = num(r.totalAssets), eq = num(r.stockholdersEquity) ?? num(r.commonStockEquity);
            return { period: toDate(r.date)!, netIncome: ni, revenue: rev, totalAssets: ta, equity: eq };
          })
          .filter((y) => y.netIncome != null && y.revenue && y.totalAssets && y.equity)
          .map((y) => {
            const netMargin = y.netIncome! / y.revenue!, turnover = y.revenue! / y.totalAssets!, multiplier = y.totalAssets! / y.equity!;
            return { ...y, netMargin: round(netMargin), assetTurnover: round(turnover), equityMultiplier: round(multiplier, 3), roe: round(netMargin * turnover * multiplier) };
          })
          .slice(-5);
        if (!years.length) throw new Error("No fundamentals: statement data unavailable for DuPont analysis");
        return { symbol: clean(s), currency: cur?.financialData?.financialCurrency ?? cur?.price?.currency ?? "USD", years };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, years: o.years.map((y: any) => ({ period: y.period, netMargin: y.netMargin, assetTurnover: y.assetTurnover, equityMultiplier: y.equityMultiplier, roe: y.roe })) })),
  }),

  getFinancialHealthScore: tool({
    description:
      "Financial health check: Piotroski F-score (9 accounting tests of profitability, leverage/liquidity and efficiency, 0–9) and Altman Z-score (bankruptcy-risk zones). Not meaningful for banks/insurers. Downloadable as Excel.",
    inputSchema: z.object({ symbol }),
    execute: async ({ symbol: s }) =>
      safe(async () => {
        const [rows, qs] = await Promise.all([annualFundamentals(s), quoteSummary(s, ["price", "financialData", "assetProfile"])]);
        if (rows.length < 2) throw new Error("No fundamentals: need two fiscal years of statements");
        const [p, c] = rows.slice(-2) as any[];
        const g = (r: any, ...ks: string[]) => { for (const k of ks) { const x = num(r?.[k]); if (x != null) return x; } return null; };
        const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
        const ni = (r: any) => g(r, "netIncome", "netIncomeCommonStockholders"), ta = (r: any) => g(r, "totalAssets"), cfo = (r: any) => g(r, "operatingCashFlow");
        const ltd = (r: any) => g(r, "longTermDebt", "longTermDebtAndCapitalLeaseObligation") ?? 0;
        const cr = (r: any) => ratio(g(r, "currentAssets"), g(r, "currentLiabilities"));
        const gm = (r: any) => ratio(g(r, "grossProfit"), g(r, "totalRevenue"));
        const at = (r: any) => ratio(g(r, "totalRevenue"), ta(r));
        const sh = (r: any) => g(r, "ordinarySharesNumber", "shareIssued", "dilutedAverageShares");
        const test = (name: string, group: string, ok: boolean | null, detail: string) => ({ name, group, pass: ok, detail });
        const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
        const roaC = ratio(ni(c), ta(c)), roaP = ratio(ni(p), ta(p));
        const tests = [
          test("Positive net income", "Profitability", ni(c) == null ? null : ni(c)! > 0, `ROA ${pct(roaC)}`),
          test("Positive operating cash flow", "Profitability", cfo(c) == null ? null : cfo(c)! > 0, "cash from operations > 0"),
          test("ROA improved", "Profitability", roaC == null || roaP == null ? null : roaC > roaP, `${pct(roaP)} → ${pct(roaC)}`),
          test("Cash flow exceeds profit (earnings quality)", "Profitability", cfo(c) == null || ni(c) == null ? null : cfo(c)! > ni(c)!, "operating cash flow > net income"),
          test("Long-term debt ratio fell", "Leverage & liquidity", ta(c) && ta(p) ? ltd(c) / ta(c)! <= ltd(p) / ta(p)! : null, `${pct(ta(p) ? ltd(p) / ta(p)! : null)} → ${pct(ta(c) ? ltd(c) / ta(c)! : null)} of assets`),
          test("Current ratio improved", "Leverage & liquidity", cr(c) == null || cr(p) == null ? null : cr(c)! > cr(p)!, `${cr(p)?.toFixed(2) ?? "n/a"} → ${cr(c)?.toFixed(2) ?? "n/a"}`),
          test("No new shares issued", "Leverage & liquidity", sh(c) == null || sh(p) == null ? null : sh(c)! <= sh(p)! * 1.005, "share count not up"),
          test("Gross margin improved", "Efficiency", gm(c) == null || gm(p) == null ? null : gm(c)! > gm(p)!, `${pct(gm(p))} → ${pct(gm(c))}`),
          test("Asset turnover improved", "Efficiency", at(c) == null || at(p) == null ? null : at(c)! > at(p)!, `${at(p)?.toFixed(2) ?? "n/a"} → ${at(c)?.toFixed(2) ?? "n/a"}`),
        ];
        const fScore = tests.filter((t) => t.pass === true).length;
        const scored = tests.filter((t) => t.pass !== null).length;
        // Altman Z (original, public manufacturers). Market cap is in trading currency → convert to reporting currency.
        const currency = qs?.price?.currency ?? "USD", reporting = qs?.financialData?.financialCurrency ?? currency;
        const fx = await fxRate(currency, reporting);
        const mcap = num(qs?.price?.marketCap);
        const TA = ta(c), TL = g(c, "totalLiabilitiesNetMinorityInterest");
        const wc = g(c, "workingCapital") ?? (g(c, "currentAssets") != null && g(c, "currentLiabilities") != null ? g(c, "currentAssets")! - g(c, "currentLiabilities")! : null);
        const re = g(c, "retainedEarnings"), ebit = g(c, "EBIT", "operatingIncome"), sales = g(c, "totalRevenue");
        const parts = TA && TL && wc != null && re != null && ebit != null && sales != null && mcap && fx
          ? { x1: wc / TA, x2: re / TA, x3: ebit / TA, x4: (mcap * fx) / TL, x5: sales / TA }
          : null;
        const z = parts ? 1.2 * parts.x1 + 1.4 * parts.x2 + 3.3 * parts.x3 + 0.6 * parts.x4 + 1.0 * parts.x5 : null;
        const financial = /bank|insurance|financial|capital markets|credit/i.test(`${qs?.assetProfile?.sector ?? ""} ${qs?.assetProfile?.industry ?? ""}`);
        return {
          symbol: clean(s),
          periods: [toDate(p.date), toDate(c.date)],
          fScore,
          scoredTests: scored,
          tests,
          altman: z == null ? null : { z: round(z, 2), zone: z > 2.99 ? "Safe" : z > 1.81 ? "Grey" : "Distress", parts: Object.fromEntries(Object.entries(parts!).map(([k, x]) => [k, round(x, 4)])) },
          financialSector: financial,
          note: financial ? "Banks and insurers have different balance-sheet structures; Piotroski and Altman scores are not meaningful for them." : null,
        };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, periods: o.periods, fScore: `${o.fScore}/${o.scoredTests} tests passed`, tests: o.tests.map((t: any) => `${t.pass === null ? "n/a" : t.pass ? "PASS" : "FAIL"} · ${t.name} (${t.detail})`), altman: o.altman, note: o.note })),
  }),

  runSipBacktest: tool({
    description:
      "SIP backtest: invests a fixed amount every month in a stock, index or ETF over past years and reports total invested, current value, XIRR, and a lump-sum comparison. Great for 'what if I had done a SIP in X'. Uses dividend-adjusted prices for stocks; indices like ^NSEI are price-only (no dividends), so say so. Downloadable as an Excel model with the monthly schedule and XIRR formula.",
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
        if (months.length < 6) throw new Error("No data: not enough monthly history for this SIP period");
        const [last] = await fetchQuotes([s]).catch(() => []);
        const lastPrice = last?.price ?? months.at(-1)![1];
        let units = 0;
        const schedule = months.map(([date, price]) => {
          const bought = monthlyAmount / price;
          units += bought;
          return { date, price: round(price, 2)!, units: round(bought, 6)!, cumulativeUnits: round(units, 6)!, invested: 0, value: 0 };
        });
        schedule.forEach((r, i) => { r.invested = monthlyAmount * (i + 1); r.value = round(r.cumulativeUnits * r.price, 2)!; });
        const invested = monthlyAmount * schedule.length;
        const value = units * lastPrice;
        const rate = xirr([...schedule.map((r) => ({ date: new Date(r.date), amount: -monthlyAmount })), { date: new Date(), amount: value }]);
        const lumpUnits = invested / months[0][1];
        return {
          symbol: px.symbol,
          currency: last?.currency ?? px.currency,
          monthlyAmount,
          years,
          installments: schedule.length,
          invested: round(invested, 2),
          value: round(value, 2),
          gain: round(value - invested, 2),
          absoluteReturn: round(value / invested - 1),
          xirr: round(rate),
          lastPrice: round(lastPrice, 2),
          lumpSum: { value: round(lumpUnits * lastPrice, 2), return: round((lumpUnits * lastPrice) / invested - 1) },
          schedule,
        };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, currency: o.currency, monthlyAmount: o.monthlyAmount, years: o.years, installments: o.installments, invested: o.invested, value: o.value, gain: o.gain, xirr: o.xirr, absoluteReturn: o.absoluteReturn, lumpSum: o.lumpSum })),
  }),

  getTechnicalIndicators: tool({
    description:
      "Technical snapshot: 20/50/200-day moving averages, RSI(14), MACD(12,26,9), distance from 52-week high/low, and plain-English trend signals (golden/death cross, overbought/oversold). Renders price + moving averages and RSI charts. Educational, not trading advice.",
    inputSchema: z.object({ symbol }),
    execute: async ({ symbol: s }) =>
      safe(async () => {
        const px = await closes(s, "2y", "1d");
        const dates = [...px.map.keys()].sort();
        const c = dates.map((d) => px.map.get(d)!);
        if (c.length < 210) throw new Error("No data: need ~200 trading days of history");
        const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200), r = rsi(c);
        const e12 = ema(c, 12), e26 = ema(c, 26), macd = c.map((_, i) => e12[i] - e26[i]), signal = ema(macd, 9);
        const i = c.length - 1;
        const yr = c.slice(-252), hi = Math.max(...yr), lo = Math.min(...yr);
        const crossedRecently = (a: (number | null)[], b: (number | null)[], look = 20) => {
          for (let k = i; k > i - look && k > 0; k--) {
            if (a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null) {
              if (a[k]! > b[k]! && a[k - 1]! <= b[k - 1]!) return "up";
              if (a[k]! < b[k]! && a[k - 1]! >= b[k - 1]!) return "down";
            }
          }
          return null;
        };
        const cross = crossedRecently(s50, s200);
        const signals = [
          `${c[i] > s200[i]! ? "Above" : "Below"} its 200-day average (long-term trend ${c[i] > s200[i]! ? "up" : "down"})`,
          `${c[i] > s50[i]! ? "Above" : "Below"} its 50-day average`,
          cross === "up" ? "Golden cross in the last month (50-day crossed above 200-day)" : cross === "down" ? "Death cross in the last month (50-day crossed below 200-day)" : `50-day average is ${s50[i]! > s200[i]! ? "above" : "below"} the 200-day`,
          r[i]! >= 70 ? `RSI ${r[i]!.toFixed(0)}: overbought territory` : r[i]! <= 30 ? `RSI ${r[i]!.toFixed(0)}: oversold territory` : `RSI ${r[i]!.toFixed(0)}: neutral`,
          `MACD ${macd[i] > signal[i] ? "above" : "below"} its signal line (${macd[i] > signal[i] ? "bullish" : "bearish"} momentum)`,
        ];
        const from = Math.max(0, c.length - 252);
        return {
          symbol: px.symbol,
          currency: px.currency,
          last: { date: dates[i], price: round(c[i], 2), sma20: round(s20[i], 2), sma50: round(s50[i], 2), sma200: round(s200[i], 2), rsi14: round(r[i], 1), macd: round(macd[i], 3), macdSignal: round(signal[i], 3) },
          range52w: { high: round(hi, 2), low: round(lo, 2), fromHigh: round(c[i] / hi - 1), fromLow: round(c[i] / lo - 1) },
          signals,
          series: dates.slice(from).map((d, k) => ({ date: d, close: round(c[from + k], 2), sma50: round(s50[from + k], 2), sma200: round(s200[from + k], 2), rsi: round(r[from + k], 1) })),
        };
      }),
    toModelOutput: forModel((o) => ({ symbol: o.symbol, last: o.last, range52w: o.range52w, signals: o.signals })),
  }),
};
