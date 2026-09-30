import "server-only";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { track } from "./analytics";
import { clean, fetchQuotes } from "./finance";

export const ALERTS_MAX_ACTIVE = 25;

export type Alert = typeof schema.alerts.$inferSelect;

export async function listAlerts(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.alerts).where(eq(schema.alerts.userId, userId)).orderBy(desc(schema.alerts.createdAt)).limit(100);
  return { alerts: rows.map(publicAlert) };
}

export function publicAlert(a: Alert) {
  return {
    id: a.id,
    symbol: a.symbol,
    direction: a.direction,
    target: a.target,
    currency: a.currency,
    note: a.note,
    createdAt: a.createdAt,
    triggeredAt: a.triggeredAt,
    triggeredPrice: a.triggeredPrice,
  };
}

export async function createAlert(userId: string, input: { symbol: string; direction: "above" | "below"; target: number; note?: string }) {
  const symbol = clean(input.symbol);
  if (!(input.target > 0) || !Number.isFinite(input.target)) return { error: "Target price must be a positive number." };
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.userId, userId), isNull(schema.alerts.triggeredAt)));
  if (Number(n) >= ALERTS_MAX_ACTIVE) return { error: `You already have ${ALERTS_MAX_ACTIVE} active alerts. Delete some first.` };
  const [q] = await fetchQuotes([symbol]).catch(() => []);
  if (!q || q.price == null) return { error: `Couldn't find a live price for ${symbol}. Check the ticker (Indian stocks need .NS or .BO).` };
  const alreadyMet = input.direction === "above" ? q.price >= input.target : q.price <= input.target;
  const row = { id: randomUUID(), userId, symbol: q.symbol, direction: input.direction, target: input.target, currency: q.currency, note: input.note?.slice(0, 140) ?? null };
  await db.insert(schema.alerts).values(row);
  track(userId, "alert_created", { symbol: row.symbol, direction: row.direction });
  return { created: { id: row.id, symbol: row.symbol, direction: row.direction, target: row.target, currency: row.currency, note: row.note, currentPrice: q.price }, warning: alreadyMet ? `${q.symbol} is already ${input.direction} ${input.target} (now ${q.price}), so this alert will trigger on the next check.` : undefined };
}

export async function deleteAlerts(userId: string, ids: string[]) {
  const db = await getDb();
  if (ids.length) await db.delete(schema.alerts).where(and(eq(schema.alerts.userId, userId), inArray(schema.alerts.id, ids)));
  return { deleted: ids };
}

/**
 * Checks active alerts against live prices and marks the ones that crossed.
 * Pass a userId to check one user (in-app polling) or omit it for everyone (cron).
 * Returns alerts that triggered and haven't been shown to the user yet.
 */
export async function checkAlerts(userId?: string) {
  const db = await getDb();
  const active = await db
    .select()
    .from(schema.alerts)
    .where(userId ? and(eq(schema.alerts.userId, userId), isNull(schema.alerts.triggeredAt)) : isNull(schema.alerts.triggeredAt))
    .limit(2000);
  if (active.length) {
    const symbols = [...new Set(active.map((a) => a.symbol))];
    const prices = new Map<string, number>();
    for (let i = 0; i < symbols.length; i += 50) {
      const qs = await fetchQuotes(symbols.slice(i, i + 50)).catch(() => []);
      for (const q of qs) if (q.price != null) prices.set(q.symbol, q.price);
    }
    const now = new Date();
    for (const a of active) {
      const p = prices.get(a.symbol);
      if (p == null) continue;
      if (a.direction === "above" ? p >= a.target : p <= a.target) {
        await db.update(schema.alerts).set({ triggeredAt: now, triggeredPrice: p }).where(eq(schema.alerts.id, a.id));
        track(a.userId, "alert_triggered", { symbol: a.symbol, source: userId ? "app" : "cron" });
      }
    }
  }
  if (!userId) return { fresh: [] };
  const fresh = await db
    .select()
    .from(schema.alerts)
    .where(and(eq(schema.alerts.userId, userId), sql`${schema.alerts.triggeredAt} is not null`, eq(schema.alerts.notified, 0)));
  if (fresh.length) await db.update(schema.alerts).set({ notified: 1 }).where(inArray(schema.alerts.id, fresh.map((a) => a.id)));
  return { fresh: fresh.map(publicAlert) };
}
