/**
 * Test accounts are ordinary accounts on live data: nothing is captured or hand-written. Here the
 * "live" source is the deterministic fake market, and the checks cover how a persona is built (the
 * real alert engine replayed over recent sessions, then the real tuner), that the accounts hold
 * every asset class, the nightly put-back, isolation between copies, and "Simulate a bad day".
 */
import bcrypt from "bcryptjs";
import { eq, inArray, ne } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { istDate } from "@/lib/data/provider";
import { PERSONAS, PERSONA_SYMBOLS, TEST_ACCOUNTS, TEST_PASSWORD, templateEmail } from "@/lib/demo/config";
import { createCopy, ensureTestAccounts } from "@/lib/demo/seed";
import { groupOf } from "@/lib/instruments/asset-classes";
import { latestTradeDate, prevWeekday } from "@/lib/market/store";
import { liveUniverse } from "@/lib/pipeline/collect";
import { fakeMarket, GENERIC } from "./fake-market";
import { memoryDb } from "./harness";

let db: DB;
let investor: string;
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
    }
  });

  it("the investor and the saver each hold every kind of asset, all of it priced", async () => {
    for (const email of ["demo@nazar.dev", "riya@nazar.dev"]) {
      const held = await holdingsOf((await userByEmail(email)).id);
      expect(new Set(held.map((h) => h.assetClass)), email).toEqual(expect.objectContaining(new Set()));
      for (const c of ["stock", "mf", "etf", "reit", "gold", "us", "crypto", "fd", "ppf", "epf"]) expect(held.some((h) => h.assetClass === c), `${email} ${c}`).toBe(true);
      expect(new Set(held.map((h) => groupOf(h.assetClass))).size).toBeGreaterThanOrEqual(9);
      for (const h of held) {
        expect(h.quantity, h.symbol).toBeGreaterThan(0);
        expect(h.avgPrice, h.symbol).toBeGreaterThan(0);
      }
    }
    // No family portfolio, nobody to email, and no alert history is built.
    expect((await db.select().from(schema.portfolios)).every((p) => p.ownerLabel == null)).toBe(true);
    expect(await db.select().from(schema.recipients)).toHaveLength(0);
    expect(await db.select().from(schema.alertEvents)).toHaveLength(0);
    expect(await db.select().from(schema.reports)).toHaveLength(0);
  });

  it("their recent sessions have stored prices, so charts and analysis have history on day one", async () => {
    const days = await db.selectDistinct({ d: schema.symbolSnapshots.tradeDate }).from(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.symbol, "HDFCBANK.NS"));
    expect(days.length).toBeGreaterThan(20);
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

    const r = await ensureTestAccounts(db, { provider: m.provider, now: new Date(Date.now() + 86400000) });
    expect(r).toMatchObject({ rebuilt: true, built: [] });
    expect(await holdingsOf(u.id)).toHaveLength(wanted("investor"));
  });
});

describe("copies of a persona are isolated from each other", () => {
  let a: string, b: string;
  beforeAll(async () => {
    a = await createCopy(db, "investor");
    b = await createCopy(db, "investor");
  }, 120_000);

  it("a copy has the same holdings under fresh ids", async () => {
    const [ha, hb, ht] = [await holdingsOf(a), await holdingsOf(b), await holdingsOf(investor)];
    expect(ha).toHaveLength(ht.length);
    expect(ha.some((x) => ht.some((t) => t.id === x.id))).toBe(false);
    // Each manual asset gets its own symbol, so two copies never collide.
    const manual = ha.filter((h) => h.symbol.startsWith("MANUAL:")).map((h) => h.symbol);
    expect(manual.length).toBeGreaterThan(0);
    expect(hb.some((h) => manual.includes(h.symbol))).toBe(false);
  });
});
