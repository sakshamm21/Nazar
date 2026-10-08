/** A monthly SIP's arithmetic: when an instalment falls due, and what it bought. */
import { describe, expect, it } from "vitest";
import { dueAfter, dueOnOrAfter, instalmentsDue, ordinal } from "@/lib/portfolio/sip";

describe("due dates", () => {
  it("the next date with that day of the month, today included", () => {
    expect(dueOnOrAfter(5, "2026-10-01")).toBe("2026-10-05");
    expect(dueOnOrAfter(5, "2026-10-05")).toBe("2026-10-05");
    expect(dueOnOrAfter(5, "2026-10-06")).toBe("2026-11-05");
    expect(dueOnOrAfter(28, "2026-12-29")).toBe("2027-01-28");
  });
  it("one month on, across a year end and through February", () => {
    expect(dueAfter(5, "2026-10-05")).toBe("2026-11-05");
    expect(dueAfter(15, "2026-12-15")).toBe("2027-01-15");
    expect(dueAfter(28, "2027-01-28")).toBe("2027-02-28");
  });
  it("says the day as people do", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "28th"]);
  });
});

describe("instalments that have fallen due", () => {
  const plan = { amount: 5000, dayOfMonth: 5, nextDue: "2026-10-05", endDate: null };
  const closes = (o: Record<string, number>) => new Map(Object.entries(o));

  it("one instalment buys the amount's worth of units at that day's price", () => {
    const r = instalmentsDue(plan, closes({ "2026-10-05": 100 }), "2026-10-05");
    expect(r.instalments).toEqual([{ due: "2026-10-05", tradeDate: "2026-10-05", price: 100, quantity: 50, amount: 5000 }]);
    expect(r.nextDue).toBe("2026-11-05");
  });

  it("a due date on a holiday is priced on the next day the market traded", () => {
    const r = instalmentsDue(plan, closes({ "2026-10-02": 99, "2026-10-07": 125 }), "2026-10-08");
    expect(r.instalments).toEqual([{ due: "2026-10-05", tradeDate: "2026-10-07", price: 125, quantity: 40, amount: 5000 }]);
  });

  it("waits while the due date's price is not in yet, and adds nothing before the due date", () => {
    expect(instalmentsDue(plan, closes({ "2026-10-02": 99 }), "2026-10-05")).toEqual({ instalments: [], nextDue: "2026-10-05", ended: false });
    expect(instalmentsDue(plan, closes({ "2026-10-02": 99 }), "2026-10-04").instalments).toEqual([]);
  });

  it("catches up several months in order, each at its own price", () => {
    const r = instalmentsDue(plan, closes({ "2026-10-05": 100, "2026-11-05": 125, "2026-12-07": 200 }), "2026-12-20");
    expect(r.instalments.map((i) => [i.due, i.tradeDate, i.quantity])).toEqual([
      ["2026-10-05", "2026-10-05", 50],
      ["2026-11-05", "2026-11-05", 40],
      ["2026-12-05", "2026-12-07", 25],
    ]);
    expect(r.nextDue).toBe("2027-01-05");
  });

  it("a month whose price only turns up weeks later is skipped, not invented", () => {
    const r = instalmentsDue(plan, closes({ "2026-10-30": 100, "2026-11-05": 125 }), "2026-11-10");
    expect(r.instalments.map((i) => i.due)).toEqual(["2026-11-05"]);
    expect(r.nextDue).toBe("2026-12-05");
  });

  it("stops at the end date", () => {
    const r = instalmentsDue({ ...plan, endDate: "2026-11-30" }, closes({ "2026-10-05": 100, "2026-11-05": 100, "2026-12-07": 100 }), "2026-12-20");
    expect(r.instalments.map((i) => i.due)).toEqual(["2026-10-05", "2026-11-05"]);
    expect(r.ended).toBe(true);
  });

  it("is the same answer when asked twice, and nothing once the plan has moved on", () => {
    const prices = closes({ "2026-10-05": 100 });
    expect(instalmentsDue(plan, prices, "2026-10-06")).toEqual(instalmentsDue(plan, prices, "2026-10-06"));
    expect(instalmentsDue({ ...plan, nextDue: "2026-11-05" }, prices, "2026-10-06").instalments).toEqual([]);
  });
});
