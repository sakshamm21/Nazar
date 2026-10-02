import "server-only";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import type { HealthInfo, QuarterRow } from "@/lib/db/schema";
import { betaAndVol } from "@/lib/analytics/models";
import { shortName } from "@/lib/instruments/master";
import { NIFTY, sectorOf } from "@/lib/instruments/sectors";
import { istDate } from "@/lib/data/provider";
import { shiftDate } from "@/lib/market/store";
import { logger } from "@/lib/logger";
import { DEMO_MINE, DEMO_PAPA, DEMO_RESULTS_SYMBOL, DEMO_WATCHING, HISTORY_DAYS, TEMPLATE_EMAIL, TEST_ACCOUNTS, TEST_PASSWORD } from "./config";

/**
 * The demo runs from a frozen fixture of real Yahoo data (src/data/demo-fixture.json), so it works
 * with Yahoo down and the guided tour always matches what's on screen. Dates are shifted so the
 * latest session is the last weekday before today; everything is stored under source "demo",
 * isolated from live data.
 *
 * The demo account's history is not hand-written: the real alert engine is replayed over the last
 * 60 sessions, ratings are seeded (small moves rated not useful, big ones useful), and the real H5
 * tuner then raises the threshold — producing the learned-threshold message the tour points to.
 */
type Fixture = {
  capturedAt: string;
  lastDate: string;
  indices: Record<string, [string, number][]>;
  symbols: Record<string, { name: string; isin: string | null; sector: string | null; industry: string | null; marketCap: number | null; metrics: Record<string, number | null>; health: HealthInfo; quarters: QuarterRow[]; nextResultsDate: string | null; bars: [string, number][] }>;
};

let fixture: Fixture | null = null;
export function loadFixture(): Fixture {
  if (!fixture) fixture = JSON.parse(readFileSync(path.join(process.cwd(), "src", "data", "demo-fixture.json"), "utf8")) as Fixture;
  return fixture;
}

const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/** The demo's latest session: the last weekday before today (India time). */
export function demoToday(now = new Date()): string {
  let d = shiftDate(istDate(now), -1);
  while (isWeekend(d)) d = shiftDate(d, -1);
  return d;
}

/** Maps every fixture trading date onto consecutive weekdays ending at `today` (holidays compress). */
export function dateMap(fx: Fixture, today: string): Map<string, string> {
  const all = new Set<string>();
  for (const bars of Object.values(fx.indices)) for (const [d] of bars) all.add(d);
  for (const s of Object.values(fx.symbols)) for (const [d] of s.bars) all.add(d);
  const dates = [...all].sort();
  const out = new Map<string, string>();
  let cur = today;
  for (let i = dates.length - 1; i >= 0; i--) {
    out.set(dates[i], cur);
    cur = shiftDate(cur, -1);
    while (isWeekend(cur)) cur = shiftDate(cur, -1);
  }
  return out;
}

/** Wall-clock time for a session's "checkup" (4:47 PM IST). */
export const checkupAt = (iso: string, minutes = 0) => new Date(new Date(`${iso}T11:17:00Z`).getTime() + minutes * 60_000);

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function marker(db: DB) {
  const [r] = await db.select().from(schema.pipelineRuns).where(and(eq(schema.pipelineRuns.kind, "maintenance"), eq(schema.pipelineRuns.stage, "demo"))).limit(1);
  return r ?? null;
}

/**
 * Makes sure the demo market (and the template account + test accounts built on it) is current.
 * Rebuilds when the demo date moved; tolerates a stale demo for up to 3 days so a visitor never
 * waits for a rebuild (the daily maintenance cron does it in the background).
 */
export async function ensureDemoMarket(db: DB, opts: { force?: boolean; maxStaleDays?: number; now?: Date } = {}) {
  const today = demoToday(opts.now);
  const m = await marker(db);
  if (!opts.force && m?.runDate === today && m.status === "done") return { today, rebuilt: false };
  const staleDays = m?.runDate ? (new Date(today).getTime() - new Date(m.runDate).getTime()) / 86400000 : Infinity;
  if (!opts.force && m?.status === "done" && staleDays <= (opts.maxStaleDays ?? 0)) return { today: m.runDate, rebuilt: false };
  // Claim the rebuild so concurrent instances don't race.
  if (m) {
    const claimed = await db
      .update(schema.pipelineRuns)
      .set({ status: "running", lockedUntil: new Date(Date.now() + 300_000) })
      .where(and(eq(schema.pipelineRuns.id, m.id), sql`(${schema.pipelineRuns.lockedUntil} is null or ${schema.pipelineRuns.lockedUntil} < now())`))
      .returning({ id: schema.pipelineRuns.id });
    if (!claimed.length) return { today: m.runDate, rebuilt: false };
  } else {
    const ins = await db.insert(schema.pipelineRuns).values({ id: randomUUID(), kind: "maintenance", runDate: today, stage: "demo", status: "running", lockedUntil: new Date(Date.now() + 300_000) }).onConflictDoNothing().returning({ id: schema.pipelineRuns.id });
    if (!ins.length) return { today, rebuilt: false };
  }
  const t0 = Date.now();
  await seedDemoMarket(db, today);
  await buildTemplate(db, today);
  await ensureTestAccounts(db);
  await db.update(schema.pipelineRuns).set({ runDate: today, status: "done", lockedUntil: null, finishedAt: new Date(), stats: { ms: Date.now() - t0 } }).where(and(eq(schema.pipelineRuns.kind, "maintenance"), eq(schema.pipelineRuns.stage, "demo")));
  logger.info({ today, ms: Date.now() - t0 }, "demo market rebuilt");
  return { today, rebuilt: true };
}

/** Writes the fixture as source "demo": prices, instruments, 60 sessions of snapshots, the results event. */
export async function seedDemoMarket(db: DB, today: string) {
  const fx = loadFixture();
  const map = dateMap(fx, today);
  await db.delete(schema.priceDaily).where(eq(schema.priceDaily.source, "demo"));
  await db.delete(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.source, "demo"));
  await db.delete(schema.resultsEvents).where(eq(schema.resultsEvents.source, "demo"));

  // Indices with real history (Yahoo has none for some sector indices; those stay null, see AUDIT).
  const indices = Object.fromEntries(Object.entries(fx.indices).filter(([, bars]) => bars.length >= 60));
  const series = new Map<string, [string, number][]>();
  for (const [s, bars] of Object.entries(indices)) series.set(s, bars.map(([d, c]) => [map.get(d)!, c]));
  for (const [s, info] of Object.entries(fx.symbols)) series.set(s, info.bars.map(([d, c]) => [map.get(d)!, c]));

  const priceRows = [...series].flatMap(([symbol, bars]) => bars.map(([date, close]) => ({ symbol, date, source: "demo", close, volume: null })));
  await chunked(priceRows, 400, (c) => db.insert(schema.priceDaily).values(c).onConflictDoNothing());

  for (const [symbol, info] of Object.entries(fx.symbols)) {
    const sec = sectorOf(info.sector, info.industry);
    await db
      .insert(schema.instruments)
      .values({ symbol, isin: info.isin, name: info.name, shortName: shortName(info.name), sector: info.sector, industry: info.industry, isFinancial: sec.financial })
      .onConflictDoUpdate({ target: schema.instruments.symbol, set: { name: info.name, shortName: shortName(info.name), sector: info.sector, industry: info.industry, isFinancial: sec.financial, updatedAt: new Date() } });
  }

  const offsetDays = Math.round((new Date(today).getTime() - new Date(fx.lastDate).getTime()) / 86400000);
  const niftyMap = new Map(series.get(NIFTY) ?? []);
  const resultsDay = (() => {
    let d = shiftDate(today, -1);
    while (isWeekend(d)) d = shiftDate(d, -1);
    return d;
  })();
  const snapRows: (typeof schema.symbolSnapshots.$inferInsert)[] = [];
  for (const [symbol, bars] of series) {
    const info = fx.symbols[symbol];
    const bv = info && niftyMap.size ? betaAndVol(new Map(bars), niftyMap) : { beta: null, vol: null };
    const recent = bars.slice(-(HISTORY_DAYS + 2));
    const quarters = info?.quarters ?? [];
    for (let i = 1; i < recent.length; i++) {
      const [date, close] = recent[i];
      const prevClose = recent[i - 1][1];
      const beforeResults = symbol === DEMO_RESULTS_SYMBOL && date < resultsDay;
      snapRows.push({
        symbol,
        tradeDate: date,
        source: "demo",
        price: close,
        prevClose,
        changePct: close / prevClose - 1,
        marketCap: info?.marketCap ?? null,
        metrics: info ? { ...info.metrics, price: close } : {},
        beta: bv.beta,
        vol1y: bv.vol,
        health: info?.health ?? null,
        nextResultsDate: info?.nextResultsDate ? shiftDate(info.nextResultsDate, offsetDays) : null,
        lastQuarterEnd: (beforeResults ? quarters.at(-2) : quarters.at(-1))?.quarterEnd ?? null,
        quarterly: beforeResults ? quarters.slice(0, -1) : quarters,
        asOf: checkupAt(date, -77),
        fetchedAt: checkupAt(date),
        status: "ok",
      });
    }
  }
  await chunked(snapRows, 200, (c) => db.insert(schema.symbolSnapshots).values(c).onConflictDoNothing());

  // H4: the results-day story uses this holding's real latest quarter, presented as reported yesterday.
  const r = fx.symbols[DEMO_RESULTS_SYMBOL];
  if (r?.quarters.length >= 2) {
    const q = r.quarters;
    const cur = q.at(-1)!;
    const yearAgo = q.find((x) => x.quarterEnd.slice(5) === cur.quarterEnd.slice(5) && Number(x.quarterEnd.slice(0, 4)) === Number(cur.quarterEnd.slice(0, 4)) - 1) ?? null;
    await db.insert(schema.resultsEvents).values({ id: randomUUID(), symbol: DEMO_RESULTS_SYMBOL, source: "demo", quarterEnd: cur.quarterEnd, detectedOn: resultsDay, data: { current: cur, previous: q.at(-2)!, yearAgo, annualHealthUpdated: false }, healthBefore: r.health.score, healthAfter: r.health.score });
  }
}

/* ------------------------------------------------------------------ */
/* Demo account                                                         */
/* ------------------------------------------------------------------ */

function holdingsFor(list: { symbol: string; value: number; daysAgo: number }[], fx: Fixture, today: string, map: Map<string, string>) {
  return list.map((h, i) => {
    const bars = fx.symbols[h.symbol].bars.map(([d, c]) => [map.get(d)!, c] as [string, number]);
    const last = bars.at(-1)![1];
    const buy = bars[Math.max(0, bars.length - 1 - h.daysAgo)];
    const quantity = Math.max(1, Math.round(h.value / last));
    // Average price a little above that day's close (brokerage, a couple of buys), deterministic per row.
    const avgPrice = Math.round(buy[1] * (1 + ((i % 3) + 1) * 0.004) * 100) / 100;
    return { symbol: h.symbol, quantity, avgPrice, buyDate: buy[0] };
  });
}

/** Rebuilds the hidden template account that every demo visitor is cloned from. */
export async function buildTemplate(db: DB, today: string) {
  const fx = loadFixture();
  const map = dateMap(fx, today);
  await db.delete(schema.users).where(eq(schema.users.email, TEMPLATE_EMAIL));
  const userId = randomUUID();
  await db.insert(schema.users).values({ id: userId, email: TEMPLATE_EMAIL, name: "Aarav", isDemo: true, emailVerifiedAt: new Date(), createdAt: checkupAt(shiftDate(today, -90)) });
  const mine = randomUUID(), papa = randomUUID();
  await db.insert(schema.portfolios).values([
    { id: mine, userId, name: "My portfolio", ownerLabel: null, language: "en", isDefault: true, sortOrder: 0 },
    { id: papa, userId, name: "Papa's portfolio", ownerLabel: "Papa", language: "hi", isDefault: false, sortOrder: 1 },
  ]);
  const rows = [
    ...holdingsFor(DEMO_MINE, fx, today, map).map((h) => ({ ...h, portfolioId: mine })),
    ...holdingsFor(DEMO_PAPA, fx, today, map).map((h) => ({ ...h, portfolioId: papa })),
  ];
  await db.insert(schema.holdings).values(rows.map((h) => ({ id: randomUUID(), ...h, isin: fx.symbols[h.symbol].isin, rawName: fx.symbols[h.symbol].name, source: "zerodha" as const })));
  await db.insert(schema.watching).values(DEMO_WATCHING.map((symbol) => ({ userId, symbol })));
  await db.insert(schema.recipients).values({ id: randomUUID(), userId, portfolioId: papa, email: "papa@example.com", confirmedAt: checkupAt(shiftDate(today, -70)) });
  // History starts on "everything" so small moves alert; the replayed ratings then teach H5.
  await db.insert(schema.alertSettings).values({ userId, sensitivity: "everything", emailDigest: false, quietMode: false });

  const { evaluateUser, runTuner } = await import("@/lib/pipeline/evaluate");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const sessions = [...new Set([...map.values()])].sort().filter((d) => d <= today).slice(-(HISTORY_DAYS + 1));
  const tuneIndex = sessions.length - 10;
  let smallCount = 0;
  for (let i = 0; i < sessions.length; i++) {
    const d = sessions[i];
    const created = await evaluateUser(user, { date: d, sources: ["demo"], news: false, tune: false, createdAt: checkupAt(d) });
    if (i < sessions.length - 1) smallCount += await rateReplayed(db, userId, created.created, d, smallCount);
    if (i === tuneIndex) {
      const changes = await runTuner(userId, "everything", d, checkupAt(d, 600));
      if (!changes.length) logger.warn("demo template: tuner made no change (not enough small-move ratings)");
    }
  }
  // Older alerts read; the last two sessions stay unread.
  await db.execute(sql`update alert_events set read_at = created_at + interval '2 hours' where user_id = ${userId} and trade_date < ${sessions.at(-2) ?? today}`);

  // Weekly reports for the last two completed weeks (H6: Papa's is in Hindi).
  const { generateWeekly } = await import("@/lib/reports/generate");
  const fridays = sessions.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5 && shiftDate(d, 2) < today).slice(-2);
  const pfs = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, userId));
  for (const f of fridays) for (const p of pfs) await generateWeekly(user, p, f, ["demo"], new Date(`${shiftDate(f, 2)}T03:00:00Z`));
  return userId;
}

/** Deterministic ratings for replayed alerts: small moves mostly "not useful", big moves and results "useful". */
async function rateReplayed(db: DB, userId: string, ids: string[], date: string, smallSoFar: number) {
  if (!ids.length) return 0;
  const alerts = await db.select().from(schema.alertEvents).where(inArray(schema.alertEvents.id, ids));
  let small = 0;
  for (const a of alerts) {
    let rating: "up" | "down" | null = null;
    if (a.type === "stock_move") {
      const m = Number(a.data.magnitude ?? 0);
      if (m < 5) {
        rating = (smallSoFar + small) % 5 === 3 ? "up" : "down";
        small++;
      } else rating = "up";
    } else if (["portfolio_move", "results", "health_change", "concentration"].includes(a.type)) rating = "up";
    if (rating) await db.insert(schema.alertFeedback).values({ alertId: a.id, userId, rating, source: "app", createdAt: checkupAt(date, 900) }).onConflictDoNothing();
  }
  return small;
}

/**
 * Copies the template into `userId` with fresh ids (md5 of old id + new user keeps references
 * consistent without temp tables). A handful of INSERT … SELECT statements: fast on Neon's HTTP driver.
 */
export async function cloneTemplate(db: DB, userId: string) {
  const [t] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEMPLATE_EMAIL)).limit(1);
  if (!t) throw new Error("Demo template missing");
  const T = t.id, U = userId;
  const nid = (col: string) => sql.raw(`(md5(${col} || ':' || '${U.replace(/'/g, "")}'))::uuid::text`);
  await db.execute(sql`insert into portfolios (id, user_id, name, owner_label, language, alerts_enabled, is_default, sort_order, created_at)
    select ${nid("id")}, ${U}, name, owner_label, language, alerts_enabled, is_default, sort_order, created_at from portfolios where user_id = ${T}`);
  await db.execute(sql`insert into holdings (id, portfolio_id, symbol, quantity, avg_price, buy_date, isin, raw_name, source, created_at, updated_at)
    select ${nid("h.id")}, ${nid("h.portfolio_id")}, h.symbol, h.quantity, h.avg_price, h.buy_date, h.isin, h.raw_name, h.source, h.created_at, h.updated_at
    from holdings h join portfolios p on p.id = h.portfolio_id where p.user_id = ${T}`);
  await db.execute(sql`insert into watching (user_id, symbol, added_at) select ${U}, symbol, added_at from watching where user_id = ${T}`);
  await db.execute(sql`insert into recipients (id, user_id, portfolio_id, email, confirmed_at, unsubscribed_at, created_at)
    select ${nid("id")}, ${U}, ${nid("portfolio_id")}, email, confirmed_at, unsubscribed_at, created_at from recipients where user_id = ${T}`);
  await db.execute(sql`insert into alert_settings (user_id, sensitivity, quiet_mode, email_digest, updated_at) select ${U}, sensitivity, quiet_mode, false, updated_at from alert_settings where user_id = ${T}`);
  await db.execute(sql`insert into alert_thresholds (user_id, alert_type, value, muted, source, frozen_until, updated_at) select ${U}, alert_type, value, muted, source, frozen_until, updated_at from alert_thresholds where user_id = ${T}`);
  await db.execute(sql`insert into threshold_changes (id, user_id, alert_type, old_value, new_value, muted, evidence, message_en, message_hi, created_at, undone_at)
    select ${nid("id")}, ${U}, alert_type, old_value, new_value, muted, evidence, message_en, message_hi, created_at, undone_at from threshold_changes where user_id = ${T}`);
  await db.execute(sql`insert into alert_events (id, user_id, portfolio_id, type, symbol, severity, trade_date, dedupe_key, title_en, body_en, title_hi, body_hi, data, is_simulated, created_at, read_at)
    select ${nid("id")}, ${U}, case when portfolio_id is null then null else ${nid("portfolio_id")} end, type, symbol, severity, trade_date, dedupe_key, title_en, body_en, title_hi, body_hi,
      case when data ? 'thresholdChangeId' then jsonb_set(data, '{thresholdChangeId}', to_jsonb(${nid("(data->>'thresholdChangeId')")})) else data end,
      is_simulated, created_at, read_at from alert_events where user_id = ${T} and is_simulated = false`);
  await db.execute(sql`insert into alert_feedback (alert_id, user_id, rating, source, created_at)
    select ${nid("alert_id")}, ${U}, rating, source, created_at from alert_feedback where user_id = ${T}`);
  await db.execute(sql`insert into reports (id, user_id, portfolio_id, week_start, week_end, content, created_at)
    select ${nid("id")}, ${U}, ${nid("portfolio_id")}, week_start, week_end, content, created_at from reports where user_id = ${T}`);
}

/** Wipes a user's own data (keeps the account) — used to reset test accounts. */
export async function wipeUserData(db: DB, userId: string) {
  await db.delete(schema.alertEvents).where(eq(schema.alertEvents.userId, userId));
  await db.delete(schema.thresholdChanges).where(eq(schema.thresholdChanges.userId, userId));
  await db.delete(schema.alertThresholds).where(eq(schema.alertThresholds.userId, userId));
  await db.delete(schema.alertSettings).where(eq(schema.alertSettings.userId, userId));
  await db.delete(schema.watching).where(eq(schema.watching.userId, userId));
  await db.delete(schema.portfolios).where(eq(schema.portfolios.userId, userId));
  await db.delete(schema.priceTargets).where(eq(schema.priceTargets.userId, userId));
  await db.update(schema.users).set({ simState: null }).where(eq(schema.users.id, userId));
  await db.execute(sql`delete from symbol_snapshots where source = ${`sim:${userId}`}`);
  await db.execute(sql`delete from price_daily where source = ${`sim:${userId}`}`);
}

/** Public test accounts (Syncronify-style one-click sign-in). Reset to a clean demo every rebuild. */
export async function ensureTestAccounts(db: DB) {
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  for (const acc of TEST_ACCOUNTS) {
    let [u] = await db.select().from(schema.users).where(eq(schema.users.email, acc.email)).limit(1);
    if (!u) {
      await db.insert(schema.users).values({ id: randomUUID(), email: acc.email, name: acc.name, passwordHash: hash, emailVerifiedAt: new Date(), isTestAccount: true });
      [u] = await db.select().from(schema.users).where(eq(schema.users.email, acc.email)).limit(1);
    } else {
      await db.update(schema.users).set({ passwordHash: hash, emailVerifiedAt: u.emailVerifiedAt ?? new Date(), isTestAccount: true, tourCompletedAt: null }).where(eq(schema.users.id, u.id));
    }
    await wipeUserData(db, u.id);
    // Full test accounts read the demo market and never expire. Empty ones are real accounts on
    // live data (to try import and onboarding), with email off because their addresses are fake.
    await db.update(schema.users).set({ isDemo: acc.kind === "full", demoExpiresAt: null }).where(eq(schema.users.id, u.id));
    if (acc.kind === "full") await cloneTemplate(db, u.id);
    else await db.insert(schema.alertSettings).values({ userId: u.id, emailDigest: false }).onConflictDoNothing();
  }
}

/** Creates an isolated, 24-hour demo account for one visitor ("Try the demo, no sign-up"). */
export async function createDemoVisitor(db: DB) {
  await ensureDemoMarket(db, { maxStaleDays: 3 });
  const id = randomUUID();
  await db.insert(schema.users).values({ id, email: `visitor-${id}@demo.nazar.internal`, name: "Aarav", isDemo: true, demoExpiresAt: new Date(Date.now() + 24 * 3600_000), emailVerifiedAt: new Date() });
  await cloneTemplate(db, id);
  return id;
}

/** Local zero-setup: demo market, template and test accounts on first run. */
export async function ensureLocalSeed(db: DB) {
  await ensureDemoMarket(db, { maxStaleDays: 0 });
}
