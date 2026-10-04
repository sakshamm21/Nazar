/**
 * Purchase lots: what a position was actually built from, and the money-weighted return that
 * follows from it. Pure functions over plain data, unit-tested.
 *
 * A holding row is a summary (one quantity, one weighted average price, one earliest buy date).
 * That is enough to value the portfolio but not enough to answer "what did my money do?", because
 * the instalments of a monthly SIP are collapsed into a single entry dated at the first purchase.
 * These functions work from the individual purchases instead, so each rupee is placed on the day it
 * was invested and XIRR reflects when it was invested rather than when the position opened.
 */

export type Lot = {
  /** Units bought in this lot. Always positive. */
  quantity: number;
  /** Price paid per unit. */
  price: number;
  /** The day the money went in (YYYY-MM-DD). */
  date: string;
  /** Units of this lot still held, after any sale. Defaults to quantity when not given. */
  remaining?: number;
};

export const lotRemaining = (l: Lot) => l.remaining ?? l.quantity;
export const lotCost = (l: Lot) => l.quantity * l.price;
/** Oldest first: lots are consumed in the order they were bought. */
export const sortLots = (lots: Lot[]) => [...lots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * The position a set of lots describes: total units, what they cost, and the earliest purchase
 * date. Mirrors how a holding row is summarised, so a summary and its lots always agree.
 */
export function summarise(lots: Lot[]) {
  const live = lots.filter((l) => lotRemaining(l) > 0);
  const quantity = live.reduce((a, l) => a + lotRemaining(l), 0);
  // A partly-sold lot's cost is the cost of what is still held.
  const cost = live.reduce((a, l) => a + lotRemaining(l) * l.price, 0);
  const dates = lots.map((l) => l.date).filter(Boolean).sort();
  return { quantity, cost, avgPrice: quantity ? cost / quantity : 0, buyDate: dates[0] ?? null, lots: lots.length };
}

/**
 * Rupees in and rupees out, as dated cash flows, for a money-weighted return.
 *
 * Each surviving lot is one negative flow on the day it was bought. Sales add positive flows at the
 * day they happened, so money actually taken out stops counting as invested. The current value is
 * added as the final positive flow. Lots with no date cannot be placed in time and are skipped;
 * `skipped` reports how many so the caller can tell the user the figure is incomplete.
 */
export type Flow = { date: string; amount: number };

export function cashFlows(lots: Lot[], sales: { date: string; amount: number }[], valuation: { date: string; amount: number } | null): { flows: Flow[]; skipped: number } {
  const flows: Flow[] = [];
  let skipped = 0;
  for (const l of lots) {
    const units = lotRemaining(l);
    if (units <= 0) continue;
    if (!l.date) {
      skipped++;
      continue;
    }
    flows.push({ date: l.date, amount: -(units * l.price) });
  }
  for (const s of sales) if (s.date && s.amount) flows.push({ date: s.date, amount: s.amount });
  if (valuation?.date) flows.push({ date: valuation.date, amount: valuation.amount });
  // Same-day flows cancel out best when combined, which keeps XIRR's solver well behaved.
  const byDate = new Map<string, number>();
  for (const f of flows) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount);
  const merged: Flow[] = [...byDate.entries()].map(([date, amount]) => ({ date, amount })).filter((f) => Math.abs(f.amount) > 1e-9);
  return { flows: merged.sort((a, b) => (a.date < b.date ? -1 : 1)), skipped };
}

/**
 * Which units a sale of `units` consumed, oldest first (as Indian tax rules expect), and what
 * leaving cost. Purely: returns the lots it touched with the units removed from each.
 */
export type Consumption = { lot: Lot; units: number }[];
/** How many units of `lot` are consumed by a sale, given the units already used from earlier lots. */
export function consume(lots: Lot[], units: number): Consumption {
  let left = Math.max(0, units);
  const used: Consumption = [];
  for (const lot of sortLots(lots)) {
    if (left <= 0) break;
    const take = Math.min(lotRemaining(lot), left);
    if (take > 0) used.push({ lot, units: take });
    left -= take;
  }
  return used;
}