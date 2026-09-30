import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { gte, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

const DAY = 86_400_000;

const pctl = (xs: number[], p: number) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const countBy = <T,>(xs: T[], key: (x: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const x of xs) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
};

/**
 * Product metrics computed from the events/feedback tables.
 * Computed in memory over the last 30 days — fine at portfolio scale; at real scale this
 * becomes SQL rollups or a warehouse (PostHog / BigQuery).
 */
export async function getInsights() {
  const db = await getDb();
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const [events, fb, usage, watch, alertsActive, chats] = await Promise.all([
    db.select().from(schema.events).where(gte(schema.events.createdAt, since30)).limit(100_000),
    db.select().from(schema.feedback).where(gte(schema.feedback.createdAt, since30)),
    db.select({ cost: schema.usage.costUsd, at: schema.usage.createdAt }).from(schema.usage).where(gte(schema.usage.createdAt, since30)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.watchlist),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.alerts).where(isNull(schema.alerts.triggeredAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.chats),
  ]);

  const inWindow = (d: Date, fromDaysAgo: number, toDaysAgo = 0) => d.getTime() >= now - fromDaysAgo * DAY && d.getTime() < now - toDaysAgo * DAY;
  const of = (type: string) => events.filter((e) => e.type === type);
  const questions = of("question");
  const q7 = questions.filter((e) => inWindow(e.createdAt, 7));
  const qPrev = questions.filter((e) => inWindow(e.createdAt, 14, 7));
  const blocks = of("guard_block");
  const b7 = blocks.filter((e) => inWindow(e.createdAt, 7));
  const P = (e: (typeof events)[number]) => e.props as any;
  const dataBacked = (e: (typeof events)[number]) => (P(e).tools?.length ?? 0) > 0;

  // North Star: Weekly Active Researchers — users who got ≥1 data-backed answer in the last 7 days.
  const war = new Set(q7.filter(dataBacked).map((e) => e.userId)).size;
  const warPrev = new Set(qPrev.filter(dataBacked).map((e) => e.userId)).size;

  const fb7 = fb.filter((f) => inWindow(f.createdAt, 7));
  const up7 = fb7.filter((f) => f.rating === "up").length;
  const down7 = fb7.filter((f) => f.rating === "down").length;

  const lat = q7.map((e) => Number(P(e).latencyMs));
  const ttft = q7.map((e) => Number(P(e).ttftMs)).filter((x) => x > 0);
  const guardMs = [...q7, ...b7].map((e) => Number(P(e).guardMs)).filter((x) => x > 0);
  const toolCalls = q7.reduce((a, e) => a + (P(e).tools?.length ?? 0), 0);
  const toolErrors = q7.reduce((a, e) => a + (Number(P(e).toolErrors) || 0), 0);
  const spend7 = usage.filter((u) => inWindow(u.at, 7)).reduce((a, u) => a + u.cost, 0);

  // Daily series (last 14 days)
  const days: { day: string; questions: number; blocked: number; users: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayKey(new Date(now - i * DAY));
    const qs = questions.filter((e) => dayKey(e.createdAt) === d);
    const bs = blocks.filter((e) => dayKey(e.createdAt) === d);
    const users = new Set(events.filter((e) => dayKey(e.createdAt) === d).map((e) => e.userId));
    days.push({ day: d.slice(5), questions: qs.length, blocked: bs.length, users: users.size });
  }

  // Funnel (30 days, users)
  const usersWith = (pred: (e: (typeof events)[number]) => boolean) => new Set(events.filter(pred).map((e) => e.userId));
  const opened = usersWith((e) => e.type === "app_open");
  const asked = usersWith((e) => e.type === "question" || e.type === "guard_block");
  const answered = usersWith((e) => e.type === "question" && dataBacked(e));
  const perUserQ = countBy(questions, (e) => e.userId);
  const threePlus = new Set(perUserQ.filter((x) => x.value >= 3).map((x) => x.name));
  const daysPerUser = new Map<string, Set<string>>();
  for (const e of questions) (daysPerUser.get(e.userId) ?? daysPerUser.set(e.userId, new Set()).get(e.userId)!).add(dayKey(e.createdAt));
  const returned = new Set([...daysPerUser.entries()].filter(([, s]) => s.size >= 2).map(([u]) => u));
  const top = Math.max(opened.size, asked.size);
  const funnel = [
    { step: "Opened the app", users: top },
    { step: "Asked a question", users: asked.size },
    { step: "Got a data-backed answer", users: answered.size },
    { step: "Asked 3+ questions", users: threePlus.size },
    { step: "Came back another day", users: returned.size },
  ];

  const answeredQ = questions.length;
  const suggestionClicks = of("suggestion_click").length;

  return {
    generatedAt: new Date().toISOString(),
    nsm: { value: war, prev: warPrev },
    kpis: {
      questions7: q7.length,
      questionsPrev: qPrev.length,
      blockRate7: ratio(b7.length, b7.length + q7.length),
      helpfulRate7: ratio(up7, up7 + down7),
      ratings7: up7 + down7,
      feedbackCoverage7: ratio(fb7.length, q7.length),
      costPerAnswer7: ratio(q7.reduce((a, e) => a + (Number(P(e).costUsd) || 0), 0), q7.length),
      spend7,
      p50Latency: pctl(lat, 50),
      p95Latency: pctl(lat, 95),
      p50Ttft: pctl(ttft, 50),
      p50Guard: pctl(guardMs, 50),
      toolErrorRate7: ratio(toolErrors, toolCalls),
      answerErrors7: of("answer_error").filter((e) => inWindow(e.createdAt, 7)).length,
      rateLimited7: of("rate_limited").filter((e) => inWindow(e.createdAt, 7)).length,
      returningRate: ratio(returned.size, daysPerUser.size),
      avgQuestionsPerUser: ratio(answeredQ, perUserQ.length),
    },
    days,
    funnel,
    tools: countBy(questions.flatMap((e) => (P(e).tools ?? []) as string[]), (t) => t).slice(0, 12),
    models: countBy(questions, (e) => P(e).model),
    autoShare: ratio(questions.filter((e) => P(e).auto).length, questions.length),
    modes: countBy(questions, (e) => P(e).mode ?? "simple"),
    helpfulByMode: ["simple", "pro"].map((m) => {
      const r = fb.filter((f) => (f.mode ?? "simple") === m);
      return { mode: m, up: r.filter((f) => f.rating === "up").length, down: r.filter((f) => f.rating === "down").length };
    }),
    markets: countBy(questions, (e) => P(e).market),
    languages: countBy(questions, (e) => P(e).lang ?? "en"),
    tickers: countBy(questions.flatMap((e) => (P(e).tickers ?? []) as string[]), (t) => t).slice(0, 10),
    blockedTopics: countBy(blocks, (e) => String(P(e).topic ?? "").toLowerCase()).slice(0, 10),
    blockVerdicts: countBy(blocks, (e) => P(e).verdict),
    downReasons: countBy(fb.filter((f) => f.rating === "down"), (f) => f.reason ?? "no reason"),
    engagement: [
      { name: "Suggestion clicks", value: suggestionClicks },
      { name: "Sources panel opened", value: of("sources_opened").length },
      { name: "Share links created", value: of("share_created").length },
      { name: "PDF exports", value: of("export_pdf").length },
      { name: "Watchlist adds", value: of("watchlist_add").length },
      { name: "Alerts created", value: of("alert_created").length },
      { name: "Alerts triggered", value: of("alert_triggered").length },
    ],
    suggestionCtr: ratio(suggestionClicks, answeredQ),
    totals: { chats: Number(chats[0]?.n ?? 0), watchlistItems: Number(watch[0]?.n ?? 0), activeAlerts: Number(alertsActive[0]?.n ?? 0), events: events.length },
  };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;
