import "server-only";
import { getDb } from "@/lib/db";
import { yahooProvider } from "@/lib/data/provider";
import { NIFTY } from "@/lib/instruments/sectors";
import { latestTradeDate } from "@/lib/market/store";
import { collectBatch, collectQuotes, missingLive } from "./collect";

/**
 * A one-time "first look" for symbols Nazar has never fetched (right after an import), so a new
 * user sees their portfolio immediately instead of waiting for tonight's checkup. Once per symbol,
 * ever — never per page view.
 */
export async function firstLook(symbols: string[]) {
  const db = await getDb();
  const missing = await missingLive(db, [...new Set(symbols)]);
  if (!missing.length) return { fetched: 0 };
  const hasNifty = await latestTradeDate(db, ["live"]);
  // The Nifty is always quoted (it defines the session date); its history is fetched only once.
  const q = await collectQuotes(db, yahooProvider, [NIFTY, ...missing.slice(0, 59)], "live");
  const date = q.marketDate ?? hasNifty;
  if (!date) return { fetched: q.count };
  const list = hasNifty ? missing.slice(0, 59) : [NIFTY, ...missing.slice(0, 59)];
  const r = await collectBatch(db, yahooProvider, list, 0, date, Date.now() + 45_000, "live");
  return { fetched: r.processed };
}
