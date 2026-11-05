import "server-only";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { istDate } from "@/lib/data/provider";
import { getDb, schema } from "@/lib/db";
import { badRequest, conflict } from "@/lib/errors";
import { track } from "@/lib/events";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { catalogItem } from "@/lib/instruments/catalog";
import { displayName } from "@/lib/market/portfolio-day";
import { planSale, summarise } from "@/lib/portfolio/lots";
import { requireHolding } from "@/lib/repo/portfolios";

/**
 * Sales: units that left a holding, at a price on a day. The units come out of the oldest purchase
 * lots first, as Indian tax rules expect; each lot keeps its own date and price and only its
 * `remaining` goes down, so the instalments of a SIP survive a partial sale. Selling everything
 * removes the holding, and the sale rows stay: they belong to the portfolio, not to the holding.
 */
export type Sale = typeof schema.holdingSales.$inferSelect;

// The day in India: a sale entered just after midnight there is not "in the future".
const today = () => istDate(new Date());

export async function recordSale(userId: string, holdingId: string, input: { units: number; price: number; date: string }) {
  const h = await requireHolding(userId, holdingId);
  if (isManualSymbol(h.symbol)) throw badRequest("A deposit or other manual asset is changed by editing its value.");
  if (!(input.units > 0) || !(input.price > 0)) throw badRequest("Enter the units sold and the price.");
  if (input.date > today()) throw badRequest("A sale can't be dated in the future.");
  const units = Math.min(input.units, h.quantity);
  if (input.units > h.quantity * (1 + 1e-9)) throw badRequest(`This holding has ${h.quantity} units, fewer than ${input.units}.`);

  const db = await getDb();
  const lotRows = await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.holdingId, h.id)).orderBy(asc(schema.holdingLots.date));
  const lots = lotRows.map((r) => ({ quantity: r.quantity, price: r.price, date: r.date, remaining: r.remaining }));
  const first = lots.filter((l) => l.remaining > 0).map((l) => l.date).sort()[0];
  if (first && input.date < first) throw badRequest(`A sale can't come before the first purchase still held (${first}).`);

  const plan = planSale(lots, units);
  if (plan.units < units - 1e-9) throw badRequest("The purchase records for this holding don't cover that many units. Correct the holding first.");

  // Claim the position first: only the request that finds the quantity unchanged goes ahead, so a
  // double-click can't sell the same units twice.
  const after = summarise(lots.map((l, i) => ({ ...l, remaining: plan.remaining[i] })));
  const sellsAll = after.quantity <= 1e-9;
  const [inst] = await db.select().from(schema.instruments).where(eq(schema.instruments.symbol, h.symbol)).limit(1);
  const claimed = await db
    .update(schema.holdings)
    .set(sellsAll ? { quantity: 0, updatedAt: new Date() } : { quantity: after.quantity, avgPrice: after.avgPrice, buyDate: after.buyDate, updatedAt: new Date() })
    .where(and(eq(schema.holdings.id, h.id), eq(schema.holdings.quantity, h.quantity)))
    .returning({ id: schema.holdings.id });
  if (!claimed.length) throw conflict("This holding changed while the sale was being recorded. Reload and try again.");

  const sale = {
    id: randomUUID(),
    userId,
    portfolioId: h.portfolioId,
    holdingId: sellsAll ? null : h.id,
    symbol: h.symbol,
    name: displayName(h.symbol, inst ?? null),
    assetClass: h.assetClass,
    category: inst?.category ?? catalogItem(h.symbol)?.sub ?? null,
    units: plan.units,
    price: input.price,
    date: input.date,
    cost: plan.cost,
    parts: plan.parts,
  };
  await db.insert(schema.holdingSales).values(sale);
  if (sellsAll) {
    await db.delete(schema.holdings).where(eq(schema.holdings.id, h.id));
  } else {
    for (const [i, r] of lotRows.entries()) {
      if (plan.remaining[i] !== r.remaining) await db.update(schema.holdingLots).set({ remaining: Math.max(0, plan.remaining[i]) }).where(eq(schema.holdingLots.id, r.id));
    }
  }
  track(userId, "sale_recorded", { assetClass: h.assetClass, all: sellsAll });
  return { sale, removed: sellsAll };
}

/** Every sale in a portfolio, oldest first. */
export async function salesForPortfolio(portfolioId: string): Promise<Sale[]> {
  const db = await getDb();
  return db.select().from(schema.holdingSales).where(eq(schema.holdingSales.portfolioId, portfolioId)).orderBy(asc(schema.holdingSales.date));
}

/** Every sale by a user, oldest first. */
export async function salesForUser(userId: string): Promise<Sale[]> {
  const db = await getDb();
  return db.select().from(schema.holdingSales).where(eq(schema.holdingSales.userId, userId)).orderBy(asc(schema.holdingSales.date));
}

/** Sales of one holding (newest first), for its history. */
export async function salesForHolding(userId: string, holdingId: string): Promise<Sale[]> {
  await requireHolding(userId, holdingId);
  const db = await getDb();
  const rows = await db.select().from(schema.holdingSales).where(eq(schema.holdingSales.holdingId, holdingId));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
