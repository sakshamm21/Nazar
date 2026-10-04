import "server-only";
import { randomUUID } from "crypto";
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { resilientProvider } from "@/lib/data/market";
import type { MarketDataProvider } from "@/lib/data/provider";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { NIFTY, SECTOR_INDICES } from "@/lib/instruments/sectors";
import { logger } from "@/lib/logger";
import { collectQuotes } from "./collect";
import { firstLook } from "./first-look";

/** A user's prices are refreshed at most this often, however many tabs or pages they open. */
export const REFRESH_EVERY_MS = 15 * 60_000;

type User = typeof schema.users.$inferSelect;

/** Every priced symbol in a user's portfolios and Watching list. */
export async function userSymbols(userId: string): Promise<string[]> {
  const db = await getDb();
  const held = await db.selectDistinct({ s: schema.holdings.symbol }).from(schema.holdings).innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId)).where(eq(schema.portfolios.userId, userId));
  const watched = await db.select({ s: schema.watching.symbol }).from(schema.watching).where(eq(schema.watching.userId, userId));
  return [...new Set([...held, ...watched].map((r) => r.s))].filter((s) => !isManualSymbol(s)).sort();
}

/**
 * Refresh on open: one batched quote call for the user's symbols and the market indices, stored
 * exactly as the nightly checkup stores them, so every page keeps reading from the database. It is
 * throttled per user, and demo accounts (which live on the frozen demo market) never trigger it.
 * Alerts are still decided once a day by the nightly checkup; this only keeps values current.
 */
export async function refreshFor(user: User, provider: MarketDataProvider = resilientProvider): Promise<{ updated: boolean; reason?: string }> {
  if (user.isDemo) return { updated: false, reason: "demo" };
  const db = await getDb();
  const key = `refresh:u:${user.id}`;
  const [recent] = await db.select({ id: schema.rateEvents.id }).from(schema.rateEvents).where(and(eq(schema.rateEvents.key, key), gte(schema.rateEvents.createdAt, new Date(Date.now() - REFRESH_EVERY_MS)))).limit(1);
  if (recent) return { updated: false, reason: "fresh" };
  const symbols = await userSymbols(user.id);
  if (!symbols.length) return { updated: false, reason: "empty" };
  // Claim the slot first, so parallel tabs don't each call the provider.
  await db.insert(schema.rateEvents).values({ id: randomUUID(), key });
  try {
    const q = await collectQuotes(db, provider, [NIFTY, ...SECTOR_INDICES, ...symbols], "live");
    // Anything still without history (added while the provider was down) gets its first look now.
    await firstLook(symbols, provider).catch(() => undefined);
    return { updated: q.count > 0 };
  } catch (e) {
    logger.warn({ err: String((e as Error)?.message ?? e).slice(0, 200) }, "refresh on open failed");
    return { updated: false, reason: "provider" };
  }
}
