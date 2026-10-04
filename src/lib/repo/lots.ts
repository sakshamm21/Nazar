import "server-only";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Lot } from "@/lib/portfolio/lots";

/**
 * The purchase-lot ledger. A holding row is a summary of its position; these rows record what that
 * position was built from, so money-weighted return, realised gains and holding-period buckets are
 * all derivable instead of guessed from a single weighted-average purchase.
 *
 * Two rules keep the ledger honest:
 *  - an "add by hand" of more of something already held records an additional lot, so each
 *    instalment keeps its own price and date;
 *  - a broker import states the whole position and replaces the summary, so it also replaces the
 *    ledger with a single lot matching what was imported.
 */

/** Every lot for a portfolio, keyed by holding id. */
export async function lotsForPortfolio(portfolioId: string): Promise<Map<string, Lot[]>> {
  const db = await getDb();
  const rows = await db
    .select({
      holdingId: schema.holdingLots.holdingId,
      quantity: schema.holdingLots.quantity,
      price: schema.holdingLots.price,
      date: schema.holdingLots.date,
      remaining: schema.holdingLots.remaining,
    })
    .from(schema.holdingLots)
    .where(eq(schema.holdingLots.portfolioId, portfolioId));
  const out = new Map<string, Lot[]>();
  for (const r of rows) {
    const list = out.get(r.holdingId) ?? [];
    list.push({ quantity: r.quantity, price: r.price, date: r.date, remaining: r.remaining });
    out.set(r.holdingId, list);
  }
  return out;
}

export async function lotsForHoldings(holdingIds: string[]): Promise<Map<string, Lot[]>> {
  if (!holdingIds.length) return new Map();
  const db = await getDb();
  const rows = await db
    .select({
      holdingId: schema.holdingLots.holdingId,
      quantity: schema.holdingLots.quantity,
      price: schema.holdingLots.price,
      date: schema.holdingLots.date,
      remaining: schema.holdingLots.remaining,
    })
    .from(schema.holdingLots)
    .where(inArray(schema.holdingLots.holdingId, holdingIds));
  const out = new Map<string, Lot[]>();
  for (const r of rows) {
    const list = out.get(r.holdingId) ?? [];
    list.push({ quantity: r.quantity, price: r.price, date: r.date, remaining: r.remaining });
    out.set(r.holdingId, list);
  }
  return out;
}

/**
 * Records a further purchase of something already held. The existing lots are kept and the new
 * purchase is added as one more lot, which is what makes a monthly SIP show up as a series of dated
 * purchases instead of one lump sum. `addLot` is used instead of `resyncLots` on this path precisely
 * because merging into a weighted average would throw the instalment dates away.
 */
export async function addLot(holdingId: string, portfolioId: string, lot: { quantity: number; price: number; date: string }) {
  const db = await getDb();
  const date = lot.date || new Date().toISOString().slice(0, 10);
  await db.insert(schema.holdingLots).values({ id: randomUUID(), holdingId, portfolioId, quantity: lot.quantity, price: lot.price, date, remaining: lot.quantity });
}

/**
 * Makes a holding's ledger agree with its summary row. Called after a holding is written by a path
 * that states the whole position (a broker import, or an edit of quantity/average price/date), so
 * the two can never disagree about how much is held or what it cost.
 */
export async function resyncLots(holdingId: string, portfolioId: string, summary: { quantity: number; avgPrice: number; buyDate: string | null }) {
  const db = await getDb();
  await db.delete(schema.holdingLots).where(eq(schema.holdingLots.holdingId, holdingId));
  if (summary.quantity <= 0) return;
  await db.insert(schema.holdingLots).values({
    id: randomUUID(),
    holdingId,
    portfolioId,
    quantity: summary.quantity,
    price: summary.avgPrice,
    // A holding with no recorded date cannot be placed in time; today's date is honest rather than a
    // guess at when the money went in, and the flow is then simply dated today.
    date: summary.buyDate ?? new Date().toISOString().slice(0, 10),
    remaining: summary.quantity,
  });
}

/**
 * The ledger for one holding. A holding written before the lots migration was backfilled with a
 * matching single lot, and every write path has kept the ledger in step since, so an empty result
 * means the holding genuinely has nothing recorded (a zero-quantity position).
 */
export async function lotsForHolding(holdingId: string): Promise<Lot[]> {
  const db = await getDb();
  const rows = await db
    .select({ quantity: schema.holdingLots.quantity, price: schema.holdingLots.price, date: schema.holdingLots.date, remaining: schema.holdingLots.remaining })
    .from(schema.holdingLots)
    .where(eq(schema.holdingLots.holdingId, holdingId));
  return rows.map((r) => ({ quantity: r.quantity, price: r.price, date: r.date, remaining: r.remaining }));
}