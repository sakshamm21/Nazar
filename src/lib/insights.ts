import "server-only";
import { desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "./db";

const DAY = 86_400_000;

const pctl = (xs: number[], p: number) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : null;
};
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Product metrics for /insights (admin-only). Demo visitors and test accounts are excluded from
 * product metrics and reported separately. Computed in memory over 60 days — fine at portfolio
 * scale; at real scale this becomes SQL rollups or a warehouse.
 */
export async function getInsights() {
  const db = await getDb();
  const now = Date.now();
  const since60 = new Date(now - 60 * DAY);
  const [users, events, alerts, ratings, changes, deliveries, runs, chatFb, usage, holdings, recipients, settings] = await Promise.all([
    db.select({ id: schema.users.id, isDemo: schema.users.isDemo, isTest: schema.users.isTestAccount, createdAt: schema.users.createdAt, verified: schema.users.emailVerifiedAt }).from(schema.users),
    db.select().from(schema.events).where(gte(schema.events.createdAt, since60)).limit(200_000),
    db.select({ id: schema.alertEvents.id, userId: schema.alertEvents.userId, type: schema.alertEvents.type, createdAt: schema.alertEvents.createdAt, simulated: schema.alertEvents.isSimulated }).from(schema.alertEvents).where(gte(schema.alertEvents.createdAt, since60)),
    db.select({ alertId: schema.alertFeedback.alertId, userId: schema.alertFeedback.userId, rating: schema.alertFeedback.rating, source: schema.alertFeedback.source, createdAt: schema.alertFeedback.createdAt, type: schema.alertEvents.type }).from(schema.alertFeedback).innerJoin(schema.alertEvents, eq(schema.alertEvents.id, schema.alertFeedback.alertId)).where(gte(schema.alertFeedback.createdAt, since60)),
    db.select().from(schema.thresholdChanges),
    db.select({ status: schema.deliveries.status, kind: schema.deliveries.kind, createdAt: schema.deliveries.createdAt }).from(schema.deliveries).where(gte(schema.deliveries.createdAt, new Date(now - 7 * DAY))),
    db.select().from(schema.pipelineRuns).orderBy(desc(schema.pipelineRuns.startedAt)).limit(14),
    db.select().from(schema.feedback).where(gte(schema.feedback.createdAt, since60)),
    db.select({ cost: schema.usage.costUsd, at: schema.usage.createdAt }).from(schema.usage).where(gte(schema.usage.createdAt, since60)),
    db.selectDistinct({ userId: schema.portfolios.userId }).from(schema.holdings).innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId)),
    db.select({ confirmedAt: schema.recipients.confirmedAt, userId: schema.recipients.userId }).from(schema.recipients),
    db.select().from(schema.alertSettings),
  ]);

  const real = new Set(users.filter((u) => !u.isDemo && !u.isTest).map((u) => u.id));
  const isReal = (id: string) => real.has(id);
  const within = (d: Date, from: number, to = 0) => d.getTime() >= now - from * DAY && d.getTime() < now - to * DAY;

  // North Star: Weekly Useful-Alert Users — real users who rated ≥1 alert useful in the last 7 days.
  const rReal = ratings.filter((r) => isReal(r.userId));
  const nsm = new Set(rReal.filter((r) => r.rating === "up" && within(r.createdAt, 7)).map((r) => r.userId)).size;
  const nsmPrev = new Set(rReal.filter((r) => r.rating === "up" && within(r.createdAt, 14, 7)).map((r) => r.userId)).size;

  const aReal = alerts.filter((a) => isReal(a.userId) && !a.simulated);
  const a7 = aReal.filter((a) => within(a.createdAt, 7));
  const r30 = rReal.filter((r) => within(r.createdAt, 30));
  const usefulRate30 = ratio(r30.filter((r) => r.rating === "up").length, r30.length);
  const types = [...new Set(r30.map((r) => r.type))];
  const byType = types.map((t) => {
    const rs = r30.filter((r) => r.type === t);
    return { type: t, useful: rs.filter((r) => r.rating === "up").length, total: rs.length, rate: ratio(rs.filter((r) => r.rating === "up").length, rs.length) };
  });
  const usersWithPortfolio = new Set(holdings.map((h) => h.userId).filter(isReal));
  const alertsPerUserWeek = ratio(a7.length, usersWithPortfolio.size);

  // H5: tuning events, undo rate, usefulness of that type 30 days before vs after each change.
  const cReal = changes.filter((c) => isReal(c.userId));
  const tuning = {
    events30: cReal.filter((c) => within(c.createdAt, 30)).length,
    undoRate: ratio(cReal.filter((c) => c.undoneAt).length, cReal.length),
    beforeAfter: cReal.slice(0, 20).map((c) => {
      const t = c.createdAt.getTime();
      const of = rReal.filter((r) => r.userId === c.userId && r.type === c.alertType);
      const before = of.filter((r) => r.createdAt.getTime() < t && r.createdAt.getTime() >= t - 30 * DAY);
      const after = of.filter((r) => r.createdAt.getTime() > t && r.createdAt.getTime() <= t + 30 * DAY);
      return { type: c.alertType, from: c.oldValue, to: c.newValue, before: ratio(before.filter((r) => r.rating === "up").length, before.length), after: ratio(after.filter((r) => r.rating === "up").length, after.length), undone: Boolean(c.undoneAt) };
    }),
  };

  // Activation funnel: real users created in the last 30 days.
  const cohort = users.filter((u) => isReal(u.id) && within(u.createdAt, 30));
  const alerted = new Set(aReal.map((a) => a.userId));
  const rated = new Set(rReal.map((r) => r.userId));
  const funnel = [
    { step: "Signed up", users: cohort.length },
    { step: "Verified email", users: cohort.filter((u) => u.verified).length },
    { step: "Added a portfolio", users: cohort.filter((u) => usersWithPortfolio.has(u.id)).length },
    { step: "Received a first alert", users: cohort.filter((u) => alerted.has(u.id)).length },
    { step: "Rated an alert", users: cohort.filter((u) => rated.has(u.id)).length },
  ];

  // Channels: email digest on, family recipients confirmed.
  const realSettings = settings.filter((s) => isReal(s.userId));
  const emailOn = realSettings.filter((s) => s.emailDigest).length;
  const recReal = recipients.filter((r) => isReal(r.userId));
  const channels = { emailDigestRate: ratio(emailOn, usersWithPortfolio.size), familyRecipients: recReal.length, familyConfirmed: recReal.filter((r) => r.confirmedAt).length, emailRatings: rReal.filter((r) => r.source === "email").length };

  // Retention: real users active on ≥2 distinct days in the last 14 days / active in the last 14 days.
  const eReal = events.filter((e) => isReal(e.userId));
  const days = new Map<string, Set<string>>();
  for (const e of eReal.filter((x) => within(x.createdAt, 14))) (days.get(e.userId) ?? days.set(e.userId, new Set()).get(e.userId)!).add(dayKey(e.createdAt));
  const retention = { active14: days.size, returning14: [...days.values()].filter((s) => s.size >= 2).length, rate: ratio([...days.values()].filter((s) => s.size >= 2).length, days.size) };

  // Delivery and pipeline health
  const delivery = ["sent", "failed", "skipped_no_config", "skipped_cap"].map((s) => ({ status: s, n: deliveries.filter((d) => d.status === s).length }));

  // Demo engagement (separate from product metrics)
  const evOf = (t: string) => events.filter((e) => e.type === t && within(e.createdAt, 30));
  const demo = { started: evOf("demo_started").length, simulated: evOf("simulate").length, tourCompleted: evOf("tour_complete").length, tourSkipped: evOf("tour_skip").length, askQuestions: events.filter((e) => e.type === "question" && !isReal(e.userId) && within(e.createdAt, 30)).length };

  // Secondary: Ask (v1 chat metrics)
  const q7 = events.filter((e) => e.type === "question" && within(e.createdAt, 7));
  const b7 = events.filter((e) => e.type === "guard_block" && within(e.createdAt, 7));
  const P = (e: (typeof events)[number]) => e.props as Record<string, any>;
  const fb7 = chatFb.filter((f) => within(f.createdAt, 7));
  const ask = {
    questions7: q7.length,
    askers7: new Set(q7.map((e) => e.userId)).size,
    helpfulRate7: ratio(fb7.filter((f) => f.rating === "up").length, fb7.length),
    blockRate7: ratio(b7.length, b7.length + q7.length),
    p50Latency: pctl(q7.map((e) => Number(P(e).latencyMs)), 50),
    p95Latency: pctl(q7.map((e) => Number(P(e).latencyMs)), 95),
    costPerAnswer7: ratio(q7.reduce((a, e) => a + (Number(P(e).costUsd) || 0), 0), q7.length),
    spend7: usage.filter((u) => within(u.at, 7)).reduce((a, u) => a + u.cost, 0),
    portfolioToolShare: ratio(q7.filter((e) => (P(e).tools ?? []).includes("getMyPortfolio")).length, q7.length),
  };

  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = dayKey(new Date(now - (13 - i) * DAY));
    return { day: d.slice(5), alerts: aReal.filter((a) => dayKey(a.createdAt) === d).length, useful: rReal.filter((r) => r.rating === "up" && dayKey(r.createdAt) === d).length, notUseful: rReal.filter((r) => r.rating === "down" && dayKey(r.createdAt) === d).length };
  });

  return {
    generatedAt: new Date().toISOString(),
    nsm: { value: nsm, prev: nsmPrev },
    kpis: { usefulRate30, ratings30: r30.length, alerts7: a7.length, alertsPerUserWeek, usersWithPortfolio: usersWithPortfolio.size, realUsers: real.size },
    byType,
    tuning,
    funnel,
    channels,
    retention,
    delivery,
    runs: runs.map((r) => ({ kind: r.kind, runDate: r.runDate, stage: r.stage, status: r.status, stats: r.stats, errors: r.errors.length })),
    demo,
    ask,
    daily,
  };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;
