import { describe, expect, it } from "vitest";
import { squarify } from "@/components/charts/heatmap";
import { isAdviceFree } from "@/lib/guard";
import { buildPerformance, explain, holdingSeries, type PerfHolding } from "@/lib/portfolio/performance";

const dates = ["2026-08-31", "2026-09-01", "2026-09-15", "2026-09-29", "2026-09-30", "2026-10-01"];
const h = (o: Partial<PerfHolding> & { symbol: string }): PerfHolding => ({ name: o.symbol, group: "Stocks", quantity: 10, avgPrice: 100, price: null, prevClose: null, beta: 1, closes: null, ...o });
const closes = (xs: number[]) => dates.map((d, i) => [d, xs[i]] as [string, number]);

describe("a holding's value over time", () => {
  it("prices today's quantity on each day, and ends on the price the other screens show", () => {
    expect(holdingSeries(h({ symbol: "A", closes: closes([100, 101, 102, 103, 104, 105]), price: 106 }), dates)).toEqual([1000, 1010, 1020, 1030, 1040, 1060]);
  });
  it("carries the last close across gaps and holds the first close before its history starts", () => {
    expect(holdingSeries(h({ symbol: "A", closes: [["2026-09-15", 50], ["2026-09-30", 60]] }), dates)).toEqual([500, 500, 500, 500, 600, 600]);
  });
  it("uses the entered value for assets with no price feed", () => {
    expect(holdingSeries(h({ symbol: "MANUAL:x", quantity: 1, valueOn: (d) => (d < "2026-09-20" ? 1000 : 1010) }), dates)).toEqual([1000, 1000, 1000, 1010, 1010, 1010]);
    expect(holdingSeries(h({ symbol: "B", price: 120 }), dates)).toEqual(dates.map(() => 1200));
  });
});

describe("what moved, why and how", () => {
  const nifty = new Map(closes([20000, 20100, 20200, 19800, 19900, 20000]));
  const perf = buildPerformance(
    [
      h({ symbol: "UP", name: "Riser", closes: closes([100, 100, 110, 118, 119, 120]), price: 120, prevClose: 119 }),
      h({ symbol: "DN", name: "Faller", closes: closes([100, 100, 95, 92, 91, 90]), price: 90, prevClose: 91, group: "Mutual funds", beta: 0.5 }),
      h({ symbol: "MANUAL:fd", name: "Deposit", quantity: 1, avgPrice: 1000, beta: 0, group: "Fixed income", valueOn: () => 1000 }),
    ],
    dates,
    nifty,
  );
  it("adds the holdings up into one line", () => {
    expect(perf.values).toEqual([3000, 3000, 3050, 3100, 3100, 3100]);
    expect(perf.invested).toBe(3000);
    expect([perf.covered, perf.total]).toEqual([3, 3]);
  });
  it("splits the change by holding, by group and into market and own", () => {
    const m = perf.periods["1M"]!;
    expect(m.from).toBe("2026-09-01");
    expect(m.change).toBe(100);
    expect(m.contributors.map((c) => [c.symbol, c.amount])).toEqual([["UP", 200], ["MANUAL:fd", 0], ["DN", -100]]);
    expect([m.rose, m.fell]).toEqual([1, 1]);
    // Nifty 20100 → 20000; start values 1000 (beta 1), 1000 (beta 0.5), 1000 (beta 0).
    expect(m.marketPart).toBeCloseTo(1500 * (20000 / 20100 - 1), 6);
    expect(m.marketPart + m.ownPart).toBeCloseTo(m.change, 6);
    expect(m.groups.reduce((a, g) => a + g.amount, 0)).toBeCloseTo(m.change, 6);
    expect(m.upDays).toBe(2);
    expect(m.drawdown).toBe(0);
  });
  it("today's move is measured from yesterday's close", () => {
    const d = perf.periods["1D"]!;
    expect(d.change).toBe(0);
    expect(d.contributors.find((c) => c.symbol === "UP")!.amount).toBe(10);
  });
  it("says when the history is shorter than the period", () => {
    const y = perf.periods["1Y"]!;
    expect(y.full).toBe(false);
    expect(explain(y).headline).toMatch(/since 31 Aug/);
  });
  it("explains in plain sentences, with no advice in them", () => {
    for (const a of Object.values(perf.periods)) {
      const s = explain(a!);
      for (const t of [s.headline, s.what, ...s.why, ...s.how]) expect(isAdviceFree(t), t).toBe(true);
    }
    const s = explain(perf.periods["1M"]!);
    expect(s.what).toContain("up ₹100 (3.3%) over the last month");
    expect(s.why.join(" ")).toContain("Riser (+₹200) added the most");
    expect(s.why.join(" ")).toContain("Faller (−₹100) took the most away");
    expect(s.how[0]).toMatch(/better than the Nifty by 3\.8 points/);
  });
  it("needs two days before it says anything", () => {
    expect(buildPerformance([h({ symbol: "A" })], ["2026-10-01"], new Map()).periods["1M"]).toBeNull();
  });
});

describe("the heatmap layout", () => {
  it("fills the box exactly, each tile in proportion to its value", () => {
    const values = [50, 20, 12, 8, 5, 3, 2];
    const r = squarify(values, 100, 62);
    expect(r).toHaveLength(values.length);
    r.forEach((t, i) => expect(t.w * t.h).toBeCloseTo((values[i] / 100) * 6200, 6));
    for (const t of r) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(62 + 1e-9);
    }
  });
  it("copes with nothing to show", () => {
    expect(squarify([], 100, 62)).toEqual([]);
    expect(squarify([0], 100, 62)).toEqual([{ x: 0, y: 0, w: 0, h: 0 }]);
  });
});
