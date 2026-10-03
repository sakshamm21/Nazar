/**
 * Test accounts are ordinary accounts on live data: nothing is captured or hand-written. Here the
 * "live" source is the deterministic fake market, and the checks cover how a persona is built (the
 * real alert engine replayed over recent sessions, then the real tuner), that the accounts hold
 * every asset class, the nightly put-back, isolation between copies, and "Simulate a bad day".
 */
import bcrypt from "bcryptjs";
import { and, eq, inArray, ne } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { findAdvice } from "@/lib/alerts/guard";
import { route } from "@/lib/alerts/routing";
import { istDate } from "@/lib/data/provider";
import { PERSONAS, PERSONA_SYMBOLS, TEST_ACCOUNTS, TEST_PASSWORD, templateEmail } from "@/lib/demo/config";
import { createCopy, ensureTestAccounts } from "@/lib/demo/seed";
import { resetSimulation, simulate } from "@/lib/demo/simulate";
import { groupOf } from "@/lib/instruments/asset-classes";
import { latestTradeDate, prevWeekday } from "@/lib/market/store";
import { liveUniverse } from "@/lib/pipeline/collect";
import { fakeMarket, GENERIC } from "./fake-market";
import { makeUser, memoryDb } from "./harness";

let db: DB;
let investor: string, saver: string;
const m = fakeMarket();
const userByEmail = async (email: string) => (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
const holdingsOf = async (userId: string) => {
  const pfs = await db.select({ id: schema.portfolios.id }).from(schema.portfolios).where(eq(schema.portfolios.userId, userId));
  return pfs.length ? db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, pfs.map((p) => p.id))) : [];
};
const wanted = (id: keyof typeof PERSONAS) => PERSONAS[id].portfolios.reduce((a, p) => a + p.holdings.length + p.manual.length, 0);

beforeAll(async () => {
  db = await memoryDb();
  for (const s of PERSONA_SYMBOLS) GENERIC.add(s);
  m.state.day = prevWeekday(istDate(new Date()));
  const r = await ensureTestAccounts(db, { provider: m.provider });
  expect(r).toMatchObject({ rebuilt: true, built: ["investor", "saver"] });
  investor = (await userByEmail(templateEmail("investor"))).id;
  saver = (await userByEmail(templateEmail("saver"))).id;
}, 300_000);

describe("test accounts run on live data", () => {
  it("everything is priced from the live source, and their symbols are part of the nightly checkup", async () => {
    expect(await latestTradeDate(db, ["live"])).toBe(m.state.day);
    expect(await db.select().from(schema.symbolSnapshots).where(ne(schema.symbolSnapshots.source, "live"))).toHaveLength(0);
    expect(await liveUniverse(db)).toEqual(expect.arrayContaining(PERSONA_SYMBOLS));
  });

  it("are real accounts with the public password; persona accounts are full copies, the new user is empty", async () => {
    for (const acc of TEST_ACCOUNTS) {
      const u = await userByEmail(acc.email);
      expect(await bcrypt.compare(TEST_PASSWORD, u.passwordHash!)).toBe(true);
      expect(u).toMatchObject({ name: acc.name, isTestAccount: true, isDemo: false, demoExpiresAt: null });
      const held = await holdingsOf(u.id);
      if (acc.persona) {
        expect(held).toHaveLength(wanted(acc.persona));
        expect(await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, u.id))).toHaveLength(PERSONAS[acc.persona].portfolios.length);
      } else expect(held).toHaveLength(0);
      const [s] = await db.select().from(schema.alertSettings).where(eq(schema.alertSettings.userId, u.id));
      expect(s.emailDigest).toBe(false);
    }
  });

  it("the investor and the saver each hold every kind of asset, all of it priced", async () => {
    for (const email of ["demo@nazar.dev", "riya@nazar.dev"]) {
      const held = await holdingsOf((await userByEmail(email)).id);
      expect(new Set(held.map((h) => h.assetClass)), email).toEqual(expect.objectContaining(new Set()));
      for (const c of ["stock", "mf", "etf", "reit", "gold", "fd", "ppf", "epf"]) expect(held.some((h) => h.assetClass === c), `${email} ${c}`).toBe(true);
      expect(new Set(held.map((h) => groupOf(h.assetClass))).size).toBeGreaterThanOrEqual(7);
      for (const h of held) {
        expect(h.quantity, h.symbol).toBeGreaterThan(0);
        expect(h.avgPrice, h.symbol).toBeGreaterThan(0);
      }
    }
    const papa = (await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, investor))).find((p) => p.ownerLabel === "Papa")!;
    expect(papa.language).toBe("hi");
    expect((await db.select().from(schema.recipients).where(eq(schema.recipients.portfolioId, papa.id)))[0].confirmedAt).not.toBeNull();
  });

  it("their history is the real alert engine replayed over recent sessions, advice-free in both languages", async () => {
    const alerts = await db.select().from(schema.alertEvents).where(eq(schema.alertEvents.userId, investor));
    expect(alerts.length).toBeGreaterThan(15);
    expect(alerts.some((a) => a.type === "stock_move")).toBe(true);
    expect(new Set(alerts.map((a) => a.tradeDate)).size).toBeGreaterThan(8); // spread over many sessions
    for (const a of alerts) expect(findAdvice(`${a.titleEn}\n${a.bodyEn}\n${a.titleHi}\n${a.bodyHi}`), a.titleEn).toEqual([]);
    expect(alerts.filter((a) => a.isSimulated)).toHaveLength(0);
  });

  it("the tuner learned from the persona's ratings: small-move alerts raised to 5%", async () => {
    const changes = await db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.userId, investor));
    const sm = changes.find((c) => c.alertType === "stock_move")!;
    expect(sm).toMatchObject({ oldValue: 2.5, newValue: 5, muted: false });
    expect(sm.evidence.below.useful / sm.evidence.below.total).toBeLessThanOrEqual(0.4);
  });

  it("has weekly reports, Papa's in Hindi, advice-free", async () => {
    const reports = await db.select().from(schema.reports).where(eq(schema.reports.userId, investor));
    expect(reports.length).toBeGreaterThanOrEqual(2);
    for (const r of reports) expect(findAdvice(JSON.stringify(r.content))).toEqual([]);
    expect(JSON.stringify(reports.map((r) => r.content))).toMatch(/साप्ताहिक रिपोर्ट/);
    expect((await db.select().from(schema.reports).where(eq(schema.reports.userId, saver))).length).toBeGreaterThanOrEqual(1);
  });

  it("never emails anyone, not even a confirmed family member", () => {
    const targets = route({ kind: "report", owner: { email: "demo@nazar.dev", emailVerified: true, isDemo: true, emailDigest: true, quietMode: false, language: "en" }, portfolio: { alertsEnabled: true, language: "hi" }, recipients: [{ email: "papa@example.com", confirmed: true, unsubscribed: false }] });
    expect(targets).toEqual([{ channel: "inbox" }]);
  });
});

describe("the nightly put-back", () => {
  it("does nothing a second time on the same day", async () => {
    const before = m.state.calls.quotes;
    expect(await ensureTestAccounts(db, { provider: m.provider })).toMatchObject({ rebuilt: false });
    expect(m.state.calls.quotes).toBe(before);
  });

  it("the next day undoes whatever visitors changed, without rebuilding the personas", async () => {
    const u = await userByEmail("demo@nazar.dev");
    const [first] = await holdingsOf(u.id);
    await db.delete(schema.holdings).where(eq(schema.holdings.id, first.id));
    await simulate(u.id, "global-selloff");
    const alertsBefore = (await db.select().from(schema.alertEvents).where(eq(schema.alertEvents.userId, investor))).length;

    const r = await ensureTestAccounts(db, { provider: m.provider, now: new Date(Date.now() + 86400000) });
    expect(r).toMatchObject({ rebuilt: true, built: [] });
    expect(await holdingsOf(u.id)).toHaveLength(wanted("investor"));
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(after.simState).toBeNull();
    expect(await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, u.id), eq(schema.alertEvents.isSimulated, true)))).toHaveLength(0);
    expect((await db.select().from(schema.alertEvents).where(eq(schema.alertEvents.userId, investor))).length).toBe(alertsBefore);
  });
});

describe("copies of a persona are isolated from each other", () => {
  let a: string, b: string;
  beforeAll(async () => {
    a = await createCopy(db, "investor");
    b = await createCopy(db, "investor");
  }, 120_000);

  it("a copy has the same history under fresh ids", async () => {
    const mineA = await db.select({ id: schema.alertEvents.id }).from(schema.alertEvents).where(eq(schema.alertEvents.userId, a));
    const tmpl = await db.select({ id: schema.alertEvents.id }).from(schema.alertEvents).where(eq(schema.alertEvents.userId, investor));
    expect(mineA).toHaveLength(tmpl.length);
    expect(mineA.some((x) => tmpl.some((t) => t.id === x.id))).toBe(false);
    // The learned-threshold inbox message still points at this copy's own change (Undo works).
    const [learned] = await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, a), eq(schema.alertEvents.type, "learned")));
    const [change] = await db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.id, String(learned.data.thresholdChangeId)));
    expect(change.userId).toBe(a);
    // Each manual asset gets its own symbol, so two copies never collide.
    const manual = (await holdingsOf(a)).filter((h) => h.symbol.startsWith("MANUAL:")).map((h) => h.symbol);
    expect(manual.length).toBeGreaterThan(0);
    expect((await holdingsOf(b)).some((h) => manual.includes(h.symbol))).toBe(false);
  });

  it("Simulate a bad day: explained alerts for this account only, then reset", async () => {
    const r = await simulate(a, "global-selloff");
    expect(r.alertIds.length).toBeGreaterThanOrEqual(3);
    const sim = await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, a), eq(schema.alertEvents.isSimulated, true)));
    expect(sim.map((x) => x.type)).toEqual(expect.arrayContaining(["stock_move", "portfolio_move"]));
    const shocked = sim.find((x) => x.type === "stock_move" && x.symbol === r.shocked)!;
    expect((shocked.data as { reason?: { kind: string } }).reason?.kind).toBe("company");
    for (const x of sim) expect(findAdvice(`${x.titleEn} ${x.bodyEn} ${x.titleHi} ${x.bodyHi}`)).toEqual([]);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, a));
    expect(u.simState).toMatchObject({ scenario: "global-selloff", date: r.simDate });

    // Nobody else sees it, and live prices are untouched.
    for (const other of [b, investor]) expect(await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, other), eq(schema.alertEvents.isSimulated, true)))).toHaveLength(0);
    expect(await db.select().from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.source, `sim:${b}`))).toHaveLength(0);
    expect(await latestTradeDate(db, ["live"])).toBe(m.state.day);

    await resetSimulation(a);
    expect(await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, a), eq(schema.alertEvents.isSimulated, true)))).toHaveLength(0);
    expect(await db.select().from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.source, `sim:${a}`))).toHaveLength(0);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, a));
    expect(after.simState).toBeNull();
  });

  it("every scenario produces alerts", async () => {
    for (const s of ["global-selloff", "rate-shock", "company-shock"]) {
      const r = await simulate(b, s);
      expect(r.alertIds.length, s).toBeGreaterThan(0);
    }
    await resetSimulation(b);
  });

  it("simulation is refused for ordinary accounts", async () => {
    const real = await makeUser(db);
    await expect(simulate(real.id, "global-selloff")).rejects.toThrow(/only available in test accounts/);
  });
});
