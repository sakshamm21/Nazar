import "server-only";
import { randomUUID } from "crypto";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { resilientProvider } from "@/lib/data/market";
import type { MarketDataProvider } from "@/lib/data/provider";
import { getDb, schema, type DB } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { logger } from "@/lib/logger";
import { priceHistory } from "@/lib/market/store";
import { summarise } from "@/lib/portfolio/lots";
import { SIP_MAX_AMOUNT, SIP_MAX_DAY, SIP_MAX_YEARS_BACK, SIP_MIN_AMOUNT, SIP_MIN_DAY, dueOnOrAfter, instalmentsDue } from "@/lib/portfolio/sip";
import { requireHolding, requirePortfolio } from "./portfolios";

/**
 * Monthly SIPs: the plans, and the instalments Nazar adds for them.
 *
 * A plan belongs to one holding. With a start date, Nazar adds every instalment from that date on,
 * each at the price of its own day, when the plan is saved. Without one it never reaches back: the
 * units already held are taken to include every instalment so far, and the first one added is the
 * next due date. Each instalment is one more purchase lot, marked with the plan's id.
 */
export type Sip = typeof schema.sips.$inferSelect;
type Holding = typeof schema.holdings.$inferSelect;
export type SipInput = { amount: number; dayOfMonth: number; startDate?: string | null; endDate?: string | null; active?: boolean };

const shiftYears = (iso: string, years: number) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;

function check(input: SipInput, today: string) {
  if (!(input.amount >= SIP_MIN_AMOUNT && input.amount <= SIP_MAX_AMOUNT)) throw badRequest(`A SIP is between ₹${SIP_MIN_AMOUNT} and ₹${SIP_MAX_AMOUNT.toLocaleString("en-IN")} a month.`);
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < SIP_MIN_DAY || input.dayOfMonth > SIP_MAX_DAY) throw badRequest(`Pick a day from ${SIP_MIN_DAY} to ${SIP_MAX_DAY}, so every month has it.`);
  if (input.startDate && input.startDate > today) throw badRequest("The start date is in the future. Leave it empty and the SIP starts from its next due date.");
  if (input.startDate && input.startDate < shiftYears(today, -SIP_MAX_YEARS_BACK)) throw badRequest(`A SIP can start up to ${SIP_MAX_YEARS_BACK} years back.`);
  if (input.endDate && input.endDate < today) throw badRequest("The end date is already past.");
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

/**
 * Sets the plan on a holding, or changes the one it has. `today` is the reader's calendar date in
 * India. A new plan with a start date in the past is caught up at once: every instalment since
 * then is added before this returns, so the holding the user sees next already has them.
 */
export async function setSip(userId: string, holdingId: string, input: SipInput, today: string, provider: MarketDataProvider = resilientProvider): Promise<{ sip: Sip; added: number }> {
  check(input, today);
  const h = await requireHolding(userId, holdingId);
  if (isManualSymbol(h.symbol)) throw badRequest("A SIP needs something with a daily price: a fund, a stock or an ETF.");
  const db = await getDb();
  const [existing] = await db.select().from(schema.sips).where(eq(schema.sips.holdingId, holdingId)).limit(1);
  const active = input.active ?? existing?.active ?? true;
  if (existing) {
    // The start date is what the instalments already added were counted from; it does not change afterwards.
    // Changing the day, or resuming after a pause, carries on from today: nothing is added for the gap.
    const moved = existing.dayOfMonth !== input.dayOfMonth || (active && !existing.active);
    const [sip] = await db
      .update(schema.sips)
      .set({ amount: input.amount, dayOfMonth: input.dayOfMonth, endDate: input.endDate ?? null, active, nextDue: moved ? dueOnOrAfter(input.dayOfMonth, today) : existing.nextDue, updatedAt: new Date() })
      .where(eq(schema.sips.id, existing.id))
      .returning();
    return { sip, added: 0 };
  }
  const startDate = input.startDate ?? null;
  const [created] = await db
    .insert(schema.sips)
    .values({ id: randomUUID(), portfolioId: h.portfolioId, holdingId, amount: input.amount, dayOfMonth: input.dayOfMonth, startDate, endDate: input.endDate ?? null, active, nextDue: dueOnOrAfter(input.dayOfMonth, startDate ?? today) })
    .returning();
  if (!startDate || created.nextDue > today) return { sip: created, added: 0 };
  // Years of prices are not kept for every symbol, so the history for the catch-up is fetched now.
  let closes = new Map<string, number>();
  try {
    closes = new Map((await provider.dailyHistory(h.symbol, new Date(`${created.nextDue}T00:00:00Z`))).map((b) => [b.date, b.close]));
  } catch (e) {
    logger.warn({ symbol: h.symbol, err: String((e as Error)?.message ?? e).slice(0, 200) }, "sip catch-up: no price history from the provider");
  }
  if (!closes.size) closes = (await priceHistory(db, [h.symbol], ["live"], created.nextDue, today)).get(h.symbol) ?? new Map();
  if (!closes.size) {
    await db.delete(schema.sips).where(eq(schema.sips.id, created.id));
    throw badRequest("Nazar couldn't get past prices for this holding just now, so it can't add the earlier instalments. Try again in a minute, or leave the start date empty.");
  }
  const { added } = await applyPlan(db, created, h, closes, today);
  const [sip] = await db.select().from(schema.sips).where(eq(schema.sips.id, created.id)).limit(1);
  return { sip, added };
}

/**
 * Stops a plan. The instalments it added stay, because they are purchases, unless `undo` asks for
 * them to be taken back out: the way to put right a start date or an amount entered wrongly.
 */
export async function removeSip(userId: string, holdingId: string, opts: { undo?: boolean } = {}) {
  const h = await requireHolding(userId, holdingId);
  const db = await getDb();
  const [sip] = await db.select().from(schema.sips).where(eq(schema.sips.holdingId, holdingId)).limit(1);
  if (!sip) return { removedInstalments: 0 };
  let removedInstalments = 0;
  if (opts.undo) {
    const lots = await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.holdingId, h.id));
    const mine = lots.filter((l) => l.sipId === sip.id);
    removedInstalments = mine.length;
    if (removedInstalments) {
      const units = mine.reduce((a, l) => a + l.remaining, 0);
      const cost = mine.reduce((a, l) => a + l.remaining * l.price, 0);
      const quantity = h.quantity - units;
      if (!(quantity > 1e-9)) throw badRequest("Everything in this holding came from the SIP, so taking those instalments out would leave nothing. Remove the holding instead.");
      // What is left is what was there before: its cost is the total less what the instalments cost.
      const kept = summarise(lots.filter((l) => l.sipId !== sip.id));
      const avgPrice = (h.quantity * h.avgPrice - cost) / quantity;
      await db.delete(schema.holdingLots).where(and(eq(schema.holdingLots.holdingId, h.id), eq(schema.holdingLots.sipId, sip.id)));
      await db.update(schema.holdings).set({ quantity, avgPrice: avgPrice > 0 ? avgPrice : kept.avgPrice || h.avgPrice, buyDate: kept.buyDate ?? h.buyDate, updatedAt: new Date() }).where(eq(schema.holdings.id, h.id));
    }
  }
  await db.delete(schema.sips).where(eq(schema.sips.id, sip.id));
  return { removedInstalments };
}

/**
 * Adds one plan's instalments that have fallen due and can be priced, as a single step.
 *
 * The plan is claimed first, by moving its next due date forward only if it is still where this
 * run found it. A second run, or two overlapping ones, find the date already moved and add
 * nothing: instalments can be missed by a crash between the writes, never added twice.
 */
async function applyPlan(db: DB, sip: Sip, holding: Holding, closes: Map<string, number>, today: string): Promise<{ added: number; ended: boolean }> {
  const plan = instalmentsDue(sip, closes, today);
  if (plan.nextDue !== sip.nextDue) {
    const amount = plan.instalments.reduce((a, i) => a + i.amount, 0);
    const claimed = await db
      .update(schema.sips)
      .set({ nextDue: plan.nextDue, instalments: sql`${schema.sips.instalments} + ${plan.instalments.length}`, invested: sql`${schema.sips.invested} + ${amount}`, ...(plan.ended ? { active: false } : {}), updatedAt: new Date() })
      .where(and(eq(schema.sips.id, sip.id), eq(schema.sips.nextDue, sip.nextDue)))
      .returning({ id: schema.sips.id });
    if (!claimed.length) return { added: 0, ended: false };
  } else if (plan.ended) await db.update(schema.sips).set({ active: false, updatedAt: new Date() }).where(eq(schema.sips.id, sip.id));
  if (!plan.instalments.length) return { added: 0, ended: plan.ended };
  await db.insert(schema.holdingLots).values(plan.instalments.map((i) => ({ id: randomUUID(), holdingId: holding.id, portfolioId: holding.portfolioId, quantity: i.quantity, price: i.price, date: i.tradeDate, remaining: i.quantity, sipId: sip.id })));
  // The holding as it stands now, plus what was just bought: units add up, the average is weighted by units.
  const [h] = await db.select().from(schema.holdings).where(eq(schema.holdings.id, holding.id)).limit(1);
  if (!h) return { added: 0, ended: plan.ended };
  const units = plan.instalments.reduce((a, i) => a + i.quantity, 0);
  const cost = plan.instalments.reduce((a, i) => a + i.amount, 0);
  const quantity = h.quantity + units;
  const first = [h.buyDate, plan.instalments[0].tradeDate].filter((d): d is string => !!d).sort()[0] ?? null;
  await db.update(schema.holdings).set({ quantity, avgPrice: (h.quantity * h.avgPrice + cost) / quantity, buyDate: first, updatedAt: new Date() }).where(eq(schema.holdings.id, h.id));
  return { added: plan.instalments.length, ended: plan.ended };
}

/**
 * Adds every instalment that has fallen due and can be priced, for every user. Run by the nightly
 * checkup once the day's prices are in, and by the daily housekeeping so a due date that fell on a
 * holiday is picked up when the market next trades.
 */
export async function applyDueSips(db: DB, today: string, sources: string[] = ["live"]): Promise<{ plans: number; added: number; ended: number; failed: number }> {
  const due = await db.select({ sip: schema.sips, holding: schema.holdings }).from(schema.sips).innerJoin(schema.holdings, eq(schema.holdings.id, schema.sips.holdingId)).where(and(eq(schema.sips.active, true), lte(schema.sips.nextDue, today)));
  const stats = { plans: due.length, added: 0, ended: 0, failed: 0 };
  if (!due.length) return stats;
  const from = due.map((d) => d.sip.nextDue).sort()[0];
  const prices = await priceHistory(db, [...new Set(due.map((d) => d.holding.symbol))], sources, from, today);
  for (const { sip, holding } of due) {
    try {
      const r = await applyPlan(db, sip, holding, prices.get(holding.symbol) ?? new Map(), today);
      stats.added += r.added;
      if (r.ended) stats.ended++;
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
