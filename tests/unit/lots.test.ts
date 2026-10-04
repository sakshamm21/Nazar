/**
 * Purchase lots: the position a set of lots describes, the dated cash flows a money-weighted
 * return needs, and which units a sale consumed.
 */
import { describe, expect, it } from "vitest";
import { xirr } from "@/lib/analytics/stats";
import { cashFlows, consume, lotCost, sortLots, summarise, type Lot } from "@/lib/portfolio/lots";

const lot = (o: Partial<Lot> & { quantity: number; price: number; date: string }): Lot => o;

describe("summarising lots", () => {
  it("adds up units, cost and the earliest date", () => {
    const s = summarise([
      lot({ quantity: 10, price: 100, date: "2024-06-01" }),
      lot({ quantity: 5, price: 140, date: "2024-02-01" }),
    ]);
    expect(s.quantity).toBe(15);
    expect(s.cost).toBe(1000 + 700);
    expect(s.avgPrice).toBeCloseTo(1700 / 15, 6);
    expect(s.buyDate).toBe("2024-02-01");
    expect(s.lots).toBe(2);
  });
  it("a partly-sold lot contributes only what is still held", () => {
    const s = summarise([lot({ quantity: 10, price: 100, date: "2024-01-01", remaining: 4 })]);
    expect(s.quantity).toBe(4);
    expect(s.cost).toBe(400);
    expect(s.avgPrice).toBe(100);
  });
  it("a fully-sold lot drops out but still anchors the earliest date", () => {
    const s = summarise([lot({ quantity: 10, price: 100, date: "2023-01-01", remaining: 0 }), lot({ quantity: 5, price: 200, date: "2024-01-01" })]);
    expect(s.quantity).toBe(5);
    expect(s.cost).toBe(1000);
    expect(s.buyDate).toBe("2023-01-01");
  });
  it("no lots is an empty position, not a division by zero", () => {
    expect(summarise([])).toMatchObject({ quantity: 0, cost: 0, avgPrice: 0, buyDate: null });
  });
});

describe("dated cash flows for a money-weighted return", () => {
  const threeInstalments = [
    lot({ quantity: 10, price: 100, date: "2024-01-15" }),
    lot({ quantity: 10, price: 90, date: "2024-02-15" }),
    lot({ quantity: 10, price: 110, date: "2024-03-15" }),
  ];

  it("places each purchase on its own day", () => {
    const { flows, skipped } = cashFlows(threeInstalments, [], { date: "2025-01-15", amount: 3300 });
    expect(skipped).toBe(0);
    expect(flows).toEqual([
      { date: "2024-01-15", amount: -1000 },
      { date: "2024-02-15", amount: -900 },
      { date: "2024-03-15", amount: -1100 },
      { date: "2025-01-15", amount: 3300 },
    ]);
  });

  it("dates each rupee when it went in, so a SIP is not treated as one lump sum", () => {
    // This is the whole point of the ledger: money added later must be a separate flow.
    const lumped = cashFlows([lot({ quantity: 30, price: 100, date: "2024-01-15" })], [], { date: "2025-01-15", amount: 3300 });
    const instalments = cashFlows(threeInstalments, [], { date: "2025-01-15", amount: 3300 });
    // Identical total invested, so both should agree closely here; the shape differs.
    expect(instalments.flows.length).toBe(4);
    expect(lumped.flows.length).toBe(2);
    const x = xirr(instalments.flows.map((f) => ({ date: new Date(f.date), amount: f.amount })));
    const y = xirr(lumped.flows.map((f) => ({ date: new Date(f.date), amount: f.amount })));
    expect(x).not.toBeNull();
    expect(y).not.toBeNull();
    // Both invested 3000 and hold 3300, so each is a 10% annual-ish return over one year.
    expect(x!).toBeCloseTo(0.1, 1);
    expect(y!).toBeCloseTo(0.1, 1);
  });

  it("money taken out is a positive flow, so it stops counting as invested", () => {
    const { flows } = cashFlows([lot({ quantity: 20, price: 100, date: "2024-01-01" })], [{ date: "2024-07-01", amount: 800 }], { date: "2025-01-01", amount: 1400 });
    expect(flows).toContainEqual({ date: "2024-07-01", amount: 800 });
    expect(flows.filter((f) => f.amount < 0)).toEqual([{ date: "2024-01-01", amount: -2000 }]);
  });

  it("combines flows on the same day", () => {
      // Two lots bought on one day are one flow, not two: XIRR's solver needs a real sign change.
      const { flows } = cashFlows([lot({ quantity: 10, price: 100, date: "2024-01-01" }), lot({ quantity: 10, price: 100, date: "2024-01-01" })], [], { date: "2024-06-01", amount: 2200 });
      expect(flows).toEqual([
        { date: "2024-01-01", amount: -2000 },
        { date: "2024-06-01", amount: 2200 },
      ]);
    });

  it("drops flows that net to nothing, which would make XIRR unsolvable", () => {
    const { flows } = cashFlows([lot({ quantity: 10, price: 100, date: "2024-01-01" })], [], { date: "2024-01-01", amount: 1000 });
    expect(flows).toEqual([]);
  });

  it("counts lots it cannot place in time instead of guessing", () => {
    const { flows, skipped } = cashFlows([{ quantity: 10, price: 100, date: "" }], [], { date: "2025-01-01", amount: 1000 });
    expect(skipped).toBe(1);
    expect(flows).toEqual([{ date: "2025-01-01", amount: 1000 }]);
  });

  it("sold-out lots produce no outflow, since no money is still at work", () => {
    const { flows } = cashFlows([lot({ quantity: 10, price: 100, date: "2024-01-01", remaining: 0 })], [], { date: "2025-01-01", amount: 0 });
    expect(flows.filter((f) => f.amount < 0)).toEqual([]);
  });

  it("with no valuation there is nothing to solve, and XIRR returns null rather than a guess", () => {
    const { flows } = cashFlows([lot({ quantity: 10, price: 100, date: "2024-01-01" })], [], null);
    expect(flows).toEqual([{ date: "2024-01-01", amount: -1000 }]);
    expect(xirr(flows.map((f) => ({ date: new Date(f.date), amount: f.amount })))).toBeNull();
  });
});

describe("which units a sale consumed", () => {
  const lots = [lot({ quantity: 10, price: 100, date: "2024-01-01" }), lot({ quantity: 10, price: 150, date: "2024-06-01" }), lot({ quantity: 10, price: 200, date: "2025-01-01" })];

  it("takes the oldest units first, so the cheap lot is the one realised", () => {
    const used = consume(lots, 12);
    expect(used.map((u) => [u.lot.date, u.units])).toEqual([
      ["2024-01-01", 10],
      ["2024-06-01", 2],
    ]);
  });

  it("a sale larger than the position only consumes what exists", () => {
    const used = consume(lots, 999);
    expect(used.reduce((a, u) => a + u.units, 0)).toBe(30);
    expect(used.map((u) => u.lot.date)).toEqual(["2024-01-01", "2024-06-01", "2025-01-01"]);
  });

  it("selling nothing or a negative amount consumes nothing", () => {
    expect(consume(lots, 0)).toEqual([]);
    expect(consume(lots, -5)).toEqual([]);
  });

  it("already-sold units of a lot are skipped", () => {
    const withSold = [lot({ quantity: 10, price: 100, date: "2024-01-01", remaining: 3 }), lot({ quantity: 10, price: 150, date: "2024-06-01" })];
    expect(consume(withSold, 5).map((u) => [u.lot.date, u.units])).toEqual([
      ["2024-01-01", 3],
      ["2024-06-01", 2],
    ]);
  });
});

describe("helpers", () => {
  it("sorts oldest first and does not mutate the input", () => {
    const input = [lot({ quantity: 1, price: 1, date: "2025-01-01" }), lot({ quantity: 1, price: 1, date: "2024-01-01" })];
    expect(sortLots(input).map((l) => l.date)).toEqual(["2024-01-01", "2025-01-01"]);
    expect(input.map((l) => l.date)).toEqual(["2025-01-01", "2024-01-01"]);
  });
  it("lot cost is units times price", () => {
    expect(lotCost(lot({ quantity: 12, price: 55, date: "2024-01-01" }))).toBe(660);
  });
});