import "server-only";
import { desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ASSET_META, type AssetClass } from "./instruments/asset-classes";
import { NIFTY } from "./instruments/sectors";

const DAY = 86_400_000;

const pctl = (xs: number[], p: number) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : null;
};
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The screens a "view" event can name, in the order the dashboard lists them. */
export const AREAS = [
  { id: "home", label: "Home" },
  { id: "portfolio", label: "Portfolio" },
  { id: "analysis", label: "Analysis" },
  { id: "ask", label: "Ask" },
  { id: "stock", label: "Stock page" },
  { id: "risk", label: "Risk" },
  { id: "you", label: "You" },
] as const;

/**
 * Product metrics for /insights (admin-only). The product is "see what your money did and
 * understand why", so the numbers are about people who track a portfolio and come back to read it.
 * Shared demo and test accounts are kept out of the product metrics and reported on their own.
 * Computed in memory over 60 days: fine at this scale; at real scale this becomes SQL rollups.
 */
export async function getInsights() {
  const db = await getDb();
  const now = Date.now();
  const since60 = new Date(now - 60 * DAY);
  const [users, events, held, chatFb, usage, runs, nifty] = await Promise.all([
    db.select({ id: schema.users.id, isDemo: schema.users.isDemo, isTest: schema.users.isTestAccount, createdAt: schema.users.createdAt, verified: schema.users.emailVerifiedAt }).from(schema.users),
    db.select().from(schema.events).where(gte(schema.events.createdAt, since60)).limit(200_000),
    db.select({ userId: schema.portfolios.userId, portfolioId: schema.holdings.portfolioId, assetClass: schema.holdings.assetClass, source: schema.holdings.source, createdAt: schema.holdings.createdAt }).from(schema.holdings).innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId)),
    db.select().from(schema.feedback).where(gte(schema.feedback.createdAt, since60)),
    db.select({ cost: schema.usage.costUsd, at: schema.usage.createdAt }).from(schema.usage).where(gte(schema.usage.createdAt, since60)),
    db.select().from(schema.pipelineRuns).orderBy(desc(schema.pipelineRuns.startedAt)).limit(14),
    db.select({ d: schema.symbolSnapshots.tradeDate, at: schema.symbolSnapshots.fetchedAt }).from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.symbol, NIFTY)).orderBy(desc(schema.symbolSnapshots.tradeDate)).limit(1),
  ]);

  const real = new Set(users.filter((u) => !u.isDemo && !u.isTest).map((u) => u.id));
  const isReal = (id: string) => real.has(id);
  const within = (d: Date, from: number, to = 0) => d.getTime() >= now - from * DAY && d.getTime() < now - to * DAY;
  type Ev = (typeof events)[number];
  const P = (e: Ev) => e.props as Record<string, any>;

  const eReal = events.filter((e) => isReal(e.userId));
  const heldReal = held.filter((h) => isReal(h.userId));
  const trackers = new Set(heldReal.map((h) => h.userId));

  // North Star: people who track a portfolio and used Nazar this week.
  const activeIn = (from: number, to = 0) => new Set(eReal.filter((e) => within(e.createdAt, from, to) && trackers.has(e.userId)).map((e) => e.userId)).size;
  const nsm = { value: activeIn(7), prev: activeIn(14, 7) };

  const perUser = [...trackers].map((id) => heldReal.filter((h) => h.userId === id).length);
  const kpis = {
    realUsers: real.size,
    newUsers7: users.filter((u) => isReal(u.id) && within(u.createdAt, 7)).length,
    verifiedRate: ratio(users.filter((u) => isReal(u.id) && u.verified).length, real.size),
    trackers: trackers.size,
    holdings: heldReal.length,
    medianHoldings: pctl(perUser, 50),
    portfolios: new Set(heldReal.map((h) => h.portfolioId)).size,
  };

  // Activation: real users who signed up in the last 30 days, and how far each got.
  const cohort = users.filter((u) => isReal(u.id) && within(u.createdAt, 30));
  const did = (type: string, test: (e: Ev) => boolean = () => true) => new Set(eReal.filter((e) => e.type === type && test(e)).map((e) => e.userId));
  const sawAnalysis = did("view", (e) => P(e).area === "analysis");
  const asked = did("question");
  const funnel = [
    { step: "Signed up", users: cohort.length },
    { step: "Verified email", users: cohort.filter((u) => u.verified).length },
    { step: "Added a holding", users: cohort.filter((u) => trackers.has(u.id)).length },
    { step: "Opened Analysis", users: cohort.filter((u) => sawAnalysis.has(u.id)).length },
    { step: "Asked a question", users: cohort.filter((u) => asked.has(u.id)).length },
  ];

  // Which screens get used: views and distinct people, last 7 days.
  const views7 = eReal.filter((e) => e.type === "view" && within(e.createdAt, 7));
  const areas = AREAS.map((a) => {
    const rows = views7.filter((e) => P(e).area === a.id);
    return { area: a.label, views: rows.length, users: new Set(rows.map((e) => e.userId)).size };
  });
  const periods = [...eReal.filter((e) => e.type === "analysis_period" && within(e.createdAt, 30)).reduce((m, e) => m.set(String(P(e).period), (m.get(String(P(e).period)) ?? 0) + 1), new Map<string, number>())].map(([period, n]) => ({ period, n })).sort((a, b) => b.n - a.n);

  // What people track: holdings and people per asset type, and how holdings got in.
  const classes = [...new Set(heldReal.map((h) => h.assetClass))];
  const assets = classes
    .map((c) => ({ label: ASSET_META[c as AssetClass]?.plural ?? c, holdings: heldReal.filter((h) => h.assetClass === c).length, users: new Set(heldReal.filter((h) => h.assetClass === c).map((h) => h.userId)).size }))
    .sort((a, b) => b.holdings - a.holdings);
  const SOURCE: Record<string, string> = { manual: "Added by hand", zerodha: "Zerodha file", groww: "Groww file", upstox: "Upstox file", generic: "Other spreadsheet", cas: "Mutual fund statement", screenshot: "Screenshot" };
  const sources = [...new Set(heldReal.map((h) => h.source))].map((s) => ({ label: SOURCE[s] ?? s, holdings: heldReal.filter((h) => h.source === s).length })).sort((a, b) => b.holdings - a.holdings);
  const mix = { multiAsset: ratio([...trackers].filter((id) => new Set(heldReal.filter((h) => h.userId === id).map((h) => h.assetClass)).size >= 2).length, trackers.size), added7: heldReal.filter((h) => within(h.createdAt, 7)).length };

  // Retention: real users active on 2 or more distinct days in the last 14, out of those active at all.
  const days = new Map<string, Set<string>>();
  for (const e of eReal.filter((x) => within(x.createdAt, 14))) (days.get(e.userId) ?? days.set(e.userId, new Set()).get(e.userId)!).add(dayKey(e.createdAt));
  const returning = [...days.values()].filter((s) => s.size >= 2).length;
  const retention = { active14: days.size, returning14: returning, rate: ratio(returning, days.size) };

  // Ask
  const q7 = events.filter((e) => e.type === "question" && within(e.createdAt, 7));
  const b7 = events.filter((e) => e.type === "guard_block" && within(e.createdAt, 7));
  const fb7 = chatFb.filter((f) => within(f.createdAt, 7));
  const ask = {
    questions7: q7.length,
    askers7: new Set(q7.map((e) => e.userId)).size,
    helpfulRate7: ratio(fb7.filter((f) => f.rating === "up").length, fb7.length),
    ratings7: fb7.length,
    blockRate7: ratio(b7.length, b7.length + q7.length),
    p50Latency: pctl(q7.map((e) => Number(P(e).latencyMs)), 50),
    p95Latency: pctl(q7.map((e) => Number(P(e).latencyMs)), 95),
    costPerAnswer7: ratio(q7.reduce((a, e) => a + (Number(P(e).costUsd) || 0), 0), q7.length),
    spend7: usage.filter((u) => within(u.at, 7)).reduce((a, u) => a + u.cost, 0),
    spend30: usage.filter((u) => within(u.at, 30)).reduce((a, u) => a + u.cost, 0),
    portfolioToolShare: ratio(q7.filter((e) => (P(e).tools ?? []).includes("getMyPortfolio")).length, q7.length),
    errors7: events.filter((e) => e.type === "answer_error" && within(e.createdAt, 7)).length,
  };

  // The shared demo, separate from the product metrics.
  const eDemo = events.filter((e) => !isReal(e.userId) && within(e.createdAt, 30));
  const demo = {
    signIns: eDemo.filter((e) => e.type === "signed_in").length,
    views: eDemo.filter((e) => e.type === "view").length,
    analysisViews: eDemo.filter((e) => e.type === "view" && P(e).area === "analysis").length,
    questions: eDemo.filter((e) => e.type === "question").length,
  };

  // Data health: is the market data current, and did the last checkups finish?
  const lastNightly = runs.find((r) => r.kind === "nightly" && r.status !== "running");
  const s = (lastNightly?.stats ?? {}) as Record<string, any>;
  const data = {
    latestSession: nifty[0]?.d ?? null,
    fetchedAt: nifty[0]?.at?.toISOString() ?? null,
    symbols: typeof s.universeSize === "number" ? s.universeSize : Array.isArray(s.universe) ? s.universe.length : null,
    failed: typeof s.failed === "number" ? s.failed : null,
    stale: Array.isArray(s.stale) ? (s.stale as string[]).slice(0, 8) : [],
  };

  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = dayKey(new Date(now - (13 - i) * DAY));
    const of = eReal.filter((e) => dayKey(e.createdAt) === d);
    return { day: d.slice(5), active: new Set(of.map((e) => e.userId)).size, questions: of.filter((e) => e.type === "question").length, signups: users.filter((u) => isReal(u.id) && dayKey(u.createdAt) === d).length };
  });

  return {
    generatedAt: new Date().toISOString(),
    nsm,
    kpis,
    funnel,
    areas,
    periods,
    assets,
    sources,
    mix,
    retention,
    ask,
    demo,
    data,
    runs: runs.map((r) => ({ kind: r.kind, runDate: r.runDate, stage: r.stage, status: r.status, stats: r.stats, errors: r.errors.length })),
    daily,
  };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;
