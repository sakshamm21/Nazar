import "server-only";
import { randomUUID } from "crypto";
import { and, eq, isNull, lt, or, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { marketProvider } from "@/lib/data/market";
import { istDate, type MarketDataProvider } from "@/lib/data/provider";
import { NIFTY, SECTOR_INDICES } from "@/lib/instruments/sectors";
import { latestTradeDate } from "@/lib/market/store";
import { logger } from "@/lib/logger";
import { collectBatch, collectQuotes, liveUniverse } from "./collect";
import { deliverForUser } from "./deliver";
import { evaluateUser } from "./evaluate";
import { deliverWeekly, generateWeekly } from "@/lib/reports/generate";

/**
 * The nightly checkup as a resumable state machine. Vercel Hobby allows one run per day per cron
 * entry (±59 min) and 300s per invocation, so several daily entries call the same handler and
 * each advances whatever stage is pending from a stored cursor, under a 240s budget.
 *
 *   quotes → collect (cursor over symbols) → alerts (cursor over users) → deliver → done
 *
 * A lock row prevents overlapping runs; every write is idempotent, so re-runs are safe.
 */
type Run = typeof schema.pipelineRuns.$inferSelect;
type Kind = Run["kind"];

async function openRun(kind: Kind, runDate: string, firstStage: string): Promise<Run> {
  const db = await getDb();
  await db.insert(schema.pipelineRuns).values({ id: randomUUID(), kind, runDate, stage: firstStage, status: "running" }).onConflictDoNothing();
  const [row] = await db.select().from(schema.pipelineRuns).where(and(eq(schema.pipelineRuns.kind, kind), eq(schema.pipelineRuns.runDate, runDate))).limit(1);
  return row;
}

async function lock(run: Run, ms: number) {
  const db = await getDb();
  const rows = await db
    .update(schema.pipelineRuns)
    .set({ lockedUntil: new Date(Date.now() + ms) })
    .where(and(eq(schema.pipelineRuns.id, run.id), or(isNull(schema.pipelineRuns.lockedUntil), lt(schema.pipelineRuns.lockedUntil, new Date()))))
    .returning({ id: schema.pipelineRuns.id });
  return rows.length > 0;
}

async function save(run: Run, patch: Partial<Run>) {
  const db = await getDb();
  Object.assign(run, patch);
  await db.update(schema.pipelineRuns).set(patch).where(eq(schema.pipelineRuns.id, run.id));
}

export type RunResult = { kind: Kind; runDate: string; stage: string; status: string; more: boolean; stats: Record<string, unknown>; busy?: boolean };

export async function runNightly(opts: { budgetMs?: number; provider?: MarketDataProvider; now?: Date } = {}): Promise<RunResult> {
  const provider = opts.provider ?? marketProvider;
  const budget = opts.budgetMs ?? 240_000;
  const started = Date.now();
  const deadline = started + budget;
  const runDate = istDate(opts.now ?? new Date());
  const run = await openRun("nightly", runDate, "quotes");
  if (run.status !== "running") return { kind: "nightly", runDate, stage: run.stage, status: run.status, more: false, stats: run.stats };
  if (!(await lock(run, budget + 40_000))) return { kind: "nightly", runDate, stage: run.stage, status: "running", more: false, stats: run.stats, busy: true };
  const db = await getDb();
  const stats = { ...(run.stats as Record<string, any>) };
  const errors = [...run.errors];
  try {
    while (Date.now() < deadline) {
      if (run.stage === "quotes") {
        const universe = [NIFTY, ...SECTOR_INDICES, ...(await liveUniverse(db))];
        const q = await collectQuotes(db, provider, universe, "live");
        stats.universe = universe;
        stats.quotes = q.count;
        stats.marketDate = q.marketDate;
        if (!q.marketDate || q.marketDate !== runDate) {
          // Weekend or market holiday: prices were refreshed, but there's no new session to alert on.
          stats.reason = "no session today";
          await save(run, { stage: "done", status: "skipped", stats, finishedAt: new Date() });
          break;
        }
        await save(run, { stage: "collect", cursor: 0, stats });
      } else if (run.stage === "collect") {
        const universe: string[] = stats.universe ?? [];
        const r = await collectBatch(db, provider, universe, run.cursor, stats.marketDate, deadline, "live");
        stats.processed = (stats.processed ?? 0) + r.processed;
        stats.failed = (stats.failed ?? 0) + r.failed;
        stats.results = (stats.results ?? 0) + r.results;
        stats.stale = [...(stats.stale ?? []), ...r.stale].slice(0, 50);
        if (r.circuitOpen) errors.push(`circuit open at ${r.next}/${universe.length}`);
        await save(run, r.done || r.circuitOpen ? { stage: "alerts", cursor: 0, stats, errors } : { cursor: r.next, stats, errors });
      } else if (run.stage === "alerts") {
        const users = await db
          .selectDistinct({ u: schema.users })
          .from(schema.users)
          .innerJoin(schema.portfolios, eq(schema.portfolios.userId, schema.users.id))
          .where(eq(schema.users.isDemo, false))
          .orderBy(schema.users.id);
        let i = run.cursor;
        for (; i < users.length && Date.now() < deadline; i++) {
          try {
            const r = await evaluateUser(users[i].u, { date: stats.marketDate, sources: ["live"], news: true });
            stats.alerts = (stats.alerts ?? 0) + r.created.length;
          } catch (e) {
            errors.push(`alerts ${users[i].u.id}: ${String((e as Error).message).slice(0, 120)}`);
          }
        }
        await save(run, i >= users.length ? { stage: "deliver", cursor: 0, stats, errors } : { cursor: i, stats, errors });
      } else if (run.stage === "deliver") {
        const rows = await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.tradeDate, stats.marketDate), eq(schema.alertEvents.isSimulated, false)));
        const byUser = new Map<string, typeof rows>();
        for (const a of rows) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
        const ids = [...byUser.keys()].sort();
        const users = ids.length ? await db.select().from(schema.users).where(and(inArray(schema.users.id, ids), eq(schema.users.isDemo, false))) : [];
        let i = run.cursor;
        for (; i < users.length && Date.now() < deadline; i++) {
          const r = await deliverForUser(users[i], byUser.get(users[i].id) ?? [], stats.marketDate);
          stats.emailsSent = (stats.emailsSent ?? 0) + r.sent;
        }
        if (i >= users.length) {
          await save(run, { stage: "done", status: "done", cursor: 0, stats, errors, finishedAt: new Date() });
          break;
        }
        await save(run, { cursor: i, stats, errors });
      } else break;
    }
  } catch (e) {
    errors.push(String((e as Error).message ?? e).slice(0, 300));
    logger.error({ err: String(e) }, "nightly run error");
    await save(run, { errors });
  } finally {
    await db.update(schema.pipelineRuns).set({ lockedUntil: null }).where(eq(schema.pipelineRuns.id, run.id));
  }
  return { kind: "nightly", runDate, stage: run.stage, status: run.status, more: run.status === "running", stats: { ...stats, universe: undefined, universeSize: (stats.universe ?? []).length, ms: Date.now() - started } };
}

export async function runWeekly(opts: { budgetMs?: number; now?: Date } = {}): Promise<RunResult> {
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const runDate = istDate(opts.now ?? new Date());
  const run = await openRun("weekly", runDate, "reports");
  if (run.status !== "running") return { kind: "weekly", runDate, stage: run.stage, status: run.status, more: false, stats: run.stats };
  if (!(await lock(run, 280_000))) return { kind: "weekly", runDate, stage: run.stage, status: "running", more: false, stats: run.stats, busy: true };
  const db = await getDb();
  const stats = { ...(run.stats as Record<string, any>) };
  try {
    const weekEnd = await latestTradeDate(db, ["live"]);
    if (!weekEnd) {
      await save(run, { stage: "done", status: "skipped", stats: { reason: "no market data yet" }, finishedAt: new Date() });
    } else {
      const rows = await db.select({ p: schema.portfolios, u: schema.users }).from(schema.portfolios).innerJoin(schema.users, eq(schema.users.id, schema.portfolios.userId)).where(eq(schema.users.isDemo, false)).orderBy(schema.portfolios.id);
      let i = run.cursor;
      for (; i < rows.length && Date.now() < deadline; i++) {
        const report = await generateWeekly(rows[i].u, rows[i].p, weekEnd, ["live"]);
        if (report) {
          stats.reports = (stats.reports ?? 0) + 1;
          stats.emails = (stats.emails ?? 0) + (await deliverWeekly(rows[i].u, rows[i].p, report));
        }
      }
      await save(run, i >= rows.length ? { stage: "done", status: "done", cursor: i, stats, finishedAt: new Date() } : { cursor: i, stats });
    }
  } finally {
    await db.update(schema.pipelineRuns).set({ lockedUntil: null }).where(eq(schema.pipelineRuns.id, run.id));
  }
  return { kind: "weekly", runDate, stage: run.stage, status: run.status, more: run.status === "running", stats };
}

/** Housekeeping: prune rate-limit rows and simulated days, and put the shared test accounts back. */
export async function runMaintenance() {
  const db = await getDb();
  const expired = await db.delete(schema.users).where(and(eq(schema.users.isDemo, true), lt(schema.users.demoExpiresAt, new Date()))).returning({ id: schema.users.id });
  await db.delete(schema.rateEvents).where(lt(schema.rateEvents.createdAt, new Date(Date.now() - 48 * 3600_000)));
  await db.execute(sql`delete from symbol_snapshots where source like 'sim:%' and source not in (select 'sim:' || id from users)`);
  await db.execute(sql`delete from price_daily where source like 'sim:%' and source not in (select 'sim:' || id from users)`);
  const { ensureTestAccounts } = await import("@/lib/demo/seed");
  const accounts = await ensureTestAccounts(db);
  return { expiredDemoUsers: expired.length, testAccounts: accounts };
}
