import "server-only";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { appUrl } from "@/lib/auth/service";
import { signLink } from "@/lib/auth/links";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { istDate } from "@/lib/data/provider";
import { sendMail } from "@/lib/email/mailer";
import { emails } from "@/lib/email/templates";
import { track } from "@/lib/events";
import { isAdviceFree } from "@/lib/guard";
import { logger } from "@/lib/logger";
import { explain } from "@/lib/portfolio/performance";
import { ALL, buildPortfolioView } from "@/lib/views/portfolio";

/**
 * The weekly summary email: off unless the person switches it on, sent on Saturday (India time)
 * after the week's last session, once per person per week. The words are the Analysis screen's own
 * tested sentences for the week, checked by the advice guard before anything is sent.
 */
export const weekKey = (d: Date) => istDate(new Date(d.getTime() - ((new Date(d.getTime() + 5.5 * 3600_000).getUTCDay() + 1) % 7) * 86_400_000));

export async function weeklySummaryFor(user: typeof schema.users.$inferSelect) {
  const v = await buildPortfolioView(user, ALL);
  if (v.empty) return null;
  const a = v.performance.periods["1W"];
  if (!a) return null;
  const e = explain(a);
  const lines = [e.what, ...e.why.slice(0, 3), ...e.how.slice(0, 1)].filter((l) => isAdviceFree(l));
  return { headline: e.headline, lines };
}

export async function sendWeeklySummaries(db: DB, now = new Date(), deadline = Date.now() + 60_000) {
  if (new Date(now.getTime() + 5.5 * 3600_000).getUTCDay() !== 6) return { sent: 0, reason: "not Saturday" };
  const week = weekKey(now);
  const users = await db
    .select()
    .from(schema.users)
    .where(and(sql`${schema.users.prefs}->>'weeklyEmail' = 'true'`, isNotNull(schema.users.emailVerifiedAt), eq(schema.users.isDemo, false), eq(schema.users.isTestAccount, false)));
  let sent = 0;
  for (const u of users) {
    if (Date.now() > deadline) break;
    const [done] = await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.userId, u.id), eq(schema.events.type, "weekly_email"), gte(schema.events.createdAt, new Date(now.getTime() - 6 * 86_400_000)))).limit(1);
    if (done) continue;
    try {
      const s = await weeklySummaryFor(u);
      if (!s) continue;
      const unsubscribe = `${appUrl()}/api/email/unsubscribe?token=${encodeURIComponent(signLink({ a: "unsub-owner", user: u.id }, 120))}`;
      const mail = emails.weeklySummary({ name: u.name.split(" ")[0], headline: s.headline, lines: s.lines, url: `${appUrl()}/analysis`, unsubscribe });
      const r = await sendMail({ to: u.email, ...mail });
      track(u.id, "weekly_email", { week, status: r.status });
      if (r.delivered) sent++;
    } catch (e) {
      logger.warn({ user: u.id, err: String((e as Error)?.message ?? e).slice(0, 200) }, "weekly summary failed");
    }
  }
  return { sent, week };
}
