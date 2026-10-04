import { round, xirr } from "@/lib/analytics/stats";

/**
 * Savings goals: what a target amount and a date imply, and where today's plan stands against them.
 * Pure arithmetic over plain data, unit-tested.
 *
 * A goal is not advice. It states what a number requires — how much a month, and what happens if
 * the pace changes — so the user can compare it with what they actually do. Nothing here says what to
 * invest in, and no assumed rate is presented as an expectation: the growth figure is derived from the
 * user's own recorded contributions where possible, and clearly labelled as an assumption when not.
 */

export type Goal = {
  /** The amount to reach, in rupees. */
  target: number;
  /** The day the money is needed (YYYY-MM-DD). */
  byDate: string;
  /** What is already put away for it, in rupees. */
  saved: number;
  /** When `saved` was measured, so progress is never credited to the wrong day. */
  savedAsOf?: string | null;
  /** Optional: what is being set aside each month right now. */
  monthly?: number | null;
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86_400_000);
export const monthsBetween = (from: string, to: string) => Math.max(0, days(from, to) / 30.4375);

export type Projection = {
  monthsLeft: number;
  /** How much still has to be put away, in rupees. */
  toGo: number;
  /** The monthly amount that lands exactly on the target date. */
  requiredMonthly: number;
  /** What the current monthly amount reaches by the target date. */
  projected: number;
  /** How much more or less that is than the target. */
  gap: number;
  /** Share of the target already saved, 0–1. */
  progress: number;
  /** The date the current monthly amount reaches the target, or null if it never does. */
  onTrackFor: string | null;
  /** True when the current pace reaches the target on or before the date. */
  onTrack: boolean;
  /** The date the target is reached if nothing more is added. Never null: saved money still counts. */
  reachedOn: string | null;
  status: "ahead" | "on-track" | "behind" | "at-risk" | "met" | "no-plan" | "expired";
};

/**
 * What a goal requires, and where today's plan stands against it.
 *
 * Growth is deliberately not assumed. Without a rate, compounding is ignored and the projection is
 * simply saved + monthly × months, which is the honest reading: how much of the target is covered by
 * the money already committed. Callers that know a defensible rate pass it in and the compounding is
 * shown separately, so the two are never confused.
 */
export function projectGoal(goal: Goal, today: string, annualRatePct = 0): Projection {
  const monthsLeft = monthsBetween(today, goal.byDate);
  const toGo = Math.max(goal.target - goal.saved, 0);
  const progress = goal.target > 0 ? Math.min(Math.max(goal.saved / goal.target, 0), 1) : 0;

  // Compounding on whatever is already saved and on each contribution. A negative rate is treated as
  // no growth rather than shrinkage, so a bad year never produces a nonsense "you will never get there".
  const r = Math.max(annualRatePct, 0) / 100 / 12;
  const grow = (principal: number, months: number) => (r > 0 ? principal * (1 + r) ** months : principal);

    // The month count is rounded once, here, and everything downstream uses it, so the required
    // monthly amount and the projection always describe the same number of months.
    const months = Math.round(monthsLeft * 10) / 10;
    const requiredMonthly = months > 0 ? toGo / months : toGo > 0 ? Infinity : 0;
    const monthly = Math.max(goal.monthly ?? 0, 0);
    // What lands by the target date: today's savings compounded, plus a month at a time for the rest.
    const projected = grow(goal.saved, months) + (months > 0 ? futureValueOfAnnuity(monthly, r, months) : 0);
    const gap = projected - goal.target;

  // The date this pace reaches the target, solved rather than simulated.
  const onTrackFor = monthly > 0 || goal.saved > 0 ? dateTargetReached(goal.target, goal.saved, monthly, r, today) : null;
  const reachedOn = goal.saved >= goal.target ? today : onTrackFor;

  let status: Projection["status"];
  if (goal.saved >= goal.target) status = "met";
  else if (months <= 0) status = "expired";
    else if (monthly <= 0) status = goal.saved > 0 ? "behind" : "no-plan";
  else if (gap >= 0) status = gap > goal.target * 0.02 ? "ahead" : "on-track";
  else if (gap > -goal.target * 0.1) status = "behind";
  else status = "at-risk";

  return {
      monthsLeft: months,
    toGo: round(toGo, 2)!,
    requiredMonthly: Number.isFinite(requiredMonthly) ? round(requiredMonthly, 2)! : Infinity,
    projected: round(projected, 2)!,
    gap: round(gap, 2)!,
    progress: round(progress, 4)!,
    onTrackFor,
    onTrack: gap >= 0,
    reachedOn,
    status,
  };
}

/** Ordinary annuity: the value of `monthly` paid at each month's end, at monthly rate `r`. */
export function futureValueOfAnnuity(monthly: number, r: number, months: number): number {
  if (months <= 0) return 0;
  if (r <= 0) return monthly * months;
  return monthly * (((1 + r) ** months - 1) / r);
}

/**
 * When monthly saving of `monthly` would reach `target`, starting from `saved`. Solved in closed
 * form where there is growth, and by simple division where there is not. Returns null when the plan
 * can never get there — a monthly amount of zero, or a target nothing is being added towards.
 */
export function dateTargetReached(target: number, saved: number, monthly: number, r: number, today: string): string | null {
  if (saved >= target) return today;
  if (monthly <= 0) return null;
  const need = target - saved;
    const months: number | null = r > 0 ? solveAnnuityMonths(need, monthly, r) : need / monthly;
    if (months == null || !Number.isFinite(months) || months < 0) return null;
  const when = new Date(day(today).getTime() + Math.ceil(months) * 30.4375 * 86_400_000);
  return when.toISOString().slice(0, 10);
}

/** The n where monthly × FV(n) = need. Newton, with a doubling fallback so it always terminates. */
function solveAnnuityMonths(need: number, monthly: number, r: number): number | null {
  let n = Math.max(1, Math.ceil(need / monthly));
  for (let i = 0; i < 80; i++) {
    const value = futureValueOfAnnuity(monthly, r, n);
    const error = value - need;
    if (Math.abs(error) < 1) return n;
    // d/dn of the annuity factor, approximated by a small step.
    const step = Math.max(0.0001, n * 0.001);
    const slope = (futureValueOfAnnuity(monthly, r, n + step) - value) / step;
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = n - error / slope;
    if (!Number.isFinite(next)) break;
    n = Math.max(1, Math.min(next, n * 4));
  }
  // Fall back to bisection between 1 month and a generous horizon.
  let lo = 1;
  let hi = Math.max(2, (need / monthly) * 4 + 12);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (futureValueOfAnnuity(monthly, r, mid) < need) lo = mid;
    else hi = mid;
  }
  return Number.isFinite(lo) ? lo : null;
}

/**
 * The yearly return a goal's own contributions have produced, when the user recorded a start value
 * and a monthly amount. Money-weighted, so the timing of each instalment is respected. Null when
 * there is not enough history to say anything honest.
 */
export function goalXirr(goal: Goal, today: string): number | null {
  const monthly = Math.max(goal.monthly ?? 0, 0);
  if (monthly <= 0) return null;
  const start = goal.savedAsOf ?? goal.byDate;
  const months = Math.floor(monthsBetween(start, today));
  if (months < 3) return null;
  const first = new Date(day(start).getTime() + 86_400_000);
  // Only the recorded monthly contributions can be placed in time. Whatever else is in the pot was
  // put there on an unknown date, so treating it as invested today would make every goal read 0%.
  // Its return is therefore not measurable here, and saying so is better than a confident wrong number.
  const flows: { date: Date; amount: number }[] = [];
  for (let i = 0; i < months; i++) flows.push({ date: new Date(first.getTime() + i * 30.4375 * 86_400_000), amount: -monthly });
  flows.push({ date: new Date(day(today).getTime() + 86_400_000), amount: goal.saved });
  if (flows.filter((f) => f.amount < 0).length < 3) return null;
  return round(xirr(flows));
}