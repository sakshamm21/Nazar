import "server-only";
import { randomUUID } from "crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/alerts/routing";
import { quarterName, resultsPoints, resultsText } from "@/lib/alerts/templates";
import { signLink } from "@/lib/auth/links";
import { appUrl } from "@/lib/auth/service";
import { reportEmail } from "@/lib/email/templates";
import { EMAIL_DAILY_CAP, sendMail } from "@/lib/email/mailer";
import { NIFTY } from "@/lib/instruments/sectors";
import { displayName } from "@/lib/market/portfolio-day";
import { instrumentsFor, priceHistory, shiftDate, snapshotsAsOf } from "@/lib/market/store";
import { emailsSentToday } from "@/lib/pipeline/deliver";
import { getSettings } from "@/lib/repo/alerts";
import { buildWeekly, type WeeklyContent } from "./weekly";

type User = typeof schema.users.$inferSelect;
type Portfolio = typeof schema.portfolios.$inferSelect;

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return shiftDate(iso, -dow);
}

const closeOnOrBefore = (m: Map<string, number> | undefined, date: string) => {
  if (!m) return null;
  let best: number | null = null;
  for (const [d, c] of m) if (d <= date) best = c;
  return best;
};

/** Builds and stores the report for the week ending on `weekEnd` (the last session of the week). */
export async function generateWeekly(user: User, p: Portfolio, weekEnd: string, sources: string[], createdAt?: Date) {
  const db = await getDb();
  const holdings = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, p.id));
  if (!holdings.length) return null;
  const weekStart = mondayOf(weekEnd);
  const baseline = shiftDate(weekStart, -1);
  const symbols = holdings.map((h) => h.symbol);
  const [hist, inst, snaps] = await Promise.all([priceHistory(db, [...symbols, NIFTY], sources, shiftDate(weekStart, -10), weekEnd), instrumentsFor(db, symbols), snapshotsAsOf(db, symbols, weekEnd, sources)]);
  const alerts = await db
    .select()
    .from(schema.alertEvents)
    .where(and(eq(schema.alertEvents.portfolioId, p.id), gte(schema.alertEvents.tradeDate, weekStart), lte(schema.alertEvents.tradeDate, weekEnd), eq(schema.alertEvents.isSimulated, false)));
  const results = await db.select().from(schema.resultsEvents).where(and(inArray(schema.resultsEvents.symbol, symbols), inArray(schema.resultsEvents.source, sources), gte(schema.resultsEvents.detectedOn, weekStart), lte(schema.resultsEvents.detectedOn, weekEnd)));
  const nextWeekEnd = shiftDate(weekEnd, 9);
  const upcoming = [...snaps.values()].filter((s) => s.nextResultsDate && s.nextResultsDate > weekEnd && s.nextResultsDate <= nextWeekEnd).map((s) => ({ name: displayName(s.symbol, inst.get(s.symbol)), date: s.nextResultsDate! }));
  const content: WeeklyContent = buildWeekly({
    portfolioName: p.name,
    ownerLabel: p.ownerLabel,
    weekStart,
    weekEnd,
    holdings: holdings.map((h) => ({ symbol: h.symbol, name: displayName(h.symbol, inst.get(h.symbol)), quantity: h.quantity, startPrice: closeOnOrBefore(hist.get(h.symbol), baseline), endPrice: closeOnOrBefore(hist.get(h.symbol), weekEnd) })),
    niftyStart: closeOnOrBefore(hist.get(NIFTY), baseline),
    niftyEnd: closeOnOrBefore(hist.get(NIFTY), weekEnd),
    alerts: alerts.map((a) => ({ type: a.type, titleEn: a.titleEn, titleHi: a.titleHi })),
    results: results.map((r) => {
      const name = displayName(r.symbol, inst.get(r.symbol));
      const t = resultsText({ name, quarterEnd: r.quarterEnd, points: resultsPoints(r.data.current, r.data.previous, r.data.yearAgo), healthBefore: r.healthBefore, healthAfter: r.healthAfter, annualHealthUpdated: r.data.annualHealthUpdated });
      const q = quarterName(r.quarterEnd);
      return { name, summaryEn: `${name} reported ${q.en} results. ${t.body.en}`, summaryHi: `${name} के ${q.hi} के नतीजे आए। ${t.body.hi}` };
    }),
    upcoming,
  });
  const id = randomUUID();
  await db
    .insert(schema.reports)
    .values({ id, userId: user.id, portfolioId: p.id, weekStart, weekEnd, content: content as unknown as Record<string, unknown>, ...(createdAt ? { createdAt } : {}) })
    .onConflictDoUpdate({ target: [schema.reports.portfolioId, schema.reports.weekStart], set: { weekEnd, content: content as unknown as Record<string, unknown> } });
  const [row] = await db.select().from(schema.reports).where(and(eq(schema.reports.portfolioId, p.id), eq(schema.reports.weekStart, weekStart))).limit(1);
  return row;
}

/** Emails a stored report to the owner (if opted in) and the portfolio's family recipient, in their languages. */
export async function deliverWeekly(user: User, p: Portfolio, report: typeof schema.reports.$inferSelect) {
  const db = await getDb();
  const settings = await getSettings(user.id);
  const recs = await db.select().from(schema.recipients).where(eq(schema.recipients.portfolioId, p.id));
  const content = report.content as unknown as WeeklyContent;
  const targets = route({
    kind: "report",
    owner: { email: user.email, emailVerified: !!user.emailVerifiedAt, isDemo: user.isDemo, emailDigest: settings.emailDigest, quietMode: settings.quietMode, language: user.uiLanguage },
    portfolio: { alertsEnabled: p.alertsEnabled, language: p.language },
    recipients: recs.map((r) => ({ email: r.email, confirmed: !!r.confirmedAt, unsubscribed: !!r.unsubscribedAt })),
  });
  let sent = 0;
  for (const t of targets) {
    if (t.channel !== "email") continue;
    const rows = await db.insert(schema.deliveries).values({ id: randomUUID(), userId: user.id, kind: "report", itemKey: `report:${report.id}:${t.language}`, email: t.email, status: "skipped_no_config" }).onConflictDoNothing().returning({ id: schema.deliveries.id });
    if (!rows[0]) continue;
    if ((await emailsSentToday()) >= EMAIL_DAILY_CAP) {
      await db.update(schema.deliveries).set({ status: "skipped_cap" }).where(eq(schema.deliveries.id, rows[0].id));
      continue;
    }
    const lang = content[t.language];
    const rec = recs.find((r) => r.email === t.email);
    const unsub = t.audience === "family" && rec ? signLink({ a: "unsub", rec: rec.id }, 365) : signLink({ a: "unsub-owner", user: user.id }, 365);
    const mail = reportEmail({ lang: t.language, subject: lang.subject, sections: lang.sections, link: `${appUrl()}/reports/${report.id}`, unsubscribeUrl: `${appUrl()}/r/${unsub}` });
    const r = await sendMail({ to: t.email, ...mail });
    await db.update(schema.deliveries).set({ status: r.status, error: r.error ?? null }).where(eq(schema.deliveries.id, rows[0].id));
    if (r.delivered) sent++;
  }
  return sent;
}
