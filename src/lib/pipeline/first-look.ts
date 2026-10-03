import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { marketProvider } from "@/lib/data/market";
import type { MarketDataProvider } from "@/lib/data/provider";
import { NIFTY } from "@/lib/instruments/sectors";
import { rateLimit } from "@/lib/limits";
import { latestTradeDate } from "@/lib/market/store";
import { collectBatch, collectQuotes, missingLive } from "./collect";

/** Days of Nifty history needed for a meaningful 1-year beta. */
const NIFTY_HISTORY_MIN = 200;

/**
 * A one-time "first look" for symbols Nazar has never fetched (right after an import), so a new
 * user sees their portfolio immediately instead of waiting for tonight's checkup. Once per symbol,
 * ever — never per page view.
 */
/**
 * The first look after a user adds something. Demo visitors are anonymous, so theirs is capped;
 * a symbol Nazar already tracks costs nothing either way.
 */
export async function firstLookFor(user: { id: string; isDemo: boolean }, symbols: string[]) {
  try {
    if (user.isDemo) await rateLimit(`firstlook:${user.id}`, 30, 24 * 3600_000);
    return await firstLook(symbols.map((s) => s.toUpperCase()));
  } catch {
    return { fetched: 0 }; // best effort: tonight's checkup picks it up
  }
}

export async function firstLook(symbols: string[], provider: MarketDataProvider = marketProvider) {
  const db = await getDb();
  const missing = (await missingLive(db, [...new Set(symbols)])).slice(0, 59);
  if (!missing.length) return { fetched: 0 };
  // The Nifty is always quoted: it defines the session date.
  const q = await collectQuotes(db, provider, [NIFTY, ...missing], "live");
  const date = q.marketDate ?? (await latestTradeDate(db, ["live"]));
  if (!date) return { fetched: 0 };
  const deadline = Date.now() + 45_000;
  // Beta is computed against stored Nifty history, so make sure it exists before the stocks.
  // (A snapshot alone isn't enough: holiday runs store today's Nifty quote without history.)
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.priceDaily)
    .where(and(eq(schema.priceDaily.symbol, NIFTY), eq(schema.priceDaily.source, "live")));
  if (Number(n) < NIFTY_HISTORY_MIN) await collectBatch(db, provider, [NIFTY], 0, date, deadline, "live");
  const r = await collectBatch(db, provider, missing, 0, date, deadline, "live");
  return { fetched: r.processed };
}
