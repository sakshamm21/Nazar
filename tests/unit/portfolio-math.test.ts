import { describe, expect, it } from "vitest";
import { adjustedBeta, attribution, concentration, correlationClusters, diversification, diversificationScore, effectiveBets, healthRollup, sectorAllocation, stressTest, valuation, xirrVsNifty, type HoldingState } from "@/lib/portfolio/math";
import { attributionLine, marketSplitLine } from "@/lib/alerts/templates";

const h = (o: Partial<HoldingState> & { symbol: string }): HoldingState => ({ name: o.symbol, sector: "IT", quantity: 10, avgPrice: 100, buyDate: null, price: 100, prevClose: 100, beta: 1, health: null, ...o });

describe("valuation and P&L", () => {
  it("adds up value, invested, unrealised and today's change", () => {
    const v = valuation([h({ symbol: "A", quantity: 10, avgPrice: 100, price: 120, prevClose: 110 }), h({ symbol: "B", quantity: 5, avgPrice: 200, price: 180, prevClose: 200 })]);
    expect(v.value).toBe(1200 + 900);
    expect(v.invested).toBe(1000 + 1000);
    expect(v.unrealised).toBe(100);
    expect(v.dayChange).toBe(100 - 100);
    expect(v.dayChangePct).toBe(0);
  });
  it("missing prices fall back to the last close, then the average price", () => {
    const v = valuation([h({ symbol: "A", price: null, prevClose: 90 }), h({ symbol: "B", price: null, prevClose: null, avgPrice: 50 })]);
    expect(v.value).toBe(900 + 500);
    expect(v.priced).toBe(0);
  });
});

describe("H2: why did my portfolio move today", () => {
  const down = [
    h({ symbol: "TMPV", name: "Tata Motors", quantity: 100, price: 94, prevClose: 100 }), // −600
    h({ symbol: "INFY", name: "Infosys", quantity: 10, price: 950, prevClose: 1000 }), // −500
    h({ symbol: "ITC", name: "ITC", quantity: 50, price: 99, prevClose: 100 }), // −50
    h({ symbol: "HDFC", name: "HDFC Bank", quantity: 10, price: 1010, prevClose: 1000 }), // +100
  ];
  it("names the smallest set of holdings that explains ≥ 60% of the move", () => {
    const a = attribution(down, -0.01);
    expect(a.kind).toBe("down");
    expect(a.total).toBe(-1050);
    expect(a.drivers.map((d) => d.name)).toEqual(["Tata Motors", "Infosys"]);
    expect(a.driversSum).toBe(-1100);
    expect(attributionLine(a).en).toBe("You're down ₹1,050 today (−3.0%). ₹1,100 of that came from Tata Motors and Infosys.");
  });
  it("mixed days name the biggest offset", () => {
    const a = attribution([h({ symbol: "A", name: "Infosys", quantity: 10, price: 1300, prevClose: 1000 }), h({ symbol: "B", name: "HDFC Bank", quantity: 10, price: 850, prevClose: 1000 })], 0);
    expect(a.kind).toBe("up");
    expect(a.offset?.name).toBe("HDFC Bank");
    expect(attributionLine(a).en).toContain("HDFC Bank took away ₹1,500");
  });
  it("flat and empty days say so calmly", () => {
    expect(attribution([h({ symbol: "A", price: 100.01, prevClose: 100 })], 0).kind).toBe("flat");
    expect(attributionLine(attribution([], 0)).en).toMatch(/Add holdings/);
  });
  it("splits each holding into a market part (beta × Nifty) and a stock-specific part", () => {
    const a = attribution([h({ symbol: "A", quantity: 10, price: 95, prevClose: 100, beta: 1 })], -0.02);
    const r = a.breakdown[0];
    expect(r.marketPart).toBeCloseTo(1000 * 1 * -0.02, 5);
    expect(r.marketPart + r.specificPart).toBeCloseTo(r.amount, 5);
  });
  it("explains offsetting parts honestly", () => {
    const a = attribution([h({ symbol: "A", quantity: 10, price: 101, prevClose: 100 })], -0.02);
    expect(marketSplitLine(a)!.en).toMatch(/The market alone would have cost you ₹20 today; what you own did ₹30 better than that\./);
  });
  it("has a Hindi line too", () => {
    expect(attributionLine(attribution(down, -0.01)).hi).toContain("आपका पोर्टफोलियो आज ₹1,050 नीचे है");
  });
});

describe("XIRR vs Nifty (public-market equivalent)", () => {
  it("compares against the same rupees in the Nifty on the same dates", () => {
    const hs = [h({ symbol: "A", quantity: 10, avgPrice: 100, price: 120, buyDate: "2024-01-01" })];
    const r = xirrVsNifty(hs, new Date("2025-01-01"), () => 20000, 21000);
    expect(r.xirr!).toBeCloseTo(0.2, 2);
    expect(r.niftyXirr!).toBeCloseTo(0.05, 2);
    expect(r.coverage).toBe(1);
  });
  it("holdings without buy dates are excluded and reported", () => {
    const r = xirrVsNifty([h({ symbol: "A" })], new Date(), () => 1, 1);
    expect(r).toMatchObject({ xirr: null, dated: 0, coverage: 0 });
  });
});

describe("H3a: stress test", () => {
  it("loss = value × adjusted beta × Nifty fall", () => {
    const s = stressTest([h({ symbol: "A", quantity: 10, price: 100, beta: 1.5 }), h({ symbol: "B", quantity: 10, price: 100, beta: null })], -0.2);
    const bA = 0.67 * 1.5 + 0.33;
    expect(s.loss).toBeCloseTo(-(1000 * bA * 0.2 + 1000 * 1 * 0.2), 6);
    expect(s.unknownBeta).toEqual(["B"]);
    expect(s.portfolioBeta).toBeCloseTo((bA + 1) / 2, 2);
  });
  it("adjusted beta is clamped and defaults to 1", () => {
    expect(adjustedBeta(null)).toBe(1);
    expect(adjustedBeta(10)).toBe(2.5);
    expect(adjustedBeta(-3)).toBe(0);
  });
});

describe("H3b: less diversified than it looks", () => {
  const syms = ["HDFC", "ICICI", "AXIS", "INFY", "TCS", "ITC"];
  const M = [
    [1, 0.8, 0.75, 0.2, 0.2, 0.1],
    [0.8, 1, 0.7, 0.25, 0.2, 0.1],
    [0.75, 0.7, 1, 0.2, 0.15, 0.1],
    [0.2, 0.25, 0.2, 1, 0.85, 0.05],
    [0.2, 0.2, 0.15, 0.85, 1, 0.05],
    [0.1, 0.1, 0.1, 0.05, 0.05, 1],
  ];
  it("finds the bank cluster and the IT pair", () => {
    const cl = correlationClusters(syms, M, 0.5).filter((c) => c.length > 1).map((c) => c.sort());
    expect(cl).toContainEqual(["AXIS", "HDFC", "ICICI"]);
    expect(cl).toContainEqual(["INFY", "TCS"]);
  });
  it("effective bets: 1/Σw² when independent, 1 when identical", () => {
    const w = [0.25, 0.25, 0.25, 0.25];
    const I = w.map((_, i) => w.map((__, j) => (i === j ? 1 : 0)));
    const ONE = w.map(() => w.map(() => 1));
    expect(effectiveBets(w, I)).toBeCloseTo(4);
    expect(effectiveBets(w, ONE)).toBeCloseTo(1);
  });
  it("reports cluster weights", () => {
    const hs = syms.map((s) => h({ symbol: s, quantity: 10, price: 100 }));
    const d = diversification(hs, syms, M, 0.5);
    expect(d.clusters[0].weight).toBeCloseTo(0.5);
    expect(d.effectiveBets).toBeLessThan(6);
  });
});

describe("H3c: concentration and allocation", () => {
  const hs = [h({ symbol: "A", sector: "Banks", quantity: 30, price: 100 }), h({ symbol: "B", sector: "Banks", quantity: 20, price: 100 }), h({ symbol: "C", sector: "IT", quantity: 50, price: 100 })];
  it("flags a stock above 25% and a sector above 40%", () => {
    const c = concentration(hs);
    expect(c.topStock).toMatchObject({ symbol: "C", weight: 0.5 });
    expect(c.flags.map((f) => f.kind)).toEqual(expect.arrayContaining(["stock", "sector"]));
  });
  it("sector allocation adds up to 100%", () => {
    expect(sectorAllocation(hs).reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1);
  });
  it("inner ring score rewards spread and calm", () => {
    expect(diversificationScore(8, 0.1, 1)).toBe(100);
    expect(diversificationScore(1, 0.5, 1.8)).toBe(0);
  });
});

describe("portfolio health (outer ring)", () => {
  it("value-weighted over scored holdings, with coverage", () => {
    const r = healthRollup([h({ symbol: "A", quantity: 30, health: 90 }), h({ symbol: "B", quantity: 10, health: 50 }), h({ symbol: "C", quantity: 10, health: null })]);
    expect(r.score).toBe(80);
    expect(r).toMatchObject({ scored: 2, total: 3, coverageByValue: 0.8 });
  });
});
