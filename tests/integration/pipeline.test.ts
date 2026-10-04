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
import { runMaintenance, runNightly } from "@/lib/pipeline/run";
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
  it("day 1: collects the live universe and computes beta; no alerts, no email", async () => {
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

  });

  it("re-running is safe: the same day is not processed twice", async () => {
    const before = m.state.calls.quotes;
    const r = await runNightly({ provider: m.provider, now: at(D1) });
    expect(r.status).toBe("done");
    expect(m.state.calls.quotes).toBe(before);
  });

  it("weekend or market holiday: refreshes prices, and there is no new session to collect", async () => {
    const r = await runNightly({ provider: m.provider, now: at(SAT) });
    expect(r.status).toBe("skipped");
    expect(r.stats).toMatchObject({ reason: "no session today", marketDate: D1 });
  });

  it("day 2: new quarterly results are detected and stored for the stock page", async () => {
    m.advance(D2);
    m.state.moves = { "*": 0.001 };
    m.state.quarters["INFY.NS"] = [...m.state.quarters["INFY.NS"], q("2026-06-30", 45500, 7600, 18.3)];
    const r = await runNightly({ provider: m.provider, now: at(D2), budgetMs: 60_000 });
    expect(r).toMatchObject({ status: "done", runDate: D2 });
    expect(r.stats.results).toBe(1);

    const events = await db.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "INFY.NS"));
    const ev = events.find((e) => e.quarterEnd === "2026-06-30")!;
    expect(ev).toMatchObject({ quarterEnd: "2026-06-30", detectedOn: D2, source: "live" });
    // The quarter that was already out on day 1 is kept for the stock page, dated in the past.
    expect(events.find((e) => e.quarterEnd === "2026-03-31")).toMatchObject({ detectedOn: "2026-03-31", data: { backfilled: true } });
  });

  it("the circuit breaker stops a run cleanly when the provider is down", async () => {
    let D3 = shiftDate(D2, 1);
    while ([0, 6].includes(new Date(`${D3}T00:00:00Z`).getUTCDay())) D3 = shiftDate(D3, 1);
    m.advance(D3);
    const down = { ...m.provider, summary: async () => { throw new Error("fetch failed: ECONNRESET"); }, dailyHistory: async () => { throw new Error("fetch failed: ECONNRESET"); } };
    const r = await runNightly({ provider: down, now: at(D3), budgetMs: 60_000 });
    expect(r.status).toBe("done"); // today's quotes are still stored
    expect(r.stats.failed).toBeGreaterThanOrEqual(4);
  });
});

describe("a thin response cannot leave a symbol without its results card", () => {
  // Regression: the backfill used to be gated on the snapshot having no lastQuarterEnd, which is
  // true only on the very first fetch. A first fetch that came back with fewer than two quarters
  // therefore left the symbol permanently without a results card, while its prices, health and
  // next-results date all looked perfectly healthy.
  const weekday = (from: string, n: number) => {
    let d = from;
    for (let i = 0; i < n; i++) {
      do d = shiftDate(d, 1);
      while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
    }
    return d;
  };

  it("records the latest quarter on a later day, once more quarters are available", async () => {
    const db2 = await memoryDb();
    const u = await makeUser(db2, { email: "thin@test.nazar.dev", name: "Thin" });
    await makePortfolio(db2, u.id, [{ symbol: "TMPV.NS", quantity: 10, avgPrice: 700 }]);
    const m2 = fakeMarket();
    m2.state.day = D1; // the fake prices itself off this before the first advance()

    // Two sessions in which the provider answers with no quarters at all.
    for (const d of [D1, weekday(D1, 1)]) {
      m2.advance(d);
      m2.state.moves = { "*": 0.001 };
      await runNightly({ provider: m2.provider, now: at(d), budgetMs: 60_000 });
    }
    const [snap] = await db2.select().from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.symbol, "TMPV.NS")).limit(1);
    expect(snap.lastQuarterEnd).toBeNull();
    expect(await db2.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "TMPV.NS"))).toHaveLength(0);

    // The provider starts answering with a full history, on a later day.
    m2.state.quarters["TMPV.NS"] = [q("2026-03-31", 42000, 7000, 16.9), q("2026-06-30", 45500, 7600, 18.3)];
    const d3 = weekday(D1, 2);
    m2.advance(d3);
    await runNightly({ provider: m2.provider, now: at(d3), budgetMs: 60_000 });

    const events = await db2.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "TMPV.NS"));
    expect(events).toHaveLength(1);
    // Backfilled: dated at its own quarter end, so it never raises a "results are out" alert.
    expect(events[0]).toMatchObject({ quarterEnd: "2026-06-30", detectedOn: "2026-06-30", data: { backfilled: true } });
    expect(events[0].data.previous?.quarterEnd).toBe("2026-03-31");

    // And it stays at one event: re-running does not duplicate it.
    const d4 = weekday(D1, 3);
    m2.advance(d4);
    await runNightly({ provider: m2.provider, now: at(d4), budgetMs: 60_000 });
    expect(await db2.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "TMPV.NS"))).toHaveLength(1);
  });

  it("the nightly repair fills a symbol still waiting on its first backfill", async () => {
    // Maintenance runs on quiet days, so it is what repairs a symbol the weekend cron never reached.
    const db3 = await memoryDb();
    const u = await makeUser(db3, { email: "repair@test.nazar.dev", name: "Repair" });
    await makePortfolio(db3, u.id, [{ symbol: "HDFCBANK.NS", quantity: 10, avgPrice: 950 }]);
    const m3 = fakeMarket();

    // One session that collects the symbol but records no quarters.
    m3.state.day = D1;
    m3.advance(D1);
    m3.state.moves = { "*": 0.001 };
    await runNightly({ provider: m3.provider, now: at(D1), budgetMs: 60_000 });
    expect(await db3.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "HDFCBANK.NS"))).toHaveLength(0);

    // The provider recovers, and maintenance does the repair even though it is not a trading day.
    m3.state.quarters["HDFCBANK.NS"] = [q("2026-03-31", 22000, 4000, 5.2), q("2026-06-30", 24100, 4500, 5.8)];
    m3.advance(weekday(D1, 1));
    const r = await runMaintenance(m3.provider);
    expect(r.resultsBackfilled).toBeGreaterThanOrEqual(1);

    const events = await db3.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "HDFCBANK.NS"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ quarterEnd: "2026-06-30", data: { backfilled: true } });

    // Second run: nothing left to repair, and no duplicate.
    expect((await runMaintenance(m3.provider)).resultsBackfilled).toBe(0);
    expect(await db3.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "HDFCBANK.NS"))).toHaveLength(1);
  });

  it("the repair leaves symbols that can never have a results card alone", async () => {
    // Indices and funds have no company accounts. Re-collecting all of them every night would be
    // wasted provider calls for a card that can never appear.
    const db4 = await memoryDb();
    const u = await makeUser(db4, { email: "nocompany@test.nazar.dev", name: "No" });
    await makePortfolio(db4, u.id, [{ symbol: "INFY.NS", quantity: 5, avgPrice: 1500 }]);
    const m4 = fakeMarket();
    m4.state.day = D1;
    m4.state.quarters["INFY.NS"] = []; // a thin first fetch, as in the regression above
    m4.advance(D1);
    m4.state.moves = { "*": 0.001 };
    await runNightly({ provider: m4.provider, now: at(D1), budgetMs: 60_000 });
    expect(await db4.select().from(schema.resultsEvents).where(eq(schema.resultsEvents.symbol, "INFY.NS"))).toHaveLength(0);
    m4.advance(weekday(D1, 1));

    // A symbol with quarters again, so the only things left unrepaired are the indices.
    m4.state.quarters["INFY.NS"] = [q("2026-03-31", 42000, 7000, 16.9), q("2026-06-30", 45500, 7600, 18.3)];
    const first = await runMaintenance(m4.provider);
    expect(first.resultsBackfilled).toBe(1); // only INFY, not the 14 indices
    // And it settles: the second run finds nothing to do.
    expect((await runMaintenance(m4.provider)).resultsBackfilled).toBe(0);
  });
});
