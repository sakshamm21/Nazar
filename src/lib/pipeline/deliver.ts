import "server-only";
import { randomUUID } from "crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/alerts/routing";
import { safeText } from "@/lib/alerts/guard";
import { signLink } from "@/lib/auth/links";
import { appUrl } from "@/lib/auth/service";
import { digestEmail, type DigestItem } from "@/lib/email/templates";
import { EMAIL_DAILY_CAP, sendMail } from "@/lib/email/mailer";
import { getSettings } from "@/lib/repo/alerts";

type Alert = typeof schema.alertEvents.$inferSelect;
type User = typeof schema.users.$inferSelect;

/** Emails sent (or attempted) since midnight UTC — the free-tier budget. */
export async function emailsSentToday() {
  const db = await getDb();
  const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.deliveries).where(and(gte(schema.deliveries.createdAt, since), inArray(schema.deliveries.status, ["sent", "failed"])));
  return Number(r?.n ?? 0);
}

/** Records a delivery once per (item, email); returns false if it was already handled. */
async function claim(userId: string, kind: (typeof schema.deliveries.$inferInsert)["kind"], itemKey: string, email: string, alertIds: string[]) {
  const db = await getDb();
  const rows = await db.insert(schema.deliveries).values({ id: randomUUID(), userId, kind, itemKey, email, status: "skipped_no_config", alertIds }).onConflictDoNothing().returning({ id: schema.deliveries.id });
  return rows[0]?.id ?? null;
}

async function finish(id: string, status: (typeof schema.deliveries.$inferInsert)["status"], error?: string) {
  const db = await getDb();
  await db.update(schema.deliveries).set({ status, error: error ?? null }).where(eq(schema.deliveries.id, id));
}

export function toDigestItem(a: Alert, lang: "en" | "hi", owner: boolean, userId: string): DigestItem {
  const base = appUrl();
  return {
    title: safeText(lang === "hi" ? a.titleHi : a.titleEn, "", "digest title"),
    body: safeText(lang === "hi" ? a.bodyHi : a.bodyEn, "", "digest body"),
    severity: a.severity,
    simulated: a.isSimulated,
    link: `${base}/alerts/${a.id}`,
    ...(owner ? { usefulUrl: `${base}/r/${signLink({ a: "rate", alert: a.id, user: userId, r: "up" })}`, notUsefulUrl: `${base}/r/${signLink({ a: "rate", alert: a.id, user: userId, r: "down" })}` } : {}),
  };
}

/**
 * Sends today's digests for one user: routes every new alert (H6), groups by recipient and
 * portfolio, and sends one email per group. Idempotent through the deliveries table.
 */
export async function deliverForUser(user: User, alerts: Alert[], tradeDate: string) {
  if (!alerts.length) return { sent: 0, skipped: 0 };
  const db = await getDb();
  const settings = await getSettings(user.id);
  const portfolios = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, user.id));
  const recs = await db.select().from(schema.recipients).where(eq(schema.recipients.userId, user.id));
  const groups = new Map<string, { email: string; language: "en" | "hi"; audience: "owner" | "family"; portfolioName: string; alerts: Alert[]; recipientId?: string }>();
  for (const a of alerts) {
    const p = portfolios.find((x) => x.id === a.portfolioId);
    const targets = route({
      kind: "alert",
      severity: a.severity,
      simulated: a.isSimulated,
      owner: { email: user.email, emailVerified: !!user.emailVerifiedAt, isDemo: user.isDemo, emailDigest: settings.emailDigest, quietMode: settings.quietMode, language: user.uiLanguage },
      portfolio: { alertsEnabled: p?.alertsEnabled ?? true, language: p?.language ?? "en" },
      recipients: recs.filter((r) => r.portfolioId === a.portfolioId).map((r) => ({ email: r.email, confirmed: !!r.confirmedAt, unsubscribed: !!r.unsubscribedAt })),
    });
    for (const t of targets) {
      if (t.channel !== "email") continue;
      const key = `${t.email}|${p?.id ?? "account"}|${t.language}`;
      const g = groups.get(key) ?? { email: t.email, language: t.language, audience: t.audience, portfolioName: p ? (p.ownerLabel ? `${p.ownerLabel}'s portfolio` : p.name) : "your account", alerts: [], recipientId: recs.find((r) => r.email === t.email && r.portfolioId === p?.id)?.id };
      g.alerts.push(a);
      groups.set(key, g);
    }
  }
  let sent = 0, skipped = 0;
  for (const g of groups.values()) {
    const itemKey = `digest:${tradeDate}:${g.portfolioName}:${g.language}`;
    const id = await claim(user.id, "digest", itemKey, g.email, g.alerts.map((a) => a.id));
    if (!id) continue;
    if ((await emailsSentToday()) >= EMAIL_DAILY_CAP) {
      await finish(id, "skipped_cap");
      skipped++;
      continue;
    }
    const unsub = g.audience === "family" && g.recipientId ? signLink({ a: "unsub", rec: g.recipientId }, 365) : signLink({ a: "unsub-owner", user: user.id }, 365);
    const mail = digestEmail({
      lang: g.language,
      portfolioName: g.portfolioName,
      items: g.alerts.map((a) => toDigestItem(a, g.language, g.audience === "owner", user.id)),
      appLink: `${appUrl()}/alerts`,
      unsubscribeUrl: `${appUrl()}/r/${unsub}`,
    });
    const r = await sendMail({ to: g.email, ...mail });
    await finish(id, r.status, r.error);
    if (r.delivered) sent++;
    else skipped++;
  }
  return { sent, skipped };
}
