/**
 * The arithmetic of a monthly SIP: when an instalment falls due, and what it bought.
 *
 * Nazar never sees the bank debit. It knows the plan (an amount, a day of the month) and the
 * prices, so on each due date it works out the instalment it expects: the amount divided by the
 * price on that day, or on the next day the market traded if that day it did not. Pure: dates and
 * prices come in, instalments go out. Dates are "YYYY-MM-DD" strings throughout.
 */
export const SIP_MIN_DAY = 1;
/** No 29th, 30th or 31st: every month has the day, so a plan never skips February. */
export const SIP_MAX_DAY = 28;
export const SIP_MIN_AMOUNT = 100;
export const SIP_MAX_AMOUNT = 10_000_000;
/** If no price turns up within this many days of a due date, the instalment is not guessed at. */
const PRICE_WINDOW_DAYS = 10;
/** How far back a SIP's start date may be. */
export const SIP_MAX_YEARS_BACK = 20;
/** The most instalments added in one go: every month of the longest SIP allowed. */
const MAX_CATCH_UP = SIP_MAX_YEARS_BACK * 12 + 1;

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const addDays = (iso: string, days: number) => {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The first date with this day of the month on or after `from`. */
export function dueOnOrAfter(dayOfMonth: number, from: string): string {
  const [y, m, d] = parts(from);
  if (d <= dayOfMonth) return `${y}-${pad(m)}-${pad(dayOfMonth)}`;
  return m === 12 ? `${y + 1}-01-${pad(dayOfMonth)}` : `${y}-${pad(m + 1)}-${pad(dayOfMonth)}`;
}

/** The due date one month after `due`. */
export function dueAfter(dayOfMonth: number, due: string): string {
  return dueOnOrAfter(dayOfMonth, addDays(due, 1));
}

export type SipPlan = { amount: number; dayOfMonth: number; nextDue: string; endDate: string | null };
export type Instalment = { due: string; tradeDate: string; price: number; quantity: number; amount: number };

/**
 * The instalments that have fallen due and can be priced, oldest first.
 *
 * `closes` is the holding's closing price by date. An instalment is priced at the first close on or
 * after its due date. It waits (and so does every later one) while that price is not in yet, which
 * is the ordinary case on the due date itself, before the night's checkup has run.
 */
export function instalmentsDue(plan: SipPlan, closes: Map<string, number>, today: string): { instalments: Instalment[]; nextDue: string; ended: boolean } {
  const dates = [...closes.keys()].sort();
  const instalments: Instalment[] = [];
  let due = plan.nextDue;
  let ended = false;
  while (instalments.length < MAX_CATCH_UP && due <= today) {
    if (plan.endDate && due > plan.endDate) {
      ended = true;
      break;
    }
    const tradeDate = dates.find((d) => d >= due && d <= today);
    if (!tradeDate) break;
    // A price that only turns up weeks later is not the price this instalment went in at: skip the month, do not invent it.
    if (tradeDate <= addDays(due, PRICE_WINDOW_DAYS)) {
      const price = closes.get(tradeDate)!;
      if (price > 0) instalments.push({ due, tradeDate, price, quantity: plan.amount / price, amount: plan.amount });
    }
    due = dueAfter(plan.dayOfMonth, due);
  }
  if (plan.endDate && due > plan.endDate) ended = true;
  return { instalments, nextDue: due, ended };
}

/** "5th", "22nd": the day as people say it. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** How many due dates fall from `startDate` to `today`, both included: what a start date in the past will add. */
export function instalmentsSince(dayOfMonth: number, startDate: string, today: string): number {
  let n = 0;
  for (let due = dueOnOrAfter(dayOfMonth, startDate); due <= today && n < MAX_CATCH_UP; due = dueAfter(dayOfMonth, due)) n++;
  return n;
}
