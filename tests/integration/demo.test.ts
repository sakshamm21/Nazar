/**
 * The demo works with Yahoo down: everything is built from the committed fixture with the network
 * blocked. Checks the template (real engine replay + H5 learning), the public test accounts,
 * per-visitor isolation, and "Simulate a bad day" + reset.
 */
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema, type DB } from "@/lib/db";
import { findAdvice } from "@/lib/alerts/guard";
import { liveUniverse } from "@/lib/pipeline/collect";
import { createDemoVisitor, demoToday, ensureDemoMarket } from "@/lib/demo/seed";
import { DEMO_MINE, DEMO_PAPA, TEMPLATE_EMAIL, TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/demo/config";
import { resetSimulation, simulate } from "@/lib/demo/simulate";
import { latestTradeDate } from "@/lib/market/store";
import { memoryDb } from "./harness";

let db: DB;
let templateId: string;
const userByEmail = async (email: string) => (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
const count = async (table: typeof schema.alertEvents | typeof schema.holdings | typeof schema.reports, where: Parameters<ReturnType<DB["select"]>["from"]>[0] extends never ? never : any) =>
  (await db.select().from(table as any).where(where)).length;

beforeAll(async () => {
  db = await memoryDb();
  // Yahoo (and everything else) is "down" for this whole file.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network disabled in demo tests"); }));
  const r = await ensureDemoMarket(db);
  expect(r).toMatchObject({ today: demoToday(), rebuilt: true });
  templateId = (await userByEmail(TEMPLATE_EMAIL)).id;
}, 300_000);

afterAll(() => vi.unstubAllGlobals());

describe("demo market (offline, from the fixture)", () => {
  it("is dated so the latest session is the last weekday before today, and never touches live data", async () => {
    expect(await latestTradeDate(db, ["demo"])).toBe(demoToday());
    expect(await db.select().from(schema.symbolSnapshots).where(ne(schema.symbolSnapshots.source, "demo"))).toHaveLength(0);
    expect(await liveUniverse(db)).toEqual([]); // demo holdings never enter the live checkup
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rebuilding is idempotent within a day", async () => {
    expect(await ensureDemoMarket(db)).toMatchObject({ rebuilt: false });
  });
});

describe("the demo account (template)", () => {
  it("has both portfolios, Papa's in Hindi with a confirmed family recipient", async () => {
    const pfs = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, templateId));
    expect(pfs.map((p) => [p.name, p.language]).sort()).toEqual([["My portfolio", "en"], ["Papa's portfolio", "hi"]]);
    const papa = pfs.find((p) => p.ownerLabel === "Papa")!;
    expect(await count(schema.holdings, eq(schema.holdings.portfolioId, papa.id))).toBe(DEMO_PAPA.length);
    expect(await count(schema.holdings, eq(schema.holdings.portfolioId, pfs.find((p) => !p.ownerLabel)!.id))).toBe(DEMO_MINE.length);
    const [rec] = await db.select().from(schema.recipients).where(eq(schema.recipients.portfolioId, papa.id));
    expect(rec.confirmedAt).not.toBeNull();
  });
  it("has 60 sessions of real-engine alerts, every one advice-free in both languages", async () => {
    const alerts = await db.select().from(schema.alertEvents).where(eq(schema.alertEvents.userId, templateId));
    expect(alerts.length).toBeGreaterThan(40);
    expect(new Set(alerts.map((a) => a.type))).toEqual(expect.objectContaining({}));
    for (const t of ["stock_move", "portfolio_move", "results", "learned"]) expect(alerts.some((a) => a.type === t), t).toBe(true);
    for (const a of alerts) expect(findAdvice(`${a.titleEn}\n${a.bodyEn}\n${a.titleHi}\n${a.bodyHi}`), a.titleEn).toEqual([]);
    expect(alerts.filter((a) => a.isSimulated)).toHaveLength(0);
  });
  it("learned from its ratings (H5): small-move alerts raised to 5%", async () => {
    const changes = await db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.userId, templateId));
    const sm = changes.find((c) => c.alertType === "stock_move")!;
    expect(sm).toMatchObject({ oldValue: 2.5, newValue: 5, muted: false });
    expect(sm.messageEn).toBe("You found small-move alerts less useful, so I'll only alert you for moves above 5%.");
    expect(sm.evidence.below.useful / sm.evidence.below.total).toBeLessThanOrEqual(0.4);
  });
  it("has weekly reports, Papa's in Hindi, advice-free", async () => {
    const reports = await db.select().from(schema.reports).where(eq(schema.reports.userId, templateId));
    expect(reports.length).toBeGreaterThanOrEqual(2);
    for (const r of reports) expect(findAdvice(JSON.stringify(r.content))).toEqual([]);
    expect(JSON.stringify(reports.map((r) => r.content))).toMatch(/साप्ताहिक रिपोर्ट/);
  });
});

describe("public test accounts", () => {
  it("full accounts are demo clones; empty ones are real accounts on live data with email off", async () => {
    const templateAlerts = await count(schema.alertEvents, eq(schema.alertEvents.userId, templateId));
    for (const acc of TEST_ACCOUNTS) {
      const u = await userByEmail(acc.email);
      expect(await bcrypt.compare(TEST_PASSWORD, u.passwordHash!)).toBe(true);
      expect(u).toMatchObject({ isTestAccount: true, isDemo: acc.kind === "full", demoExpiresAt: null });
      const pfs = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, u.id));
      if (acc.kind === "full") {
        expect(pfs).toHaveLength(2);
        expect(await count(schema.alertEvents, eq(schema.alertEvents.userId, u.id))).toBe(templateAlerts);
      } else {
        expect(pfs).toHaveLength(0);
        const [s] = await db.select().from(schema.alertSettings).where(eq(schema.alertSettings.userId, u.id));
        expect(s.emailDigest).toBe(false);
      }
    }
  });
});

describe("Try the demo: one isolated account per visitor", () => {
  let a: string, b: string;
  beforeAll(async () => {
    a = await createDemoVisitor(db);
    b = await createDemoVisitor(db);
  }, 120_000);

  it("expires in 24 hours and starts as a full copy with fresh ids", async () => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, a));
    expect(u.isDemo).toBe(true);
    expect(u.demoExpiresAt!.getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);
    const mineA = await db.select({ id: schema.alertEvents.id }).from(schema.alertEvents).where(eq(schema.alertEvents.userId, a));
    const tmpl = await db.select({ id: schema.alertEvents.id }).from(schema.alertEvents).where(eq(schema.alertEvents.userId, templateId));
    expect(mineA).toHaveLength(tmpl.length);
    expect(mineA.some((x) => tmpl.some((t) => t.id === x.id))).toBe(false);
    // The learned-threshold inbox message still points at this visitor's own change (Undo works).
    const [learned] = await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, a), eq(schema.alertEvents.type, "learned")));
    const [change] = await db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.id, String(learned.data.thresholdChangeId)));
    expect(change.userId).toBe(a);
  });

  it("Simulate a bad day: explained alerts for this visitor only, then reset", async () => {
    const r = await simulate(a, "global-selloff");
    expect(r.alertIds.length).toBeGreaterThanOrEqual(3);
    const sim = await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, a), eq(schema.alertEvents.isSimulated, true)));
    expect(sim.map((x) => x.type)).toEqual(expect.arrayContaining(["stock_move", "portfolio_move"]));
    const shocked = sim.find((x) => x.type === "stock_move" && x.symbol === r.shocked)!;
    expect((shocked.data as { reason?: { kind: string } }).reason?.kind).toBe("company");
    for (const x of sim) expect(findAdvice(`${x.titleEn} ${x.bodyEn} ${x.titleHi} ${x.bodyHi}`)).toEqual([]);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, a));
    expect(u.simState).toMatchObject({ scenario: "global-selloff", date: r.simDate });

    // Nobody else sees it.
    for (const other of [b, templateId]) expect(await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, other), eq(schema.alertEvents.isSimulated, true)))).toHaveLength(0);
    expect(await db.select().from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.source, `sim:${b}`))).toHaveLength(0);

    await resetSimulation(a);
    expect(await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.userId, a), eq(schema.alertEvents.isSimulated, true)))).toHaveLength(0);
    expect(await db.select().from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.source, `sim:${a}`))).toHaveLength(0);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, a));
    expect(after.simState).toBeNull();
  });

  it("every scenario works offline", async () => {
    for (const s of ["global-selloff", "rate-shock", "company-shock"]) {
      const r = await simulate(b, s);
      expect(r.alertIds.length, s).toBeGreaterThan(0);
    }
    await resetSimulation(b);
  });

  it("simulation is refused for real accounts", async () => {
    const real = await userByEmail("new@nazar.dev");
    await expect(simulate(real.id, "global-selloff")).rejects.toThrow(/only available in demo/);
  });

  it("never used the network", () => {
    expect(fetch).not.toHaveBeenCalled();
  });
});
