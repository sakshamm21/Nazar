/**
 * One large, successful result per Ask tool, in the shape its `execute` returns. Made up, but big
 * enough to behave like a real chart or table: every one is well past the size at which an old
 * result gets cut down. Keyed by tool name, so adding a tool without a sample fails the tests.
 */
import type { ToolName } from "@/lib/ask/registry";

const pad = (n: number) => "lorem ipsum dolor sit amet ".repeat(Math.ceil(n / 27)).slice(0, n);
const rows = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));
const day = (i: number) => `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
const watching = { items: rows(30, (i) => ({ symbol: `W${i}.NS`, name: `Watched company ${i} ${pad(60)}`, currency: "INR", price: 100 + i, changePercent: 0.4, marketState: null })) };

export const TOOL_RESULTS: Record<ToolName, { input: Record<string, unknown>; output: Record<string, unknown> }> = {
  searchTicker: { input: { query: "tata" }, output: { query: "tata", results: rows(8, (i) => ({ symbol: `TATA${i}.NS`, name: `Tata company ${i} ${pad(380)}`, exchange: "NSE", type: "EQUITY" })) } },
  getQuote: { input: { symbols: ["TCS.NS"] }, output: { quotes: rows(10, (i) => ({ symbol: `Q${i}.NS`, name: `Quoted company ${i} ${pad(200)}`, currency: "INR", price: 100 + i, changePercent: 1.2, marketCap: 1e12 })) } },
  getPriceHistory: {
    input: { symbol: "TITAN.NS", range: "5y" },
    output: { symbol: "TITAN.NS", currency: "INR", range: "5y", interval: "1wk", points: rows(260, (i) => ({ date: day(i), close: 3000 + i, volume: 1_000_000 + i })), dividends: [{ date: "2026-07-01", amount: 11 }], stats: { start: 3000, end: 3259, returnPct: 0.086, high: 3259, low: 3000, volatility: 0.24, maxDrawdown: -0.31 } },
  },
  getKeyMetrics: { input: { symbol: "TCS.NS" }, output: { symbol: "TCS.NS", name: "Tata Consultancy Services", currency: "INR", fxNote: null, metrics: rows(42, (i) => ({ key: `metric${i}`, label: `Metric number ${i}`, category: "Valuation", format: "ratio", value: i * 1.5 })) } },
  getFinancialStatements: { input: { symbol: "RELIANCE.NS" }, output: { symbol: "RELIANCE.NS", currency: "INR", statement: "income", period: "annual", fields: rows(9, (i) => ({ key: `f${i}`, label: `Field ${i}` })), periods: rows(6, (i) => ({ period: `202${i}-03-31`, note: pad(500), f0: 1e12 + i })) } },
  compareStocks: {
    input: { symbols: ["TCS.NS", "INFY.NS"] },
    output: { symbols: [{ symbol: "TCS.NS", name: "TCS" }, { symbol: "INFY.NS", name: "Infosys" }], currencies: ["INR", "INR"], notFound: [], metrics: rows(30, (i) => ({ key: `metric${i}`, label: `Metric number ${i} ${pad(60)}`, format: "ratio", values: [i, i + 1] })) },
  },
  getEarnings: { input: { symbol: "SUNPHARMA.NS" }, output: { symbol: "SUNPHARMA.NS", currency: "INR", currencyUncertain: false, nextEarningsDate: "2026-11-01", history: rows(40, (i) => ({ quarter: day(i), actual: 10 + i, estimate: 9 + i, surprisePct: 0.05, note: pad(60) })), quarterly: [], estimates: [] } },
  getCompanyProfile: { input: { symbol: "ITC.NS" }, output: { symbol: "ITC.NS", name: "ITC Limited", sector: "Consumer Defensive", industry: "Tobacco", employees: 37000, location: "Kolkata, India", website: "https://example.com", summary: pad(3000), officers: [{ name: "A Person", title: "Chairman" }] } },
  getNews: { input: { query: "Zomato" }, output: { query: "Zomato", articles: rows(10, (i) => ({ title: `Headline ${i} ${pad(200)}`, publisher: "Example Times", link: `https://example.com/${pad(80).replace(/ /g, "-")}`, published: day(i), tickers: [] })) } },
  getMarketMovers: { input: { screen: "day_gainers" }, output: { screen: "day_gainers", title: "Day gainers", rows: rows(25, (i) => ({ symbol: `US${i}`, name: `US company ${i} ${pad(80)}`, currency: "USD", price: 10 + i, changePercent: 5, volume: 1e6, marketCap: 1e9 })) } },
  getIndianMarketMovers: { input: { screen: "gainers" }, output: { screen: "gainers", title: "Nifty 50 · top gainers", rows: rows(25, (i) => ({ symbol: `IN${i}.NS`, name: `Indian company ${i} ${pad(80)}`, currency: "INR", price: 100 + i, changePercent: 3, volume: 1e6, marketCap: 1e11 })) } },
  getMarketOverview: { input: { region: "IN" }, output: { region: "IN", indices: rows(16, (i) => ({ symbol: `^INDEX${i}`, label: `Index number ${i} ${pad(120)}`, price: 20000 + i, change: 12.5, changePercent: 0.06, marketState: "REGULAR", currency: "INR" })) } },
  getOwnership: { input: { symbol: "ITC.NS" }, output: { symbol: "ITC.NS", currency: "INR", insidersPct: 0.01, institutionsPct: 0.4, institutionCount: 900, topHolders: rows(8, (i) => ({ organization: `Fund house ${i} ${pad(200)}`, pctHeld: 0.02, shares: 1e7, value: 1e9, reportDate: day(i) })), insiderTransactions: rows(8, (i) => ({ name: `Person ${i}`, relation: "Director", text: pad(200), shares: 1000, value: 1e5, date: day(i) })) } },
  runDcfValuation: {
    input: { symbol: "INFY.NS" },
    output: { symbol: "INFY.NS", currency: "INR", financialCurrency: "INR", fxConversion: null, price: 1500, intrinsicValue: 1650, upside: 0.1, assumptions: { fcf: 2e11, cash: 3e11, debt: 1e10, shares: 4e9, growthRate: 0.08, terminalGrowth: 0.025, discountRate: 0.12, years: 5 }, projections: rows(10, (i) => ({ year: i + 1, fcf: 2e11 + i, pv: 1.8e11 - i, note: pad(200) })), breakdown: { pvFcf: 8e11, pvTerminal: 5e12, netCash: 2.9e11, equity: 6e12 }, sensitivity: { growthRates: [0.04, 0.06, 0.08, 0.1, 0.12], discountRates: [0.11, 0.12, 0.13], grid: rows(3, () => rows(5, (j) => 1400 + j * 100)) } },
  },
  getRiskReturn: { input: { symbol: "ADANIENT.NS" }, output: { symbol: "ADANIENT.NS", benchmark: "^NSEI", currency: "INR", range: "3y", interval: "1wk", riskFree: 0.065, stats: { cagr: 0.18, volatility: 0.42, sharpe: 0.3, sortino: 0.5, maxDrawdown: -0.55, beta: 1.6, alpha: 0.02, correlation: 0.6 }, series: rows(156, (i) => ({ date: day(i), a: 100 + i, b: 100 + i / 2 })), prices: rows(156, (i) => [day(i), 2000 + i, 22000 + i]) } },
  getCorrelationMatrix: { input: { symbols: ["TCS.NS", "ITC.NS"] }, output: { symbols: ["TCS.NS", "ITC.NS"], range: "1y", interval: "1d", observations: 250, matrix: [[1, 0.2], [0.2, 1]], volatility: [0.2, 0.18], prices: rows(250, (i) => [day(i), 3000 + i, 400 + i]) } },
  runComparableValuation: { input: { symbol: "HDFCBANK.NS", peers: ["ICICIBANK.NS", "AXISBANK.NS"] }, output: { symbol: "HDFCBANK.NS", name: "HDFC Bank", currency: "INR", price: 950, shares: 7e9, netDebt: 0, inputs: { trailingEps: 45 }, target: { symbol: "HDFCBANK.NS", name: "HDFC Bank", trailingPE: 21 }, peers: rows(8, (i) => ({ symbol: `PEER${i}.NS`, name: `Peer bank ${i} ${pad(300)}`, currency: "INR", trailingPE: 15 + i })), missingPeers: [], medians: { trailingPE: 18 }, implied: { trailingPE: 810 }, blended: 870, upside: -0.08, fxNote: null } },
  getDupontAnalysis: { input: { symbol: "ASIANPAINT.NS" }, output: { symbol: "ASIANPAINT.NS", currency: "INR", years: rows(5, (i) => ({ period: `202${i}-03-31`, netMargin: 0.12, assetTurnover: 1.1, equityMultiplier: 1.6, roe: 0.21, revenue: 3e11, netIncome: 4e10, note: pad(600) })) } },
  getFinancialHealthScore: { input: { symbol: "TATASTEEL.NS" }, output: { symbol: "TATASTEEL.NS", periods: ["2026-03-31", "2025-03-31"], fScore: 6, scoredTests: 9, tests: rows(9, (i) => ({ name: `Accounting test ${i}`, group: "Profitability", pass: i % 3 !== 0, detail: pad(300) })), altman: { z: 2.4, zone: "Grey" }, financialSector: false, score: 64, note: null } },
  runSipBacktest: { input: { symbol: "^NSEI" }, output: { symbol: "^NSEI", currency: "INR", monthlyAmount: 10000, years: 5, installments: 60, invested: 600000, value: 820000, gain: 220000, xirr: 0.13, absoluteReturn: 0.37, lumpSum: { value: 900000, cagr: 0.085 }, schedule: rows(60, (i) => ({ date: day(i), price: 20000 + i, units: 0.5, invested: 10000 * (i + 1), value: 10500 * (i + 1) })) } },
  getTechnicalIndicators: { input: { symbol: "TMPV.NS" }, output: { symbol: "TMPV.NS", currency: "INR", last: { close: 700, sma50: 690, sma200: 650, rsi: 58 }, range52w: { high: 800, low: 520, fromHigh: -0.125, fromLow: 0.35 }, signals: ["Price is above its 200-day average"], series: rows(480, (i) => ({ date: day(i), close: 600 + i / 5, sma50: 590 + i / 5, sma200: 560 + i / 5, rsi: 50 })) } },
  getMyPortfolio: { input: {}, output: { portfolios: ["Main"], portfolio: "Main", asOf: "2026-10-06", value: 1234567, invested: 1000000, unrealised: 234567, unrealisedPct: 0.2346, today: { change: -4321, changePct: -0.0035, niftyPct: -0.002, explanation: "You're down ₹4,321 today (-0.35%)." }, holdings: rows(25, (i) => ({ symbol: `HOLD${i}.NS`, name: `Held company ${i} ${pad(120)}`, type: "Stock", weight: 0.04, value: 49382, pnlPct: 0.12 })) } },
  getWatchlist: { input: {}, output: watching },
  addToWatchlist: { input: { symbols: ["TITAN.NS"] }, output: { added: ["TITAN.NS"], ...watching } },
  removeFromWatchlist: { input: { symbols: ["TITAN.NS"] }, output: { removed: ["TITAN.NS"], ...watching } },
};
