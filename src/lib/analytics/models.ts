/**
 * The seven quant models as pure functions, so the nightly checkup, the portfolio views, the Ask
 * tools and the tests all share one implementation working on stored data.
 */
import type { HealthInfo } from "@/lib/db/schema";
import { alignSeries, corr, ema, mean, median, pctReturns, periodsPerYear, round, rsi, sample, sma, stdev, xirr } from "./stats";

/* ------------------------------------------------------------------ */
/* Risk & return vs a benchmark                                        */
/* ------------------------------------------------------------------ */

export function riskReturn(stock: Map<string, number>, bench: Map<string, number>, opts: { interval?: string; riskFree?: number } = {}) {
  const { dates, prices } = alignSeries([stock, bench]);
  if (dates.length < 20) throw new Error("No data: too few overlapping dates with the benchmark");
  const [pa, pb] = prices;
  const ra = pctReturns(pa), rb = pctReturns(pb);
  const ppy = periodsPerYear(opts.interval ?? "1d");
  const rf = opts.riskFree ?? 0.065;
  const years = (new Date(dates.at(-1)!).getTime() - new Date(dates[0]).getTime()) / (365.25 * 86400000);
  const cagr = (pa.at(-1)! / pa[0]) ** (1 / years) - 1;
  const bCagr = (pb.at(-1)! / pb[0]) ** (1 / years) - 1;
  const vol = stdev(ra) * Math.sqrt(ppy);
  const downside = Math.sqrt(mean(ra.map((r) => Math.min(r, 0) ** 2))) * Math.sqrt(ppy);
  const b = beta(ra, rb);
  let peak = -Infinity, maxDd = 0;
  for (const p of pa) { peak = Math.max(peak, p); maxDd = Math.min(maxDd, p / peak - 1); }
  return {
    dates,
    pa,
    pb,
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
      beta: round(b, 2),
      alpha: round(cagr - (rf + (b ?? 1) * (bCagr - rf))),
      correlation: round(corr(ra, rb), 2),
    },
    series: sample(dates.map((d, i) => ({ date: d, stock: round((pa[i] / pa[0]) * 100, 2), benchmark: round((pb[i] / pb[0]) * 100, 2) })), 260),
  };
}

/** OLS beta of returns `ra` on benchmark returns `rb` (population covariance / population variance). */
export function beta(ra: number[], rb: number[]): number | null {
  if (ra.length < 20 || ra.length !== rb.length) return null;
  const ma = mean(ra), mb = mean(rb);
  let cov = 0, varB = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2;
  }
  return varB ? cov / varB : null;
}

/** 1-year daily beta and annualised volatility from stored closes (replaces Yahoo's unreliable NSE beta). */
export function betaAndVol(stock: Map<string, number>, bench: Map<string, number>, lookback = 252) {
  const { dates, prices } = alignSeries([stock, bench]);
  const from = Math.max(0, dates.length - lookback - 1);
  const pa = prices[0]?.slice(from) ?? [], pb = prices[1]?.slice(from) ?? [];
  const ra = pctReturns(pa), rb = pctReturns(pb);
  return { beta: round(beta(ra, rb), 3), vol: ra.length >= 20 ? round(stdev(ra) * Math.sqrt(252)) : null, observations: ra.length };
}

/* ------------------------------------------------------------------ */
/* Correlation matrix                                                  */
/* ------------------------------------------------------------------ */

export function correlationMatrix(series: Map<string, number>[], interval = "1d") {
  const { dates, prices } = alignSeries(series);
  if (dates.length < 20) throw new Error("No data: too few overlapping trading dates (different exchanges/holidays?)");
  const rets = prices.map(pctReturns);
  const ppy = periodsPerYear(interval);
  return {
    dates,
    prices,
    observations: rets[0].length,
    matrix: rets.map((a) => rets.map((b) => round(corr(a, b), 3))),
    volatility: rets.map((r) => round(stdev(r) * Math.sqrt(ppy))),
  };
}

/* ------------------------------------------------------------------ */
/* Financial health: Piotroski F-score + Altman Z, and a lender check  */
/* ------------------------------------------------------------------ */

type Row = Record<string, any>;
const g = (r: Row | undefined, ...ks: string[]) => {
  for (const k of ks) {
    const v = r?.[k];
    const x = typeof v === "number" ? v : typeof v === "object" && v && "raw" in v ? v.raw : v == null ? null : Number(v);
    if (x != null && Number.isFinite(x)) return x as number;
  }
  return null;
};
const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
const pctStr = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export const FINANCIAL_RE = /bank|insurance|financial|capital markets|credit|lending|asset management/i;

/**
 * Piotroski (9 tests on the last two fiscal years) + Altman Z (original formula; market cap must be
 * in the reporting currency). `rows` are annual fundamentals sorted oldest → newest.
 */
export function piotroskiAltman(rows: Row[], opts: { marketCapReporting: number | null }) {
  if (rows.length < 2) throw new Error("No fundamentals: need two fiscal years of statements");
  const [p, c] = rows.slice(-2);
  const ni = (r: Row) => g(r, "netIncome", "netIncomeCommonStockholders"), ta = (r: Row) => g(r, "totalAssets"), cfo = (r: Row) => g(r, "operatingCashFlow");
  const ltd = (r: Row) => g(r, "longTermDebt", "longTermDebtAndCapitalLeaseObligation") ?? 0;
  const cr = (r: Row) => ratio(g(r, "currentAssets"), g(r, "currentLiabilities"));
  const gm = (r: Row) => ratio(g(r, "grossProfit"), g(r, "totalRevenue"));
  const at = (r: Row) => ratio(g(r, "totalRevenue"), ta(r));
  const sh = (r: Row) => g(r, "ordinarySharesNumber", "shareIssued", "dilutedAverageShares");
  const test = (name: string, group: string, ok: boolean | null, detail: string) => ({ name, group, pass: ok, detail });
  const roaC = ratio(ni(c), ta(c)), roaP = ratio(ni(p), ta(p));
  const tests = [
    test("Positive net income", "Profitability", ni(c) == null ? null : ni(c)! > 0, `ROA ${pctStr(roaC)}`),
    test("Positive operating cash flow", "Profitability", cfo(c) == null ? null : cfo(c)! > 0, "cash from operations > 0"),
    test("ROA improved", "Profitability", roaC == null || roaP == null ? null : roaC > roaP, `${pctStr(roaP)} → ${pctStr(roaC)}`),
    test("Cash flow exceeds profit (earnings quality)", "Profitability", cfo(c) == null || ni(c) == null ? null : cfo(c)! > ni(c)!, "operating cash flow > net income"),
    test("Long-term debt ratio fell", "Leverage & liquidity", ta(c) && ta(p) ? ltd(c) / ta(c)! <= ltd(p) / ta(p)! : null, `${pctStr(ta(p) ? ltd(p) / ta(p)! : null)} → ${pctStr(ta(c) ? ltd(c) / ta(c)! : null)} of assets`),
    test("Current ratio improved", "Leverage & liquidity", cr(c) == null || cr(p) == null ? null : cr(c)! > cr(p)!, `${cr(p)?.toFixed(2) ?? "n/a"} → ${cr(c)?.toFixed(2) ?? "n/a"}`),
    test("No new shares issued", "Leverage & liquidity", sh(c) == null || sh(p) == null ? null : sh(c)! <= sh(p)! * 1.005, "share count not up"),
    test("Gross margin improved", "Efficiency", gm(c) == null || gm(p) == null ? null : gm(c)! > gm(p)!, `${pctStr(gm(p))} → ${pctStr(gm(c))}`),
    test("Asset turnover improved", "Efficiency", at(c) == null || at(p) == null ? null : at(c)! > at(p)!, `${at(p)?.toFixed(2) ?? "n/a"} → ${at(c)?.toFixed(2) ?? "n/a"}`),
  ];
  const fScore = tests.filter((t) => t.pass === true).length;
  const scoredTests = tests.filter((t) => t.pass !== null).length;
  const TA = ta(c), TL = g(c, "totalLiabilitiesNetMinorityInterest");
  const wc = g(c, "workingCapital") ?? (g(c, "currentAssets") != null && g(c, "currentLiabilities") != null ? g(c, "currentAssets")! - g(c, "currentLiabilities")! : null);
  const re = g(c, "retainedEarnings"), ebit = g(c, "EBIT", "operatingIncome"), sales = g(c, "totalRevenue");
  const mcap = opts.marketCapReporting;
  const parts = TA && TL && wc != null && re != null && ebit != null && sales != null && mcap
    ? { x1: wc / TA, x2: re / TA, x3: ebit / TA, x4: mcap / TL, x5: sales / TA }
    : null;
  const z = parts ? 1.2 * parts.x1 + 1.4 * parts.x2 + 3.3 * parts.x3 + 0.6 * parts.x4 + 1.0 * parts.x5 : null;
  const date = (r: Row) => (r?.date ? new Date(r.date).toISOString().slice(0, 10) : null);
  return {
    periods: [date(p), date(c)],
    fScore,
    scoredTests,
    tests,
    altman: z == null ? null : { z: round(z, 2)!, zone: (z > 2.99 ? "Safe" : z > 1.81 ? "Grey" : "Distress") as "Safe" | "Grey" | "Distress", parts: Object.fromEntries(Object.entries(parts!).map(([k, x]) => [k, round(x, 4)])) },
  };
}

/**
 * Banks and NBFCs: Piotroski/Altman don't apply (different balance-sheet structure). A simple,
 * clearly labelled 4-test check built from the metric catalog instead.
 */
export function lenderCheck(m: Record<string, number | null | undefined>, industry: string | null) {
  const isBank = /bank/i.test(industry ?? "");
  const roaMin = isBank ? 0.01 : 0.02;
  const t = (name: string, v: number | null | undefined, pass: (x: number) => boolean, detail: (x: number) => string) =>
    ({ name, pass: v == null ? null : pass(v), detail: v == null ? "n/a" : detail(v) });
  const tests = [
    t("Return on equity at least 12%", m.returnOnEquity, (x) => x >= 0.12, (x) => `ROE ${pctStr(x)}`),
    t(`Return on assets at least ${isBank ? "1" : "2"}%`, m.returnOnAssets, (x) => x >= roaMin, (x) => `ROA ${pctStr(x)}`),
    t("Profit grew over the year", m.earningsGrowth, (x) => x > 0, (x) => `${x >= 0 ? "+" : ""}${pctStr(x)}`),
    t("Revenue grew over the year", m.revenueGrowth, (x) => x > 0, (x) => `${x >= 0 ? "+" : ""}${pctStr(x)}`),
  ];
  return { tests, passed: tests.filter((x) => x.pass === true).length, scored: tests.filter((x) => x.pass !== null).length };
}

/** Per-stock health score 0–100: 60% Piotroski + 40% Altman zone (lenders: share of lender tests passed). */
export function healthScore(h: Pick<HealthInfo, "kind" | "fScore" | "scoredTests" | "altmanZone" | "lenderPassed" | "lenderTests">): number | null {
  if (h.kind === "lender") {
    const scored = (h.lenderTests ?? []).filter((x) => x.pass !== null).length;
    return scored >= 2 ? Math.round(((h.lenderPassed ?? 0) / scored) * 100) : null;
  }
  if (h.kind !== "piotroski" || h.fScore == null || !h.scoredTests || h.scoredTests < 5) return null;
  const f = (h.fScore / h.scoredTests) * 100;
  if (!h.altmanZone) return Math.round(f);
  const z = h.altmanZone === "Safe" ? 100 : h.altmanZone === "Grey" ? 55 : 15;
  return Math.round(0.6 * f + 0.4 * z);
}

/** Builds the stored HealthInfo for a stock from whatever data is available. */
export function buildHealth(args: { rows: Row[]; metrics: Record<string, number | null | undefined>; sector: string | null; industry: string | null; marketCapReporting: number | null }): HealthInfo {
  const financial = FINANCIAL_RE.test(`${args.sector ?? ""} ${args.industry ?? ""}`);
  if (financial) {
    const l = lenderCheck(args.metrics, args.industry);
    const info: HealthInfo = { kind: "lender", score: null, lenderPassed: l.passed, lenderTests: l.tests };
    info.score = healthScore(info);
    return info;
  }
  try {
    const pa = piotroskiAltman(args.rows, { marketCapReporting: args.marketCapReporting });
    const info: HealthInfo = { kind: "piotroski", score: null, fScore: pa.fScore, scoredTests: pa.scoredTests, altmanZ: pa.altman?.z ?? null, altmanZone: pa.altman?.zone ?? null, tests: pa.tests, periods: pa.periods };
    info.score = healthScore(info);
    return info;
  } catch {
    return { kind: "none", score: null };
  }
}

/* ------------------------------------------------------------------ */
/* DuPont                                                              */
/* ------------------------------------------------------------------ */

export function dupont(rows: Row[]) {
  const years = rows
    .map((r) => {
      const ni = g(r, "netIncome", "netIncomeCommonStockholders"), rev = g(r, "totalRevenue"), ta = g(r, "totalAssets"), eq = g(r, "stockholdersEquity", "commonStockEquity");
      return { period: r?.date ? new Date(r.date).toISOString().slice(0, 10) : "", netIncome: ni, revenue: rev, totalAssets: ta, equity: eq };
    })
    .filter((y) => y.netIncome != null && y.revenue && y.totalAssets && y.equity)
    .map((y) => {
      const netMargin = y.netIncome! / y.revenue!, turnover = y.revenue! / y.totalAssets!, multiplier = y.totalAssets! / y.equity!;
      return { ...y, netMargin: round(netMargin), assetTurnover: round(turnover), equityMultiplier: round(multiplier, 3), roe: round(netMargin * turnover * multiplier) };
    })
    .slice(-5);
  if (!years.length) throw new Error("No fundamentals: statement data unavailable for DuPont analysis");
  return years;
}

/* ------------------------------------------------------------------ */
/* Comparable-company valuation                                        */
/* ------------------------------------------------------------------ */

const COMP_MULTIPLES = ["trailingPE", "forwardPE", "evToEbitda", "priceToBook", "priceToSales"] as const;
type MetricLike = { metrics: Record<string, number | null | undefined> };

export function comps(target: MetricLike, peers: MetricLike[], shares: number | null) {
  const v = (m: MetricLike, k: string) => m.metrics[k] ?? null;
  const med: Record<string, number | null> = {};
  for (const k of COMP_MULTIPLES) med[k] = median(peers.map((p) => v(p, k)).filter((x): x is number => x != null && x > 0 && x < 500));
  const netDebt = (v(target, "totalDebt") ?? 0) - (v(target, "totalCash") ?? 0);
  const price = v(target, "price");
  const pos = (k: string) => (v(target, k) ?? 0) > 0;
  const implied: Record<string, number | null> = {
    trailingPE: med.trailingPE && pos("trailingEps") ? med.trailingPE * v(target, "trailingEps")! : null,
    forwardPE: med.forwardPE && pos("forwardEps") ? med.forwardPE * v(target, "forwardEps")! : null,
    evToEbitda: med.evToEbitda && pos("ebitda") && shares ? (med.evToEbitda * v(target, "ebitda")! - netDebt) / shares : null,
    priceToBook: med.priceToBook && pos("bookValue") ? med.priceToBook * v(target, "bookValue")! : null,
    priceToSales: med.priceToSales && pos("revenue") && shares ? (med.priceToSales * v(target, "revenue")!) / shares : null,
  };
  const vals = Object.values(implied).filter((x): x is number => x != null && x > 0);
  const blended = vals.length ? mean(vals) : null;
  return { medians: med, implied, blended, netDebt, price, upside: price && blended ? blended / price - 1 : null };
}

/** "Valuation vs peers" in plain words: P/E relative to the peer median. */
export function valuationVsPeers(pe: number | null | undefined, peerPes: (number | null | undefined)[]): { label: "cheaper" | "similar" | "pricier" | "unknown"; ratio: number | null; peerMedian: number | null } {
  const med = median(peerPes.filter((x): x is number => x != null && x > 0 && x < 500));
  if (pe == null || pe <= 0 || med == null) return { label: "unknown", ratio: null, peerMedian: med };
  const r = pe / med;
  return { label: r < 0.85 ? "cheaper" : r > 1.15 ? "pricier" : "similar", ratio: round(r, 2), peerMedian: round(med, 1) };
}

/* ------------------------------------------------------------------ */
/* SIP backtest                                                        */
/* ------------------------------------------------------------------ */

export function sipBacktest(months: [string, number][], monthlyAmount: number, lastPrice: number, today = new Date()) {
  if (months.length < 6) throw new Error("No data: not enough monthly history for this SIP period");
  let units = 0;
  const schedule = months.map(([date, price]) => {
    const bought = monthlyAmount / price;
    units += bought;
    return { date, price: round(price, 2)!, units: round(bought, 6)!, cumulativeUnits: round(units, 6)!, invested: 0, value: 0 };
  });
  schedule.forEach((r, i) => { r.invested = monthlyAmount * (i + 1); r.value = round(r.cumulativeUnits * r.price, 2)!; });
  const invested = monthlyAmount * schedule.length;
  const value = units * lastPrice;
  const rate = xirr([...schedule.map((r) => ({ date: new Date(r.date), amount: -monthlyAmount })), { date: today, amount: value }]);
  const lumpUnits = invested / months[0][1];
  return {
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
}

/* ------------------------------------------------------------------ */
/* Technicals                                                          */
/* ------------------------------------------------------------------ */

export function technicals(dates: string[], c: number[]) {
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
    `MACD ${macd[i] > signal[i] ? "above" : "below"} its signal line (${macd[i] > signal[i] ? "positive" : "negative"} momentum)`,
  ];
  const from = Math.max(0, c.length - 252);
  return {
    last: { date: dates[i], price: round(c[i], 2), sma20: round(s20[i], 2), sma50: round(s50[i], 2), sma200: round(s200[i], 2), rsi14: round(r[i], 1), macd: round(macd[i], 3), macdSignal: round(signal[i], 3) },
    range52w: { high: round(hi, 2), low: round(lo, 2), fromHigh: round(c[i] / hi - 1), fromLow: round(c[i] / lo - 1) },
    signals,
    series: dates.slice(from).map((d, k) => ({ date: d, close: round(c[from + k], 2), sma50: round(s50[from + k], 2), sma200: round(s200[from + k], 2), rsi: round(r[from + k], 1) })),
  };
}

/** Plain-language trend for holding cards: where the price sits vs its 200-day average. */
export function trendLabel(closes: number[]): { label: "uptrend" | "downtrend" | "sideways" | "unknown"; vs200: number | null } {
  if (closes.length < 200) {
    if (closes.length < 50) return { label: "unknown", vs200: null };
    const avg = mean(closes.slice(-50));
    const d = closes.at(-1)! / avg - 1;
    return { label: d > 0.03 ? "uptrend" : d < -0.03 ? "downtrend" : "sideways", vs200: null };
  }
  const avg = mean(closes.slice(-200));
  const d = closes.at(-1)! / avg - 1;
  return { label: d > 0.03 ? "uptrend" : d < -0.03 ? "downtrend" : "sideways", vs200: round(d) };
}
