import { describe, expect, it } from "vitest";
import { compare, defaultWidgets, partFilter } from "@/lib/dashboards/compare";
import type { PerfHolding } from "@/lib/portfolio/performance";

const dates = ["2026-01-01", "2026-06-01", "2026-09-01", "2026-10-01", "2026-11-01"];
const h = (o: Partial<PerfHolding> & { symbol: string }): PerfHolding => ({ name: o.symbol, group: "Stocks", quantity: 10, avgPrice: 100, price: null, prevClose: null, beta: 1, closes: null, ...o });
const closes = (xs: number[]) => dates.map((d, i) => [d, xs[i]] as [string, number]);

describe("a dashboard comparison", () => {
  const holdings = [
    h({ symbol: "A", closes: closes([100, 100, 110, 120, 130]), price: 130 }),
    h({ symbol: "F", group: "Mutual funds", closes: closes([50, 50, 50, 50, 55]), price: 55 }),
    h({ symbol: "MANUAL:fd", group: "Fixed income", quantity: 1, valueOn: () => 1000 }),
  ];
  const nifty = new Map(closes([200, 200, 210, 220, 240]));

  it("rebases both lines to 100 at the start of the period", () => {
    const r = compare(holdings, dates, "Stocks", nifty, "3M")!;
    expect(r.from).toBe("2026-06-01");
    expect(r.points[0]).toMatchObject({ mine: 100, index: 100 });
    expect(r.minePct).toBeCloseTo(0.3, 9);
    expect(r.indexPct).toBeCloseTo(0.2, 9);
  });
  it("can compare one kind of asset, the market-linked part, or one holding", () => {
    expect(compare(holdings, dates, "Mutual funds", nifty, "3M")!.minePct).toBeCloseTo(0.1, 9);
    expect(compare(holdings, dates, "market", nifty, "3M")!.holdings).toBe(2);
    expect(compare(holdings, dates, "symbol:A", nifty, "1M")!.holdings).toBe(1);
    expect(holdings.filter(partFilter("whole"))).toHaveLength(3);
  });
  it("says nothing when nothing held matches", () => {
    expect(compare(holdings, dates, "Crypto", nifty, "1Y")).toBeNull();
  });
  it("a new account starts with whole, market-linked, funds and stocks against the Nifty", () => {
    let n = 0;
    expect(defaultWidgets(() => `w${n++}`).map((w) => w.part)).toEqual(["whole", "market", "Mutual funds", "Stocks"]);
  });
});
