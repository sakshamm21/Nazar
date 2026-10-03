/**
 * Portfolios beyond stocks: mutual funds priced from a daily NAV, manual assets valued from what
 * the user entered, buying more of a holding, and the refresh that runs when the app is opened.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as addAsset } from "@/app/api/portfolios/[id]/assets/route";
import { PATCH as patchHolding } from "@/app/api/holdings/[id]/route";
import { schema, type DB } from "@/lib/db";
import { istDate, type MarketDataProvider } from "@/lib/data/provider";
import type { Quote } from "@/lib/data/yahoo";
import { NIFTY } from "@/lib/instruments/sectors";
import { loadPortfolioDay } from "@/lib/market/portfolio-day";
import { prevWeekday, shiftDate } from "@/lib/market/store";
import { collectQuotes } from "@/lib/pipeline/collect";
import { firstLook } from "@/lib/pipeline/first-look";
import { refreshFor } from "@/lib/pipeline/refresh";
import { listHoldings, upsertHoldings } from "@/lib/repo/portfolios";
import { fakeMarket } from "./fake-market";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

const FUND = "MF:122639";
let db: DB;
let user: TestUser, other: TestUser;
let pf: string;
const m = fakeMarket();
/** The fund's NAV as AMFI would publish it: dated the session before, with no previous close. */
const fund = { nav: 80, date: "" };

const provider: MarketDataProvider = {
  ...m.provider,
  async quotes(symbols) {
    const listed = await m.provider.quotes(symbols.filter((s) => s !== FUND));
    if (!symbols.includes(FUND)) return listed;
    const nav: Quote = { ...listed[0], symbol: FUND, name: "Test Flexi Cap Fund", price: fund.nav, previousClose: null, change: null, changePercent: null, volume: null, marketCap: null, asOf: `${fund.date}T10:00:00.000Z` };
    return [...listed, nav];
  },
  async dailyHistory(symbol, from) {
    if (symbol !== FUND) return m.provider.dailyHistory(symbol, from);
    // A fund that moves half as much as the market.
    const nifty = await m.provider.dailyHistory(NIFTY, from);
    return nifty.map((b) => ({ date: b.date, close: 80 * (1 + 0.5 * (b.close / nifty[0].close - 1)), volume: null }));
  },
};

const snapshot = async (symbol: string, date: string) => (await db.select().from(schema.symbolSnapshots).where(and(eq(schema.symbolSnapshots.symbol, symbol), eq(schema.symbolSnapshots.tradeDate, date), eq(schema.symbolSnapshots.source, "live"))))[0];

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db);
  other = await makeUser(db);
  pf = await makePortfolio(db, user.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1400 }]);
  m.state.day = prevWeekday(prevWeekday(istDate(new Date())));
  fund.date = prevWeekday(m.state.day);
}, 120_000);

describe("holdings beyond stocks", () => {
  it("adding by hand merges into what is already held; an import replaces it", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 30, avgPrice: 1600, buyDate: "2025-02-01" }], "add");
    let [infy] = await listHoldings(user.id, pf);
    expect(infy).toMatchObject({ quantity: 40, avgPrice: 1550, buyDate: "2025-02-01", assetClass: "stock" });
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 12, avgPrice: 1500 }], "replace");
    [infy] = await listHoldings(user.id, pf);
    expect(infy).toMatchObject({ quantity: 12, avgPrice: 1500 });
  });

  it("a fund gets its class from the catalogue, never from the request", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: FUND, quantity: 100, avgPrice: 70 }], "add");
    expect((await listHoldings(user.id, pf)).find((h) => h.symbol === FUND)?.assetClass).toBe("mf");
  });

  it("a NAV is pinned to the market session and gets its beta from its own history", async () => {
    await firstLook(["INFY.NS", FUND], provider);
    const s = await snapshot(FUND, m.state.day);
    expect(s.price).toBe(80); // dated yesterday by AMFI, shown under today's session
    expect(s.health).toBeNull();
    expect(s.beta).toBeGreaterThan(0.3);
    expect(s.beta).toBeLessThan(0.7);
    const [inst] = await db.select().from(schema.instruments).where(eq(schema.instruments.symbol, FUND));
    expect(inst).toMatchObject({ assetClass: "mf", sector: null });
  });

  it("the next session starts from yesterday's beta and health, and an unchanged NAV reads as no change", async () => {
    const before = await snapshot("INFY.NS", m.state.day);
    const day2 = prevWeekday(istDate(new Date()));
    m.advance(day2);
    await collectQuotes(db, provider, [NIFTY, "INFY.NS", FUND], "live"); // quotes only, as on opening the app
    const infy = await snapshot("INFY.NS", day2);
    expect(infy.beta).toBe(before.beta);
    expect(infy.health).toEqual(before.health);
    expect((await snapshot(FUND, day2)).changePct).toBe(0);
    // AMFI publishes the new NAV: the change is against what Nazar showed for the last session.
    fund.nav = 84;
    fund.date = m.state.day;
    await collectQuotes(db, provider, [NIFTY, FUND], "live");
    const f = await snapshot(FUND, day2);
    expect(f.price).toBe(84);
    expect(f.prevClose).toBe(80);
    expect(f.changePct).toBeCloseTo(0.05);
    expect(f.beta).toBeGreaterThan(0.3); // carried forward too
  });

  it("a deposit is added through the API, valued with interest, and counted in the portfolio", async () => {
    const start = shiftDate(m.state.day, -366);
    const res = await addAsset(await request(`/api/portfolios/${pf}/assets`, { user, method: "POST", body: { assetClass: "fd", name: "SBI FD", invested: 100_000, value: 100_000, valueAsOf: start, ratePct: 8, startDate: start } }), params(pf));
    expect(res.status).toBe(200);
    const holdings = await listHoldings(user.id, pf);
    const fd = holdings.find((h) => h.assetClass === "fd")!;
    expect(fd.symbol).toMatch(/^MANUAL:/);
    const day = await loadPortfolioDay(db, holdings, m.state.day, ["live"]);
    const row = day.holdings.find((h) => h.symbol === fd.symbol)!;
    expect(row).toMatchObject({ name: "SBI FD", assetClass: "fd", sector: "Fixed income", stale: false, beta: null });
    expect(row.price).toBeGreaterThan(108_000);
    expect(row.price).toBeLessThan(108_500);
    expect(day.holdings.find((h) => h.symbol === FUND)).toMatchObject({ assetClass: "mf", sector: "Mutual funds", price: 84, stale: false });

    // Editing it: a manual asset takes the whole form; a market-style patch is refused.
    const edit = await patchHolding(await request(`/api/holdings/${fd.id}`, { user, method: "PATCH", body: { manual: { assetClass: "fd", name: "SBI FD (renewed)", invested: 100_000, value: 120_000, valueAsOf: m.state.day } } }), params(fd.id));
    expect(edit.status).toBe(200);
    expect((await listHoldings(user.id, pf)).find((h) => h.id === fd.id)).toMatchObject({ rawName: "SBI FD (renewed)", details: { value: 120_000, ratePct: null } });
    expect((await patchHolding(await request(`/api/holdings/${fd.id}`, { user, method: "PATCH", body: { quantity: 5 } }), params(fd.id))).status).toBe(400);
  });

  it("another user's portfolio and holdings stay out of reach", async () => {
    const body = { assetClass: "cash", name: "Mine now", invested: 1, value: 1, valueAsOf: m.state.day };
    expect((await addAsset(await request(`/api/portfolios/${pf}/assets`, { user: other, method: "POST", body }), params(pf))).status).toBe(404);
    const [any] = await listHoldings(user.id, pf);
    expect((await patchHolding(await request(`/api/holdings/${any.id}`, { user: other, method: "PATCH", body: { quantity: 1 } }), params(any.id))).status).toBe(404);
    expect((await addAsset(await request(`/api/portfolios/${pf}/assets`, { user: null, method: "POST", body }), params(pf))).status).toBe(401);
  });
});

describe("refresh on open", () => {
  it("refreshes a user's prices once, then waits 15 minutes", async () => {
    const calls = m.state.calls.quotes;
    expect(await refreshFor(user, provider)).toEqual({ updated: true });
    expect(m.state.calls.quotes).toBeGreaterThan(calls);
    const after = m.state.calls.quotes;
    expect(await refreshFor(user, provider)).toEqual({ updated: false, reason: "fresh" });
    expect(m.state.calls.quotes).toBe(after);
  });
  it("never runs for demo accounts or empty portfolios", async () => {
    const calls = m.state.calls.quotes;
    expect(await refreshFor(await makeUser(db, { isDemo: true }), provider)).toMatchObject({ updated: false, reason: "demo" }); // legacy anonymous visitors
    expect(await refreshFor(other, provider)).toMatchObject({ updated: false, reason: "empty" });
    expect(m.state.calls.quotes).toBe(calls);
  });
});
