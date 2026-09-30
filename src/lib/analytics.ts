import "server-only";
import { randomUUID } from "crypto";
import { getDb, schema } from "./db";

/**
 * Product event types.
 * Server-side (trusted): question, guard_block, rate_limited, answer_error, share_created,
 *   watchlist_add, alert_created, feedback.
 * Client-side (via /api/events, whitelisted): the ones in CLIENT_EVENTS.
 */
export const CLIENT_EVENTS = new Set(["app_open", "export_pdf", "suggestion_click", "share_link_copied", "mode_change", "disclaimer_accepted", "sources_opened", "excel_download", "tools_opened", "catalog_example"]);

/** Fire-and-forget: analytics must never break or slow the product. */
export function track(userId: string, type: string, props: Record<string, unknown> = {}, chatId?: string | null) {
  void (async () => {
    try {
      const db = await getDb();
      await db.insert(schema.events).values({ id: randomUUID(), userId, chatId: chatId ?? null, type, props });
    } catch (e) {
      console.warn("[analytics] track failed:", e instanceof Error ? e.message : e);
    }
  })();
}

/** "IN" for NSE/BSE tickers and Indian indices, "US" for plain tickers, "OTHER" otherwise. */
export function marketOf(symbol: string): "IN" | "US" | "OTHER" {
  const s = symbol.toUpperCase();
  if (/\.(NS|BO)$/.test(s) || /^\^(NSEI|BSESN|NSEBANK|CNX|INDIAVIX|NSMIDCP)/.test(s) || s.startsWith("NIFTY")) return "IN";
  if (/^[A-Z]{1,5}(-[A-Z])?$/.test(s) || /^\^(GSPC|IXIC|DJI|RUT|VIX|TNX)$/.test(s)) return "US";
  return "OTHER";
}
