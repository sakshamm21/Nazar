import "server-only";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { track } from "@/lib/analytics";

/** Manual "tell me when X crosses ₹Y" alerts (v1's price alerts, P2), checked by the nightly pipeline. */
export const TARGETS_MAX_ACTIVE = 25;

export async function listTargets(userId: string) {
  const db = await getDb();
  return db.select().from(schema.priceTargets).where(eq(schema.priceTargets.userId, userId)).orderBy(desc(schema.priceTargets.createdAt)).limit(100);
}

export async function createTarget(userId: string, input: { symbol: string; direction: "above" | "below"; target: number; note?: string | null }) {
  if (!(input.target > 0)) throw badRequest("Target price must be a positive number.");
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.priceTargets).where(and(eq(schema.priceTargets.userId, userId), isNull(schema.priceTargets.triggeredAt)));
  if (Number(n) >= TARGETS_MAX_ACTIVE) throw badRequest(`You already have ${TARGETS_MAX_ACTIVE} active price alerts. Delete some first.`);
  const row = { id: randomUUID(), userId, symbol: input.symbol.toUpperCase(), direction: input.direction, target: input.target, note: input.note?.slice(0, 140) ?? null };
  await db.insert(schema.priceTargets).values(row);
  track(userId, "price_target_created", { symbol: row.symbol, direction: row.direction });
  return row;
}

export async function deleteTargets(userId: string, ids: string[]) {
  const db = await getDb();
  if (ids.length) await db.delete(schema.priceTargets).where(and(eq(schema.priceTargets.userId, userId), inArray(schema.priceTargets.id, ids)));
}
