import "server-only";
import { randomUUID } from "crypto";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { logger } from "@/lib/logger";
import { priceHistory } from "@/lib/market/store";
import { SIP_MAX_AMOUNT, SIP_MAX_DAY, SIP_MIN_AMOUNT, SIP_MIN_DAY, dueOnOrAfter, instalmentsDue } from "@/lib/portfolio/sip";
import { mergeLot, requireHolding, requirePortfolio } from "./portfolios";

/**
 * Monthly SIPs: the plans, and the instalments Nazar adds for them.
 *
 * A plan belongs to one holding. It never reaches back: the units already held are taken to include
 * every instalment so far, so the first one Nazar adds is the next due date from the day the plan
 * was set up. Each instalment is one more purchase lot, marked with the plan's id.
 */
export type Sip = typeof schema.sips.$inferSelect;
export type SipInput = { amount: number; dayOfMonth: number; endDate?: string | null; active?: boolean };

function check(input: SipInput) {
  if (!(input.amount >= SIP_MIN_AMOUNT && input.amount <= SIP_MAX_AMOUNT)) throw badRequest(`A SIP is between ₹${SIP_MIN_AMOUNT} and ₹${SIP_MAX_AMOUNT.toLocaleString("en-IN")} a month.`);
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < SIP_MIN_DAY || input.dayOfMonth > SIP_MAX_DAY) throw badRequest(`Pick a day from ${SIP_MIN_DAY} to ${SIP_MAX_DAY}, so every month has it.`);
}

/** Every plan in a portfolio, keyed by holding id. */
export async function sipsForPortfolio(portfolioId: string): Promise<Map<string, Sip>> {
  const db = await getDb();
  const rows = await db.select().from(schema.sips).where(eq(schema.sips.portfolioId, portfolioId));
  return new Map(rows.map((r) => [r.holdingId, r]));
}

export async function listSips(userId: string, portfolioId: string): Promise<Sip[]> {
  await requirePortfolio(userId, portfolioId);
  return [...(await sipsForPortfolio(portfolioId)).values()];
}

/** Sets the plan on a holding, or changes the one it has. `today` is the reader's calendar date in India. */
export async function setSip(userId: string, holdingId: string, input: SipInput, today: string): Promise<Sip> {
  check(input);
  const h = await requireHolding(userId, holdingId);
  if (isManualSymbol(h.symbol)) throw badRequest("A SIP needs something with a daily price: a fund, a stock or an ETF.");
  if (input.endDate && input.endDate < today) throw badRequest("The end date is already past.");
  const db = await getDb();
  const [existing] = await db.select().from(schema.sips).where(eq(schema.sips.holdingId, holdingId)).limit(1);
  const active = input.active ?? existing?.active ?? true;
  // Changing the day, or resuming after a pause, starts from today: nothing is added for the gap.
  const moved = !existing || existing.dayOfMonth !== input.dayOfMonth || (active && !existing.active);
  const nextDue = moved ? dueOnOrAfter(input.dayOfMonth, today) : existing.nextDue;
  const values = { amount: input.amount, dayOfMonth: input.dayOfMonth, endDate: input.endDate ?? null, active, nextDue, updatedAt: new Date() };
  if (existing) {
    const [row] = await db.update(schema.sips).set(values).where(eq(schema.sips.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(schema.sips).values({ id: randomUUID(), portfolioId: h.portfolioId, holdingId, ...values }).returning();
  return row;
}

/** Stops a plan. The instalments it already added stay: they are purchases, and removing the plan does not unbuy them. */
export async function removeSip(userId: string, holdingId: string) {
  await requireHolding(userId, holdingId);
  const db = await getDb();
  await db.delete(schema.sips).where(eq(schema.sips.holdingId, holdingId));
}

/**
 * Adds every instalment that has fallen due and can be priced, for every user. Run by the nightly
 * checkup once the day's prices are in, and by the daily housekeeping so a due date that fell on a
 * holiday is picked up when the market next trades.
 *
 * Each instalment is claimed first, by moving the plan's next due date forward only if it is still
 * the one being added. A second run, or two overlapping ones, find the date already moved and add
 * nothing: an instalment can be missed by a crash between the two writes, never added twice.
 */
export async function applyDueSips(db: DB, today: string, sources: string[] = ["live"]): Promise<{ plans: number; added: number; ended: number; failed: number }> {
  const due = await db.select({ sip: schema.sips, holding: schema.holdings }).from(schema.sips).innerJoin(schema.holdings, eq(schema.holdings.id, schema.sips.holdingId)).where(and(eq(schema.sips.active, true), lte(schema.sips.nextDue, today)));
  const stats = { plans: due.length, added: 0, ended: 0, failed: 0 };
  if (!due.length) return stats;
  const from = due.map((d) => d.sip.nextDue).sort()[0];
  const prices = await priceHistory(db, [...new Set(due.map((d) => d.holding.symbol))], sources, from, today);
  for (const { sip, holding } of due) {
    try {
      const plan = instalmentsDue(sip, prices.get(holding.symbol) ?? new Map(), today);
      let nextDue = sip.nextDue;
      for (const [i, inst] of plan.instalments.entries()) {
        const after = plan.instalments[i + 1]?.due ?? plan.nextDue;
        const claimed = await db
          .update(schema.sips)
          .set({ nextDue: after, instalments: sql`${schema.sips.instalments} + 1`, invested: sql`${schema.sips.invested} + ${inst.amount}`, updatedAt: new Date() })
          .where(and(eq(schema.sips.id, sip.id), eq(schema.sips.nextDue, nextDue)))
          .returning({ id: schema.sips.id });
        if (!claimed.length) break;
        nextDue = after;
        const [h] = await db.select().from(schema.holdings).where(eq(schema.holdings.id, holding.id)).limit(1);
        if (!h) break;
        const merged = mergeLot({ quantity: h.quantity, avgPrice: h.avgPrice, buyDate: h.buyDate }, { quantity: inst.quantity, avgPrice: inst.price, buyDate: inst.tradeDate });
        await db.update(schema.holdings).set({ quantity: merged.quantity, avgPrice: merged.avgPrice, buyDate: merged.buyDate, updatedAt: new Date() }).where(eq(schema.holdings.id, h.id));
        await db.insert(schema.holdingLots).values({ id: randomUUID(), holdingId: h.id, portfolioId: h.portfolioId, quantity: inst.quantity, price: inst.price, date: inst.tradeDate, remaining: inst.quantity, sipId: sip.id });
        stats.added++;
      }
      // Months skipped for want of a price, and the end of the plan, still move the plan on.
      if (plan.nextDue !== nextDue) await db.update(schema.sips).set({ nextDue: plan.nextDue, updatedAt: new Date() }).where(and(eq(schema.sips.id, sip.id), eq(schema.sips.nextDue, nextDue)));
      if (plan.ended) {
        await db.update(schema.sips).set({ active: false, updatedAt: new Date() }).where(eq(schema.sips.id, sip.id));
        stats.ended++;
      }
    } catch (e) {
      stats.failed++;
      logger.warn({ sip: sip.id, err: String((e as Error)?.message ?? e).slice(0, 200) }, "sip instalment failed");
    }
  }
  return stats;
}

/** What Nazar has added for each plan and is still held: units and what they cost, by plan id. */
export async function sipLots(db: DB, sipIds: string[]): Promise<Map<string, { units: number; cost: number; first: string | null; last: string | null }>> {
  const out = new Map<string, { units: number; cost: number; first: string | null; last: string | null }>();
  if (!sipIds.length) return out;
  const rows = await db.select().from(schema.holdingLots).where(inArray(schema.holdingLots.sipId, sipIds));
  for (const r of rows) {
    const s = out.get(r.sipId!) ?? { units: 0, cost: 0, first: null, last: null };
    s.units += r.remaining;
    s.cost += r.remaining * r.price;
    s.first = !s.first || r.date < s.first ? r.date : s.first;
    s.last = !s.last || r.date > s.last ? r.date : s.last;
    out.set(r.sipId!, s);
  }
  return out;
}
