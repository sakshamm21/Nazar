import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { track } from "./analytics";
import { clean, fetchQuotes } from "./finance";

export const WATCHLIST_MAX = 50;

/** The user's watchlist with live quotes (symbols Yahoo can't price are still listed). */
export async function getWatchlist(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.watchlist).where(eq(schema.watchlist.userId, userId)).orderBy(asc(schema.watchlist.addedAt));
  if (!rows.length) return { items: [] as WatchItem[] };
  const quotes = await fetchQuotes(rows.map((r) => r.symbol)).catch(() => []);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  return {
    items: rows.map((r): WatchItem => {
      const q = bySymbol.get(r.symbol);
      return { symbol: r.symbol, name: q?.name ?? r.symbol, currency: q?.currency ?? null, price: q?.price ?? null, changePercent: q?.changePercent ?? null, marketState: q?.marketState ?? null };
    }),
  };
}

export type WatchItem = { symbol: string; name: string; currency: string | null; price: number | null; changePercent: number | null; marketState: string | null };

/** Adds symbols after verifying Yahoo can quote them. Returns what was added / rejected. */
export async function addToWatchlist(userId: string, symbols: string[]) {
  const wanted = [...new Set(symbols.map(clean))].filter(Boolean);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.watchlist).where(eq(schema.watchlist.userId, userId));
  const room = Math.max(0, WATCHLIST_MAX - Number(n));
  const quotes = wanted.length ? await fetchQuotes(wanted).catch(() => []) : [];
  const valid = new Set(quotes.filter((q) => q.price != null).map((q) => q.symbol));
  const accepted = wanted.filter((s) => valid.has(s)).slice(0, room);
  const rejected = wanted.filter((s) => !valid.has(s));
  if (accepted.length) {
    await db.insert(schema.watchlist).values(accepted.map((symbol) => ({ userId, symbol }))).onConflictDoNothing();
    track(userId, "watchlist_add", { symbols: accepted });
  }
  return { added: accepted, notFound: rejected, full: wanted.filter((s) => valid.has(s)).length > room };
}

export async function removeFromWatchlist(userId: string, symbols: string[]) {
  const db = await getDb();
  const list = [...new Set(symbols.map(clean))];
  if (list.length) await db.delete(schema.watchlist).where(and(eq(schema.watchlist.userId, userId), inArray(schema.watchlist.symbol, list)));
  return { removed: list };
}
