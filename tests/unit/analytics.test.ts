import { describe, expect, it } from "vitest";
import { beta, betaAndVol, buildHealth, comps, correlationMatrix, dupont, healthScore, lenderCheck, piotroskiAltman, riskReturn, sipBacktest, technicals, topByWeight, trendLabel, valuationVsPeers } from "@/lib/analytics/models";
import { corr, median, xirr } from "@/lib/analytics/stats";

const days = (n: number, start = "2025-01-01") => Array.from({ length: n }, (_, i) => new Date(new Date(start).getTime() + i * 86400000).toISOString().slice(0, 10));
const series = (vals: number[], start?: string) => new Map(days(vals.length, start).map((d, i) => [d, vals[i]]));

describe("stats", () => {
  it("xirr: 10% a year on a one-year round trip", () => {
    const r = xirr([{ date: new Date("2024-01-01"), amount: -1000 }, { date: new Date("2025-01-01"), amount: 1100 }]);
    expect(r).toBeCloseTo(0.0998, 3);
  });
  it("xirr: monthly SIP with a known answer (Excel XIRR ≈ 12.7%)", () => {
    const flows = Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.UTC(2024, i, 1)), amount: -1000 }));
    flows.push({ date: new Date(Date.UTC(2025, 0, 1)), amount: 12_700 });
    expect(xirr(flows)!).toBeGreaterThan(0.1);
    expect(xirr(flows)!).toBeLessThan(0.14);
  });
  it("xirr: needs money in and out", () => {
    expect(xirr([{ date: new Date(), amount: 100 }])).toBeNull();
    expect(xirr([{ date: new Date("2024-01-01"), amount: -100 }, { date: new Date("2025-01-01"), amount: -5 }])).toBeNull();
  });
  it("xirr: big losses still converge (bisection fallback)", () => {
    const r = xirr([{ date: new Date("2024-01-01"), amount: -1000 }, { date: new Date("2025-01-01"), amount: 50 }]);
    expect(r!).toBeCloseTo(-0.95, 2);
  });
  it("corr and median", () => {
    expect(corr([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(corr([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(median([3, 1, 2, NaN])).toBe(2);
  });
});

describe("risk & return (getRiskReturn maths)", () => {
  // Stock moves exactly 1.5× the benchmark every day → beta 1.5, correlation 1.
  const bench: number[] = [100], stock: number[] = [100];
  for (let i = 1; i < 260; i++) {
    const r = Math.sin(i / 3) * 0.01;
    bench.push(bench[i - 1] * (1 + r));
    stock.push(stock[i - 1] * (1 + 1.5 * r));
  }
  it("beta and correlation", () => {
    const rr = riskReturn(series(stock), series(bench));
    expect(rr.stats.beta).toBeCloseTo(1.5, 2);
    expect(rr.stats.correlation).toBeCloseTo(1, 2);
    expect(rr.stats.maxDrawdown!).toBeLessThan(0);
  });
  it("betaAndVol uses one year of stored closes", () => {
    const bv = betaAndVol(series(stock), series(bench));
    expect(bv.beta).toBeCloseTo(1.5, 2);
    expect(bv.vol!).toBeGreaterThan(0);
  });
  it("beta needs at least 20 observations", () => {
    expect(beta([0.01, 0.02], [0.01, 0.02])).toBeNull();
  });
  it("correlation matrix aligns dates and is symmetric", () => {
    const c = correlationMatrix([series(stock), series(bench), series(bench.map((x) => 200 - x))]);
    expect(c.matrix[0][1]).toBeCloseTo(1, 2);
    expect(c.matrix[1][2]).toBeCloseTo(-1, 1);
    expect(c.matrix[2][1]).toBe(c.matrix[1][2]);
  });
  it("correlation matrix is square with a unit diagonal and a mirrored off-diagonal", () => {
    // Each pair is computed once and mirrored, so every entry must still agree both ways.
    const list = [stock, bench, bench.map((x) => 200 - x), stock.map((x, i) => x + i)];
    const c = correlationMatrix(list.map((vals) => series(vals)));
    const n = list.length;
    expect(c.matrix).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      expect(c.matrix[i]).toHaveLength(n);
      expect(c.matrix[i][i]).toBe(1);
      for (let j = i + 1; j < n; j++) expect(c.matrix[i][j]).toBe(c.matrix[j][i]);
    }
  });
  it("topByWeight keeps the biggest positions and respects the cap", () => {
    const w: Record<string, number> = { a: 0.5, b: 0.2, c: 0.15, d: 0.1, e: 0.05 };
    expect(topByWeight(Object.keys(w), (s) => w[s])).toEqual(["a", "b", "c", "d", "e"]);
    expect(topByWeight(Object.keys(w), (s) => w[s], 2)).toEqual(["a", "b"]);
    // A symbol the weight map does not know ranks last rather than throwing.
    expect(topByWeight(["a", "zz"], (s) => w[s] ?? 0)).toEqual(["a", "zz"]);
  });
});

describe("financial health (Piotroski + Altman, lender check)", () => {
  const prev = { date: "2024-03-31", netIncome: 80, totalAssets: 1000, operatingCashFlow: 90, longTermDebt: 200, currentAssets: 300, currentLiabilities: 200, grossProfit: 300, totalRevenue: 900, ordinarySharesNumber: 100 };
  const cur = { date: "2025-03-31", netIncome: 120, totalAssets: 1050, operatingCashFlow: 150, longTermDebt: 180, currentAssets: 360, currentLiabilities: 200, grossProfit: 360, totalRevenue: 1000, ordinarySharesNumber: 100, totalLiabilitiesNetMinorityInterest: 500, workingCapital: 160, retainedEarnings: 400, EBIT: 170 };
  it("a steadily improving company passes all 9 tests and lands in the Safe zone", () => {
    const r = piotroskiAltman([prev, cur], { marketCapReporting: 2000 });
    expect(r.fScore).toBe(9);
    expect(r.scoredTests).toBe(9);
    expect(r.altman?.zone).toBe("Safe");
  });
  it("health score = 60% Piotroski + 40% Altman zone", () => {
    expect(healthScore({ kind: "piotroski", fScore: 9, scoredTests: 9, altmanZone: "Safe" })).toBe(100);
    expect(healthScore({ kind: "piotroski", fScore: 6, scoredTests: 9, altmanZone: "Grey" })).toBe(Math.round(0.6 * 66.667 + 0.4 * 55));
    expect(healthScore({ kind: "piotroski", fScore: 3, scoredTests: 9, altmanZone: null })).toBe(33);
    expect(healthScore({ kind: "piotroski", fScore: 3, scoredTests: 4, altmanZone: null })).toBeNull(); // too little data
  });
  it("banks get the lender check instead", () => {
    const h = buildHealth({ rows: [], metrics: { returnOnEquity: 0.15, returnOnAssets: 0.018, earningsGrowth: 0.05, revenueGrowth: -0.01 }, sector: "Financial Services", industry: "Banks - Regional", marketCapReporting: null });
    expect(h.kind).toBe("lender");
    expect(h.lenderPassed).toBe(3);
    expect(h.score).toBe(75);
    expect(lenderCheck({ returnOnAssets: 0.015 }, "Credit Services").tests[1].pass).toBe(false); // NBFCs need ROA ≥ 2%
  });
  it("missing statements → not scored, never a fake number", () => {
    expect(buildHealth({ rows: [cur], metrics: {}, sector: "Technology", industry: "IT", marketCapReporting: null })).toEqual({ kind: "none", score: null });
  });
  it("DuPont multiplies back to ROE", () => {
    const y = dupont([{ ...cur, stockholdersEquity: 400 }])[0];
    expect(y.roe!).toBeCloseTo(120 / 400, 3);
  });
});

describe("other models", () => {
  it("comps applies peer medians", () => {
    const r = comps({ metrics: { price: 100, trailingEps: 5, trailingPE: 20 } }, [{ metrics: { trailingPE: 24 } }, { metrics: { trailingPE: 26 } }, { metrics: { trailingPE: 600 } }], null);
    expect(r.medians.trailingPE).toBe(25); // 600 is ignored as an outlier
    expect(r.implied.trailingPE).toBe(125);
  });
  it("valuation vs peers in words", () => {
    expect(valuationVsPeers(20, [24, 26, 25]).label).toBe("cheaper");
    expect(valuationVsPeers(25, [24, 26]).label).toBe("similar");
    expect(valuationVsPeers(40, [24, 26]).label).toBe("pricier");
    expect(valuationVsPeers(null, [24]).label).toBe("unknown");
  });
  it("SIP backtest", () => {
    const months: [string, number][] = Array.from({ length: 12 }, (_, i) => [`2024-${String(i + 1).padStart(2, "0")}-01`, 100]);
    const r = sipBacktest(months, 1000, 110, new Date("2025-01-01"));
    expect(r.invested).toBe(12000);
    expect(r.value).toBe(13200);
    expect(r.xirr!).toBeGreaterThan(0.15);
  });
  it("technicals need 200 days and describe the trend without advice", () => {
    const c = Array.from({ length: 260 }, (_, i) => 100 + i);
    const t = technicals(days(260), c);
    expect(t.signals[0]).toMatch(/Above its 200-day average/);
    expect(t.signals.join(" ")).not.toMatch(/\b(buy|sell)\b/i);
    expect(trendLabel(c).label).toBe("uptrend");
    expect(trendLabel(c.slice().reverse()).label).toBe("downtrend");
  });
});
