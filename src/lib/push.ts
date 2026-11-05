import "server-only";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import webpush from "web-push";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isAdviceFree } from "@/lib/guard";
import { displayName } from "@/lib/market/portfolio-day";

/**
 * Notifications on a person's own devices, only after they ask for them. Off on a deployment without
 * VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY): nothing is offered and nothing is sent.
 */
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
let ready = false;
function init() {
  if (ready || !configured()) return configured();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:nazar@users.noreply.github.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
  return true;
}

export type PushMessage = { title: string; body: string; url: string };

/** Sends to every device the person subscribed; a device that is gone is forgotten. */
export async function sendPush(db: DB, userId: string, msg: PushMessage) {
  if (!init() || !isAdviceFree(`${msg.title} ${msg.body}`)) return 0;
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 12 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
      else logger.warn({ code, err: String((e as Error)?.message ?? e).slice(0, 200) }, "push failed");
    }
  }
  return sent;
}

/**
 * After the evening checkup: one notification per subscribed person, about companies they hold that
 * reported results today and SIP instalments Nazar added today. Nothing else, and never a tip.
 */
export async function sendDailyPushes(db: DB, runDate: string) {
  if (!configured()) return { sent: 0, reason: "not configured" };
  const subs = await db.selectDistinct({ userId: schema.pushSubscriptions.userId }).from(schema.pushSubscriptions);
  if (!subs.length) return { sent: 0 };
  const results = await db.select({ symbol: schema.resultsEvents.symbol }).from(schema.resultsEvents).where(eq(schema.resultsEvents.detectedOn, runDate));
  const reported = new Set(results.map((r) => r.symbol));
  const since = new Date(Date.now() - 20 * 3600_000);
  let sent = 0;
  for (const { userId } of subs) {
    const pfs = (await db.select({ id: schema.portfolios.id }).from(schema.portfolios).where(eq(schema.portfolios.userId, userId))).map((p) => p.id);
    if (!pfs.length) continue;
    const held = await db.selectDistinct({ symbol: schema.holdings.symbol }).from(schema.holdings).where(inArray(schema.holdings.portfolioId, pfs));
    const names = held.filter((h) => reported.has(h.symbol)).map((h) => displayName(h.symbol));
    const sips = await db.select({ id: schema.holdingLots.id }).from(schema.holdingLots).where(and(inArray(schema.holdingLots.portfolioId, pfs), isNotNull(schema.holdingLots.sipId), gte(schema.holdingLots.createdAt, since)));
    const parts = [names.length ? `${names.slice(0, 2).join(" and ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""} reported results.` : "", sips.length ? `${sips.length} SIP instalment${sips.length === 1 ? "" : "s"} added.` : ""].filter(Boolean);
    if (!parts.length) continue;
    sent += await sendPush(db, userId, { title: names.length ? "Results are in" : "SIP added", body: parts.join(" "), url: names.length ? "/analysis" : "/portfolio?tab=manage" });
  }
  return { sent };
}
