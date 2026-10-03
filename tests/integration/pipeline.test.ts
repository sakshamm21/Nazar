/**
 * The nightly checkup end to end on an in-memory database, with a fake market-data provider in
 * place of Yahoo: quotes → collect → alerts → deliver. Checks snapshots, beta from stored prices,
 * H1 alerts with reasons, de-duplication on re-runs, holiday skips, H4 results detection, stale
 * symbols, and that digests are recorded once (email itself is off in tests).
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { istDate } from "@/lib/data/provider";
import { NIFTY, SECTOR_INDICES } from "@/lib/instruments/sectors";
import { prevWeekday, shiftDate } from "@/lib/market/store";
import { runNightly } from "@/lib/pipeline/run";
import { evaluateUser } from "@/lib/pipeline/evaluate";
import { deliverForUser } from "@/lib/pipeline/deliver";
import { findAdvice } from "@/lib/alerts/guard";
import { fakeMarket, q } from "./fake-market";
import { makePortfolio, makeUser, memoryDb, type TestUser } from "./harness";

/* ------------------------------------------------------------------ */

const today = istDate(new Date());
const D1 = prevWeekday(today);
let D2 = shiftDate(D1, 1);
while ([0, 6].includes(new Date(`${D2}T00:00:00Z`).getUTCDay())) D2 = shiftDate(D2, 1);
let SAT = D1;
while (new Date(`${SAT}T00:00:00Z`).getUTCDay() !== 6) SAT = shiftDate(SAT, 1);
const at = (iso: string) => new Date(`${iso}T12:30:00Z`); // 18:00 IST, after the close

let db: DB;
let user: TestUser;
let demo: TestUser;
const m = fakeMarket();

const alertsFor = (userId: string, date?: string) =>
  db.select().from(schema.alertEvents).where(date ? and(eq(schema.alertEvents.userId, userId), eq(schema.alertEvents.tradeDate, date)) : eq(schema.alertEvents.userId, userId));

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "aarav@test.nazar.dev", name: "Aarav" });
  await makePortfolio(db, user.id, [
    { symbol: "TMPV.NS", quantity: 100, avgPrice: 650 },
    { symbol: "INFY.NS", quantity: 50, avgPrice: 1400 },
    { symbol: "HDFCBANK.NS", quantity: 100, avgPrice: 900 },
    { symbol: "GONE.NS", quantity: 10, avgPrice: 100 },
  ]);
  // Demo users are never part of the live checkup.
  demo = await makeUser(db, { isDemo: true });
  await makePortfolio(db, demo.id, [{ symbol: "ITC.NS", quantity: 10, avgPrice: 400 }]);
  m.state.day = D1;
  m.state.broken.add("GONE.NS");
}, 120_000);

describe("nightly checkup (fake provider)", () => {
  it("day 1: collects the live universe, computes beta, raises explained alerts, records digests", async () => {
    m.state.moves = { "*": -0.008, [NIFTY]: -0.01, "^CNXAUTO": -0.005, "TMPV.NS": -0.07, "INFY.NS": -0.012, "HDFCBANK.NS": 0.003 };
    const r = await runNightly({ provider: m.provider, now: at(D1), budgetMs: 60_000 });
    expect(r).toMatchObject({ status: "done", stage: "done", runDate: D1, more: false });
    expect(r.stats).toMatchObject({ marketDate: D1, failed: 1, stale: ["GONE.NS"] });
    expect(r.stats.universeSize).toBe(1 + SECTOR_INDICES.length + 4); // demo holdings excluded

    const [snap] = await db.select().from(schema.symbolSnapshots).where(and(eq(schema.symbolSnapshots.symbol, "TMPV.NS"), eq(schema.symbolSnapshots.tradeDate, D1), eq(schema.symbolSnapshots.source, "live")));
    expect(snap.changePct).toBeCloseTo(-0.07, 6);
    expect(snap.beta).toBeGreaterThan(1.1); // computed from stored prices, not Yahoo's field
    expect(snap.beta).toBeLessThan(1.5);
    expect(snap.lastQuarterEnd).toBeNull();

    const alerts = await alertsFor(user.id, D1);
    const tm = alerts.find((a) => a.type === "stock_move" && a.symbol === "TMPV.NS")!;
    expect(tm.titleEn).toMatch(/fell 7\.0%$/);
    expect(tm.severity).toBe("critical");
    expect((tm.data as { reason?: { kind: string } }).reason?.kind).toBe("company");
    expect(tm.bodyEn).toMatch(/^Likely reason: something specific to Tata Motors\. .*Tata Motors is 2\d% of your portfolio; its value fell ~₹4,\d{3} today\.$/);
    expect(tm.titleHi).toMatch(/7\.0% गिरा$/);
    for (const a of alerts) expect(findAdvice(`${a.titleEn} ${a.bodyEn} ${a.titleHi} ${a.bodyHi}`)).toEqual([]);
    expect(await alertsFor(demo.id)).toHaveLength(0);

    const deliveries = await db.select().from(schema.deliveries).where(eq(schema.deliveries.userId, user.id));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ kind: "digest", email: user.email, status: "skipped_no_config" });
  });

  it("re-running is safe: the same day is not processed twice, and alerts/digests de-duplicate", async () => {
    const before = (await alertsFor(user.id)).length;
    const r = await runNightly({ provider: m.provider, now: at(D1) });
    expect(r.status).toBe("done");
    const again = await evaluateUser(user, { date: D1, sources: ["live"], news: false });
    expect(again.created).toHaveLength(0);
    expect(await alertsFor(user.id)).toHaveLength(before);
    const d = await deliverForUser(user, await alertsFor(user.id, D1), D1);
    expect(d.sent).toBe(0);
    expect(await db.select().from(schema.deliveries).where(eq(schema.deliveries.userId, user.id))).toHaveLength(1);
  });

  it("weekend or market holiday: refreshes prices but raises no alerts", async () => {
    const before = (await alertsFor(user.id)).length;
    const r = await runNightly({ provider: m.provider, now: at(SAT) });
    expect(r.status).toBe("skipped");
    expect(r.stats).toMatchObject({ reason: "no session today", marketDate: D1 });
    expect(await alertsFor(user.id)).toHaveLength(before);
  });

  it("day 2: new quarterly results are detected and explained (H4)", async () => {
    m.advance(D2);
    m.state.moves = { "*": 0.001 };
    m.state.quarters["INFY.NS"] = [...m.state.quarters["INFY.NS"], q("2026-06-30", 45500, 7600, 18.3)];
    const r = await runNightly({ provider: m.provider, now: at(D2), budgetMs: 60_000 });
    expect(r).toMatchObject({ status: "done", runDate: D2 });
    expect(r.stats.results).toBe(1);

    const events = await db.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "INFY.NS"));
    const ev = events.find((e) => e.quarterEnd === "2026-06-30")!;
    expect(ev).toMatchObject({ quarterEnd: "2026-06-30", detectedOn: D2, source: "live" });
    // The quarter that was already out on day 1 is kept for the stock page, dated in the past so it was never announced.
    expect(events.find((e) => e.quarterEnd === "2026-03-31")).toMatchObject({ detectedOn: "2026-03-31", data: { backfilled: true } });

    const res = (await alertsFor(user.id, D2)).find((a) => a.type === "results")!;
    expect(res.titleEn).toBe("Infosys reported Apr–Jun 2026 results");
    expect(res.bodyEn).toMatch(/Revenue grew 8\.3% from last quarter/);
    const improved = (res.data as { improved: { key: string }[] }).improved.map((p) => p.key);
    expect(improved).toEqual(expect.arrayContaining(["rev_qoq", "profit_qoq", "eps_vs_est"]));
    expect(res.bodyEn).not.toMatch(/Health score/); // no annual statements in this fake → no score claimed
    expect((await alertsFor(user.id, D2)).some((a) => a.type === "stock_move")).toBe(false); // a calm day
  });

  it("the circuit breaker stops a run cleanly when the provider is down", async () => {
    let D3 = shiftDate(D2, 1);
    while ([0, 6].includes(new Date(`${D3}T00:00:00Z`).getUTCDay())) D3 = shiftDate(D3, 1);
    m.advance(D3);
    const down = { ...m.provider, summary: async () => { throw new Error("fetch failed: ECONNRESET"); }, dailyHistory: async () => { throw new Error("fetch failed: ECONNRESET"); } };
    const r = await runNightly({ provider: down, now: at(D3), budgetMs: 60_000 });
    expect(r.status).toBe("done"); // alerts still run on today's quotes
    expect(r.stats.failed).toBeGreaterThanOrEqual(4);
  });
});
