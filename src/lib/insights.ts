import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ASSET_META, type AssetClass } from "./instruments/asset-classes";
import { NIFTY } from "./instruments/sectors";

const DAY = 86_400_000;

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
/** Postgres `date` and `timestamp` columns come back as strings from PGlite and as Dates from Neon, so take either. */
const dayKey = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

const median = (xs: number[]) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

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
 *
 * Everything is aggregated in SQL rather than in JavaScript: one row per real user for the North
 * Star, funnel, KPIs and retention, and grouped counts for screens, periods, assets and Ask. The
 * volume crossing the wire therefore scales with the number of users, not with the number of
 * events — which is what made the previous 200,000-row scan the one part of the app that would not
 * have survived real growth.
 */
const asRows = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? [])) as T[];

export async function getInsights() {
  const db = await getDb();
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);
  const d60 = ago(60);
  const d30 = ago(30);
  const d14 = ago(14);
  const d7 = ago(7);

  /** One row per real user: who they are, what they hold, and what they have done recently. */
  type Rollup = { id: string; verified: boolean; created_at: Date; holdings: number; asset_classes: number; analysis_views: number; questions: number; active_days: number; active7: number; active_prev7: number };
  const realUsers = asRows<Rollup>(
    await db.execute(sql`
      select u.id,
             (u.email_verified_at is not null)                as verified,
             u.created_at                                   as created_at,
             coalesce(h.holdings, 0)                         as holdings,
             coalesce(h.asset_classes, 0)                    as asset_classes,
             coalesce(v.analysis_views, 0)                   as analysis_views,
             coalesce(v.questions, 0)                        as questions,
             coalesce(v.active_days, 0)                      as active_days,
             coalesce(v.active7, 0)                          as active7,
             coalesce(v.active_prev7, 0)                     as active_prev7
      from users u
      left join (
        select p.user_id, count(*) as holdings, count(distinct h.asset_class) as asset_classes
        from holdings h join portfolios p on p.id = h.portfolio_id
        group by p.user_id
      ) h on h.user_id = u.id
      left join (
        select e.user_id,
               count(*) filter (where e.type = 'view' and e.props->>'area' = 'analysis') as analysis_views,
               count(*) filter (where e.type = 'question')                               as questions,
               count(distinct (e.created_at at time zone 'UTC')::date)
                 filter (where e.created_at >= ${d14})                                     as active_days,
               count(*) filter (where e.created_at >= ${d7})                              as active7,
               count(*) filter (where e.created_at >= ${d14} and e.created_at < ${d7})    as active_prev7
        from events e where e.created_at >= ${d60}
        group by e.user_id
      ) v on v.user_id = u.id
      where u.is_demo = false and u.is_test_account = false
    `),
  );

  const trackers = realUsers.filter((u) => u.holdings > 0);
  /** North Star: people who track a portfolio and used Nazar this week. */
  const nsm = { value: trackers.filter((u) => u.active7 > 0).length, prev: trackers.filter((u) => u.active_prev7 > 0).length };

  const perUser = trackers.map((u) => u.holdings);
  const kpis = {
    realUsers: realUsers.length,
    newUsers7: realUsers.filter((u) => toDate(u.created_at) >= d7).length,
    verifiedRate: ratio(realUsers.filter((u) => u.verified).length, realUsers.length),
    trackers: trackers.length,
    holdings: perUser.reduce((a, b) => a + b, 0),
    medianHoldings: median(perUser),
    portfolios: asRows<{ n: number }>(
      await db.execute(sql`
        select count(distinct p.id) as n
        from portfolios p join users u on u.id = p.user_id
        where u.is_demo = false and u.is_test_account = false
      `),
    )[0]?.n ?? 0,
  };

  // Activation: real users who signed up in the last 30 days, and how far each got.
  const cohort = realUsers.filter((u) => toDate(u.created_at) >= d30);
  const funnel = [
    { step: "Signed up", users: cohort.length },
    { step: "Verified email", users: cohort.filter((u) => u.verified).length },
    { step: "Added a holding", users: cohort.filter((u) => u.holdings > 0).length },
    { step: "Opened Analysis", users: cohort.filter((u) => u.analysis_views > 0).length },
    { step: "Asked a question", users: cohort.filter((u) => u.questions > 0).length },
  ];

  // Retention: real users active on 2 or more distinct days in the last 14, out of those active at all.
  const retention = {
    active14: realUsers.filter((u) => u.active_days > 0).length,
    returning14: realUsers.filter((u) => u.active_days >= 2).length,
    rate: ratio(realUsers.filter((u) => u.active_days >= 2).length, realUsers.filter((u) => u.active_days > 0).length),
  };

  const [areaQ, periodQ, assetQ, sourceQ, addedQ, askQ, demoQ, dailyQ, runs, nifty] = await Promise.all([
    // Which screens get used: views and distinct people, last 7 days.
    db.execute(sql`
      select e.props->>'area' as area, count(*) as views, count(distinct e.user_id) as users
      from events e join users u on u.id = e.user_id
      where e.type = 'view' and e.created_at >= ${d7} and u.is_demo = false and u.is_test_account = false
      group by e.props->>'area'
    `),
    db.execute(sql`
      select e.props->>'period' as period, count(*) as n
      from events e join users u on u.id = e.user_id
      where e.type = 'analysis_period' and e.created_at >= ${d30} and u.is_demo = false and u.is_test_account = false
      group by e.props->>'period'
    `),
    // What people track: holdings and people per asset type, and how holdings got in.
    db.execute(sql`
      select h.asset_class as cls, count(*) as holdings, count(distinct p.user_id) as users
      from holdings h join portfolios p on p.id = h.portfolio_id join users u on u.id = p.user_id
      where u.is_demo = false and u.is_test_account = false
      group by h.asset_class
    `),
    db.execute(sql`
      select h.source as src, count(*) as holdings
      from holdings h join portfolios p on p.id = h.portfolio_id join users u on u.id = p.user_id
      where u.is_demo = false and u.is_test_account = false
      group by h.source
    `),
    db.execute(sql`
      select count(*) filter (where h.created_at >= ${d7}) as added7
      from holdings h join portfolios p on p.id = h.portfolio_id join users u on u.id = p.user_id
      where u.is_demo = false and u.is_test_account = false
    `),
    // Ask: counts, latency percentiles, cost, and the share of answers that read the portfolio.
    // Ask's numbers cover everyone, shared demo included: they measure the feature, not the funnel.
    db.execute(sql`
      select count(*) filter (where e.type = 'question') as questions7,
             count(distinct e.user_id) filter (where e.type = 'question') as askers7,
             count(*) filter (where e.type = 'guard_block') as blocks7,
             count(*) filter (where e.type = 'answer_error') as errors7,
             percentile_cont(0.5) within group (order by (e.props->>'latencyMs')::double precision)
               filter (where e.type = 'question') as p50_latency,
             percentile_cont(0.95) within group (order by (e.props->>'latencyMs')::double precision)
               filter (where e.type = 'question') as p95_latency,
             coalesce(sum((e.props->>'costUsd')::double precision) filter (where e.type = 'question'), 0) as cost7,
             count(*) filter (where e.type = 'question' and e.props->'tools' @> '["getMyPortfolio"]') as portfolio_tool
      from events e
      where e.created_at >= ${d7}
    `),
    // The shared demo and test accounts, reported apart from the product metrics.
    db.execute(sql`
      select count(*) filter (where e.type = 'signed_in') as sign_ins,
             count(*) filter (where e.type = 'view') as views,
             count(*) filter (where e.type = 'view' and e.props->>'area' = 'analysis') as analysis_views,
             count(*) filter (where e.type = 'question') as questions
      from events e join users u on u.id = e.user_id
      where e.created_at >= ${d30} and (u.is_demo = true or u.is_test_account = true)
    `),
    db.execute(sql`
      select (e.created_at at time zone 'UTC')::date as day,
             count(distinct e.user_id) as active,
             count(distinct e.user_id) filter (where e.type = 'question') as questions
      from events e join users u on u.id = e.user_id
      where e.created_at >= ${ago(13)} and u.is_demo = false and u.is_test_account = false
      group by 1
    `),
    db.select().from(schema.pipelineRuns).orderBy(desc(schema.pipelineRuns.startedAt)).limit(14),
    db
      .select({ d: schema.symbolSnapshots.tradeDate, at: schema.symbolSnapshots.fetchedAt })
      .from(schema.symbolSnapshots)
      .where(eq(schema.symbolSnapshots.symbol, NIFTY))
      .orderBy(desc(schema.symbolSnapshots.tradeDate))
      .limit(1),
  ]);

  const byArea = new Map(asRows<{ area: string; views: number; users: number }>(areaQ).map((a) => [a.area, a]));
  const areas = AREAS.map((a) => ({ area: a.label, views: Number(byArea.get(a.id)?.views ?? 0), users: Number(byArea.get(a.id)?.users ?? 0) }));

  const periods = asRows<{ period: string; n: number }>(periodQ)
    .filter((p) => p.period != null)
    .map((p) => ({ period: p.period, n: Number(p.n) }))
    .sort((a, b) => b.n - a.n);

  const assets = asRows<{ cls: string; holdings: number; users: number }>(assetQ)
    .map((a) => ({ label: ASSET_META[a.cls as AssetClass]?.plural ?? a.cls, holdings: Number(a.holdings), users: Number(a.users) }))
    .sort((a, b) => b.holdings - a.holdings);

  const SOURCE: Record<string, string> = { manual: "Added by hand", zerodha: "Zerodha file", groww: "Groww file", upstox: "Upstox file", generic: "Other spreadsheet", cas: "Mutual fund statement", screenshot: "Screenshot" };
  const sources = asRows<{ src: string; holdings: number }>(sourceQ)
    .map((s) => ({ label: SOURCE[s.src] ?? s.src, holdings: Number(s.holdings) }))
    .sort((a, b) => b.holdings - a.holdings);

  const mix = { multiAsset: ratio(trackers.filter((u) => u.asset_classes >= 2).length, trackers.length), added7: Number(asRows<{ added7: number }>(addedQ)[0]?.added7 ?? 0) };

  // Ask. Percentiles come from the database rather than by sorting every latency in memory.
  const a7 = asRows<{ questions7: number; askers7: number; blocks7: number; errors7: number; p50_latency: number | null; p95_latency: number | null; cost7: number; portfolio_tool: number }>(askQ)[0];
  const questions7 = Number(a7?.questions7 ?? 0);
  const blocks7 = Number(a7?.blocks7 ?? 0);
  const [feedback7, spend] = await Promise.all([
    db.select({ rating: schema.feedback.rating }).from(schema.feedback).where(sql`${schema.feedback.createdAt} >= ${d7}`),
    db.select({ cost: schema.usage.costUsd, at: schema.usage.createdAt }).from(schema.usage),
  ]);
  const ask = {
    questions7,
    askers7: Number(a7?.askers7 ?? 0),
    helpfulRate7: ratio(feedback7.filter((f) => f.rating === "up").length, feedback7.length),
    ratings7: feedback7.length,
    blockRate7: ratio(blocks7, blocks7 + questions7),
    p50Latency: a7?.p50_latency == null ? null : Math.round(Number(a7.p50_latency)),
    p95Latency: a7?.p95_latency == null ? null : Math.round(Number(a7.p95_latency)),
    costPerAnswer7: ratio(Number(a7?.cost7 ?? 0), questions7),
    spend7: spend.filter((u) => u.at >= d7).reduce((x, u) => x + u.cost, 0),
    spend30: spend.filter((u) => u.at >= d30).reduce((x, u) => x + u.cost, 0),
    portfolioToolShare: ratio(Number(a7?.portfolio_tool ?? 0), questions7),
    errors7: Number(a7?.errors7 ?? 0),
  };

  const sharedAccounts = asRows<{ sign_ins: number; views: number; analysis_views: number; questions: number }>(demoQ)[0];
  const demo = { signIns: Number(sharedAccounts?.sign_ins ?? 0), views: Number(sharedAccounts?.views ?? 0), analysisViews: Number(sharedAccounts?.analysis_views ?? 0), questions: Number(sharedAccounts?.questions ?? 0) };

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

  // The database returns a date; normalise it before formatting.
  const byDay = new Map(asRows<{ day: string | Date; active: number; questions: number }>(dailyQ).map((d) => [dayKey(d.day), d]));
  const daily = Array.from({ length: 14 }, (_, i) => {
    const day = dayKey(new Date(now - (13 - i) * DAY));
    const hit = byDay.get(day);
    return { day: day.slice(5), active: Number(hit?.active ?? 0), questions: Number(hit?.questions ?? 0), signups: realUsers.filter((u) => dayKey(u.created_at) === day).length };
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
