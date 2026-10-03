import "server-only";
import { randomUUID } from "crypto";
import { getDb, schema } from "./db";

/**
 * Product events (the /insights dashboard reads them).
 * Server-side, trusted: signed_up, email_verified, signed_in, account_deleted, demo_started,
 *   portfolio_created, import_previewed, recipient_added, price_target_created, alert_created,
 *   alert_rated, threshold_tuned, threshold_undone, simulate, settings_changed, tour_complete,
 *   tour_skip, tour_restart, and for Ask: question, guard_block, rate_limited, answer_error,
 *   share_created, feedback.
 * Client-side: only the types below are accepted by /api/events.
 */
export const CLIENT_EVENTS = new Set(["landing_cta", "tour_step", "portfolio_switch", "stress_slider", "theme_change", "excel_download", "export_pdf", "mode_change", "suggestion_click", "sources_opened", "share_link_copied"]);

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
