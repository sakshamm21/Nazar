import "server-only";
import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { AlertType, Sensitivity } from "@/lib/db/schema";
import { notFound } from "@/lib/errors";
import { track } from "@/lib/events";
import { learnedText } from "@/lib/alerts/templates";
import type { UserThresholds } from "@/lib/alerts/thresholds";

export type AlertRow = typeof schema.alertEvents.$inferSelect;

export async function listAlerts(userId: string, opts: { portfolioId?: string | null; limit?: number; includeSimulated?: boolean } = {}) {
  const db = await getDb();
  const rows = await db
    .select({ a: schema.alertEvents, rating: schema.alertFeedback.rating })
    .from(schema.alertEvents)
    .leftJoin(schema.alertFeedback, and(eq(schema.alertFeedback.alertId, schema.alertEvents.id), eq(schema.alertFeedback.userId, userId)))
    .where(and(eq(schema.alertEvents.userId, userId), ...(opts.portfolioId ? [eq(schema.alertEvents.portfolioId, opts.portfolioId)] : []), ...(opts.includeSimulated === false ? [eq(schema.alertEvents.isSimulated, false)] : [])))
    .orderBy(desc(schema.alertEvents.tradeDate), desc(schema.alertEvents.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({ ...r.a, rating: r.rating ?? null }));
}

export async function getAlert(userId: string, alertId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ a: schema.alertEvents, rating: schema.alertFeedback.rating })
    .from(schema.alertEvents)
    .leftJoin(schema.alertFeedback, and(eq(schema.alertFeedback.alertId, schema.alertEvents.id), eq(schema.alertFeedback.userId, userId)))
    .where(and(eq(schema.alertEvents.id, alertId), eq(schema.alertEvents.userId, userId)))
    .limit(1);
  if (!r) throw notFound("Alert not found.");
  return { ...r.a, rating: r.rating ?? null };
}

export async function unreadCount(userId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, userId), isNull(schema.alertEvents.readAt)));
  return Number(r?.n ?? 0);
}

export async function markRead(userId: string, ids: string[] | "all") {
  const db = await getDb();
  await db
    .update(schema.alertEvents)
    .set({ readAt: new Date() })
    .where(and(eq(schema.alertEvents.userId, userId), isNull(schema.alertEvents.readAt), ...(ids === "all" ? [] : [inArray(schema.alertEvents.id, ids.length ? ids : ["-"])])));
}

/** 👍/👎 on an alert (null clears). Feeds H5 and the North Star. */
export async function rateAlert(userId: string, alertId: string, rating: "up" | "down" | null, source: "app" | "email" = "app") {
  const a = await getAlert(userId, alertId);
  const db = await getDb();
  if (rating === null) {
    await db.delete(schema.alertFeedback).where(and(eq(schema.alertFeedback.alertId, a.id), eq(schema.alertFeedback.userId, userId)));
    return;
  }
  await db
    .insert(schema.alertFeedback)
    .values({ alertId: a.id, userId, rating, source })
    .onConflictDoUpdate({ target: [schema.alertFeedback.alertId, schema.alertFeedback.userId], set: { rating, source, createdAt: new Date() } });
  track(userId, "alert_rated", { rating, type: a.type, source, simulated: a.isSimulated, severity: a.severity });
}

/* ------------------------------------------------------------------ */
/* Settings and learned thresholds (H5)                                */
/* ------------------------------------------------------------------ */

export async function getSettings(userId: string) {
  const db = await getDb();
  const [s] = await db.select().from(schema.alertSettings).where(eq(schema.alertSettings.userId, userId)).limit(1);
  return s ?? { userId, sensitivity: "balanced" as Sensitivity, quietMode: false, emailDigest: true, updatedAt: new Date() };
}

export async function updateSettings(userId: string, patch: Partial<{ sensitivity: Sensitivity; quietMode: boolean; emailDigest: boolean }>) {
  const db = await getDb();
  const cur = await getSettings(userId);
  const next = { userId, sensitivity: patch.sensitivity ?? cur.sensitivity, quietMode: patch.quietMode ?? cur.quietMode, emailDigest: patch.emailDigest ?? cur.emailDigest, updatedAt: new Date() };
  await db.insert(schema.alertSettings).values(next).onConflictDoUpdate({ target: schema.alertSettings.userId, set: next });
  track(userId, "settings_changed", { sensitivity: next.sensitivity, quietMode: next.quietMode, emailDigest: next.emailDigest });
  return next;
}

export async function getThresholds(userId: string): Promise<UserThresholds> {
  const db = await getDb();
  const rows = await db.select().from(schema.alertThresholds).where(eq(schema.alertThresholds.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.alertType, { value: r.value, muted: r.muted }]));
}

export async function listThresholdChanges(userId: string) {
  const db = await getDb();
  return db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.userId, userId)).orderBy(desc(schema.thresholdChanges.createdAt)).limit(20);
}

/** Applies an H5 decision: stores the threshold, logs the change, and posts the inbox message. */
export async function applyTuning(userId: string, d: { type: AlertType; oldValue: number | null; newValue: number | null; muted: boolean; evidence: (typeof schema.thresholdChanges.$inferInsert)["evidence"] }, tradeDate: string, at = new Date()) {
  const db = await getDb();
  const text = learnedText({ type: d.type as "stock_move", value: d.newValue, muted: d.muted });
  const changeId = randomUUID();
  await db.insert(schema.thresholdChanges).values({ id: changeId, userId, alertType: d.type, oldValue: d.oldValue, newValue: d.newValue, muted: d.muted, evidence: d.evidence, messageEn: text.en, messageHi: text.hi, createdAt: at });
  await db
    .insert(schema.alertThresholds)
    .values({ userId, alertType: d.type, value: d.newValue, muted: d.muted, source: "tuned", updatedAt: at })
    .onConflictDoUpdate({ target: [schema.alertThresholds.userId, schema.alertThresholds.alertType], set: { value: d.newValue, muted: d.muted, source: "tuned", updatedAt: at } });
  await db
    .insert(schema.alertEvents)
    .values({ id: randomUUID(), userId, portfolioId: null, type: "learned", symbol: null, severity: "info", tradeDate, dedupeKey: `learned:${changeId}`, titleEn: text.title.en, bodyEn: text.en, titleHi: text.title.hi, bodyHi: text.hi, data: { thresholdChangeId: changeId, alertType: d.type, newValue: d.newValue, oldValue: d.oldValue, muted: d.muted, evidence: d.evidence }, createdAt: at })
    .onConflictDoNothing();
  track(userId, "threshold_tuned", { type: d.type, from: d.oldValue, to: d.newValue, muted: d.muted });
  return changeId;
}

/** Undo: restore the previous value and stop auto-tuning this type for 30 days. */
export async function undoTuning(userId: string, changeId: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.thresholdChanges).where(and(eq(schema.thresholdChanges.id, changeId), eq(schema.thresholdChanges.userId, userId))).limit(1);
  if (!c) throw notFound("Change not found.");
  if (c.undoneAt) return c;
  const frozenUntil = new Date(Date.now() + 30 * 86400000);
  await db.update(schema.thresholdChanges).set({ undoneAt: new Date() }).where(eq(schema.thresholdChanges.id, c.id));
  await db
    .insert(schema.alertThresholds)
    .values({ userId, alertType: c.alertType, value: c.oldValue, muted: false, source: "manual", frozenUntil, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.alertThresholds.userId, schema.alertThresholds.alertType], set: { value: c.oldValue, muted: false, source: "manual", frozenUntil, updatedAt: new Date() } });
  track(userId, "threshold_undone", { type: c.alertType });
  return { ...c, undoneAt: new Date() };
}

/** Rated alerts of one type for the tuner, with magnitudes. */
export async function ratedAlerts(userId: string, type: AlertType, since: Date) {
  const db = await getDb();
  const rows = await db
    .select({ data: schema.alertEvents.data, rating: schema.alertFeedback.rating, createdAt: schema.alertFeedback.createdAt, simulated: schema.alertEvents.isSimulated })
    .from(schema.alertFeedback)
    .innerJoin(schema.alertEvents, eq(schema.alertEvents.id, schema.alertFeedback.alertId))
    .where(and(eq(schema.alertFeedback.userId, userId), eq(schema.alertEvents.type, type), gte(schema.alertFeedback.createdAt, since)));
  return rows.filter((r) => !r.simulated).map((r) => ({ magnitude: typeof r.data?.magnitude === "number" ? r.data.magnitude : null, useful: r.rating === "up", createdAt: r.createdAt }));
}
