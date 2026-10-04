/**
 * Savings goals: what a target needs each month, where the current plan lands, and the date it
 * would be reached. Arithmetic only — no advice about where the money goes.
 */
import { describe, expect, it } from "vitest";
import { dateTargetReached, futureValueOfAnnuity, goalXirr, monthsBetween, projectGoal, type Goal } from "@/lib/portfolio/goals";
import { xirr } from "@/lib/analytics/stats";

describe("the XIRR solver it relies on", () => {
  it("finds the real root when a contribution stream grew, not a number near zero", () => {
    // Newton alone used to converge to ~1e-17 here, because r=0 is not the root when the money grew.
    const first = new Date(new Date("2025-01-01T00:00:00Z").getTime() + 86_400_000);
    const flows = [{ date: first, amount: -400_000 }, ...Array.from({ length: 11 }, (_, i) => ({ date: new Date(first.getTime() + i * 30.4375 * 86_400_000), amount: -100_000 })), { date: new Date(new Date("2026-01-01T00:00:00Z").getTime() + 86_400_000), amount: 2_000_000 }];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.2);
  });

  it("still reports exactly zero when the money in is exactly the money out", () => {
    const first = new Date(new Date("2025-01-01T00:00:00Z").getTime() + 86_400_000);
    const flows = [{ date: first, amount: -400_000 }, ...Array.from({ length: 11 }, (_, i) => ({ date: new Date(first.getTime() + i * 30.4375 * 86_400_000), amount: -100_000 })), { date: new Date(new Date("2026-01-01T00:00:00Z").getTime() + 86_400_000), amount: 1_500_000 }];
    expect(xirr(flows)!).toBeCloseTo(0, 6);
  });
});

const TODAY = "2026-01-01";
const goal = (o: Partial<Goal> = {}): Goal => ({ target: 1_000_000, byDate: "2027-01-01", saved: 0, ...o });

describe("time", () => {
  it("counts months between two dates", () => {
      // 365 days ÷ 30.4375 days a month: a year is 11.99 "months", not exactly 12.
      expect(monthsBetween("2026-01-01", "2027-01-01")).toBeCloseTo(11.99, 2);
      expect(monthsBetween("2027-01-01", "2026-01-01")).toBe(0); // never negative
      expect(monthsBetween("2026-01-01", "2026-01-01")).toBe(0);
    });
});

describe("the plain annuity", () => {
  it("with no growth it is simply the contributions added up", () => {
    expect(futureValueOfAnnuity(1000, 0, 12)).toBe(12000);
    expect(futureValueOfAnnuity(0, 0.01, 12)).toBe(0);
    expect(futureValueOfAnnuity(1000, 0.01, 0)).toBe(0);
  });
  it("with growth it is the standard formula", () => {
    // ₹1,000 a month for 12 months at 1% a month: 1000 × ((1.01^12 − 1) / 0.01).
    const expected = 1000 * ((1.01 ** 12 - 1) / 0.01);
    expect(futureValueOfAnnuity(1000, 0.01, 12)).toBeCloseTo(expected, 4);
    // Growth must always beat the no-growth figure.
    expect(futureValueOfAnnuity(1000, 0.01, 120)).toBeGreaterThan(120000);
  });
});

describe("what a target requires", () => {
  it("works out the monthly amount that lands exactly on target", () => {
    const p = projectGoal(goal({ target: 1_200_000, saved: 0 }), TODAY);
        expect(p.monthsLeft).toBeCloseTo(12, 1);
        expect(p.requiredMonthly).toBeCloseTo(1_200_000 / p.monthsLeft, 4);
    expect(p.projected).toBe(0); // nothing is being saved yet
    expect(p.gap).toBe(-1_200_000);
    expect(p.status).toBe("no-plan");
  });

  it("counts what is already saved as progress and as money to go", () => {
    const p = projectGoal(goal({ target: 1_000_000, saved: 250_000 }), TODAY);
    expect(p.progress).toBe(0.25);
    expect(p.toGo).toBe(750_000);
      // Money already saved but nothing added monthly: real progress, yet still behind the date.
      expect(p.status).toBe("behind");
    });

  it("a plan that lands on target is on track", () => {
    const target = 1_200_000;
      // Take the month count the projection itself uses, so the plan is built to match it.
      const months = projectGoal(goal({ target }), TODAY).monthsLeft;
      const monthly = target / months;
      const p = projectGoal(goal({ target, monthly }), TODAY);
      expect(p.projected).toBeCloseTo(target, -2);
      expect(p.gap).toBeCloseTo(0, -2);
      expect(p.onTrack).toBe(true);
      expect(["on-track", "ahead"]).toContain(p.status);
    });

  it("a plan that falls short is behind, and says how far", () => {
    const p = projectGoal(goal({ target: 1_000_000, monthly: 1000 }), TODAY);
        expect(p.projected).toBeCloseTo(1000 * p.monthsLeft, -1);
    expect(p.gap).toBeLessThan(0);
    expect(["behind", "at-risk"]).toContain(p.status);
    expect(p.onTrack).toBe(false);
  });

  it("growth is only applied when a rate is given, and never shrinks a target", () => {
    const flat = projectGoal(goal({ target: 1_000_000, monthly: 10_000 }), TODAY);
    const grown = projectGoal(goal({ target: 1_000_000, monthly: 10_000 }), TODAY, 10);
    expect(grown.projected).toBeGreaterThan(flat.projected);
    // A negative rate is treated as no growth, not as decay.
    const negative = projectGoal(goal({ target: 1_000_000, monthly: 10_000 }), TODAY, -5);
    expect(negative.projected).toBeCloseTo(flat.projected, 4);
  });

  it("a goal already met is met, whatever else is true", () => {
    const p = projectGoal(goal({ target: 500_000, saved: 600_000 }), TODAY);
    expect(p.status).toBe("met");
    expect(p.progress).toBe(1);
    expect(p.toGo).toBe(0);
    expect(p.requiredMonthly).toBe(0);
  });

  it("a date in the past that was not reached is expired, not a suggestion", () => {
    const p = projectGoal(goal({ target: 1_000_000, saved: 100_000, byDate: "2025-01-01", monthly: 5000 }), TODAY);
    expect(p.status).toBe("expired");
    expect(p.monthsLeft).toBe(0);
    expect(p.requiredMonthly).toBe(Infinity);
    expect(p.onTrack).toBe(false);
  });

  it("with no money saved and no monthly amount, it reports no plan", () => {
    const p = projectGoal(goal(), TODAY);
    expect(p.status).toBe("no-plan");
    expect(p.projected).toBe(0);
    expect(p.onTrackFor).toBeNull();
  });

  it("with savings but no monthly amount, the date never arrives", () => {
    const p = projectGoal(goal({ target: 1_000_000, saved: 100_000, monthly: 0 }), TODAY);
    expect(p.onTrackFor).toBeNull();
      expect(p.status).toBe("behind");
      expect(p.reachedOn).toBeNull();
    });
});

describe("the date a target would be reached", () => {
  it("divides the shortfall when nothing is growing", () => {
    // ₹900,000 to go at ₹10,000 a month is 90 months.
    const when = dateTargetReached(1_000_000, 100_000, 10_000, 0, TODAY);
    expect(when).not.toBeNull();
    expect(monthsBetween(TODAY, when!)).toBeCloseTo(90, 0);
  });

  it("growth brings the date closer, never further", () => {
    const flat = dateTargetReached(1_000_000, 100_000, 10_000, 0, TODAY)!;
    const grown = dateTargetReached(1_000_000, 100_000, 10_000, 0.01, TODAY)!;
    expect(grown < flat).toBe(true);
  });

  it("nothing added means the date never arrives", () => {
    expect(dateTargetReached(1_000_000, 100_000, 0, 0, TODAY)).toBeNull();
    expect(dateTargetReached(1_000_000, 0, 0, 0.01, TODAY)).toBeNull();
  });

  it("an already-met target is reached today", () => {
    expect(dateTargetReached(500_000, 600_000, 1000, 0, TODAY)).toBe(TODAY);
  });

  it("the solved date agrees with the projection", () => {
        // If the plan reaches the target on date D, then the shortfall divided by the monthly amount
        // must be the months between today and D.
        const g = goal({ target: 2_000_000, saved: 200_000, monthly: 15_000 });
        const when = dateTargetReached(g.target, g.saved, g.monthly!, 0, TODAY)!;
        const months = monthsBetween(TODAY, when);
        expect(months).toBeCloseTo((g.target - g.saved) / g.monthly!, 0);
    });
});

describe("the return a goal has actually produced", () => {
  it("needs enough months of contributions to say anything", () => {
    expect(goalXirr(goal({ saved: 100_000, savedAsOf: "2025-12-01", monthly: 5000 }), TODAY)).toBeNull();
    expect(goalXirr(goal({ saved: 100_000, savedAsOf: "2025-12-01", monthly: 0 }), TODAY)).toBeNull();
  });

  it("a year of contributions that grew is positive, and one that shrank is negative", () => {
      // 11 monthly contributions of ₹100,000 (₹1.1m in), so a pot of ₹1.9m is a real gain.
      const grew = goalXirr(goal({ target: 2_000_000, saved: 1_900_000, savedAsOf: "2025-01-01", monthly: 100_000 }), "2026-01-01");
      expect(grew).not.toBeNull();
      expect(grew!).toBeGreaterThan(0.2);

      // ₹550,000 in, ₹500,000 out: a loss.
      const shrank = goalXirr(goal({ target: 1_000_000, saved: 500_000, savedAsOf: "2025-01-01", monthly: 50_000 }), "2026-01-01");
      expect(shrank).not.toBeNull();
      expect(shrank!).toBeLessThan(0);
    });

    it("a pot worth exactly what was contributed is a 0% return", () => {
      // 11 × ₹100,000 = ₹1,100,000 in, ₹1,100,000 out.
      const flat = goalXirr(goal({ target: 2_000_000, saved: 1_100_000, savedAsOf: "2025-01-01", monthly: 100_000 }), "2026-01-01");
      expect(flat).toBeCloseTo(0, 4);
    });

    it("money already in the pot is not counted as invested, because its date is unknown", () => {
      // 11 × ₹100,000 is ₹1.1m in against a ₹1.2m pot. The ₹100,000 that was already there is ignored,
      // so the return is measured on the contributions alone rather than being inflated or deflated by
      // money whose date we do not know.
      const r = goalXirr(goal({ target: 2_000_000, saved: 1_200_000, savedAsOf: "2025-01-01", monthly: 100_000 }), "2026-01-01");
      expect(r).not.toBeNull();
      expect(r!).toBeGreaterThan(0);
    });
});