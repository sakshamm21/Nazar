/**
 * The purchase-lot ledger stays in step with the holdings it summarises: a broker import restates
 * the position, buying more records another lot, an edit restates the ledger, and deleting a holding
 * takes its lots with it.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as Holding from "@/app/api/holdings/[id]/route";
import * as Assets from "@/app/api/portfolios/[id]/assets/route";
import { schema, type DB } from "@/lib/db";
import { cashFlows, summarise } from "@/lib/portfolio/lots";
import { lotsForPortfolio } from "@/lib/repo/lots";
import { listHoldings, updateHolding, upsertHoldings } from "@/lib/repo/portfolios";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let user: TestUser;
let pf: string;

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "lots@test.nazar.dev" });
  pf = await makePortfolio(db, user.id, []);
}, 120_000);

const lotsOf = async (symbol: string) => {
  const holdings = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pf));
  const row = holdings.find((h) => h.symbol === symbol)!;
  const all = await lotsForPortfolio(pf);
  return { summary: summarise(all.get(row.id) ?? []), lots: (all.get(row.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1)) };
};

describe("the lot ledger", () => {
  it("a broker import records a lot matching the position it imported", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1500, buyDate: "2024-01-15", source: "zerodha" }]);
    const { summary, lots } = await lotsOf("INFY.NS");
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ quantity: 10, price: 1500, date: "2024-01-15" });
    expect(summary).toMatchObject({ quantity: 10, cost: 15000, buyDate: "2024-01-15" });
  });

  it("buying more records another lot, so each purchase keeps its own price and date", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1700, buyDate: "2024-06-15" }], "add");
    const { summary, lots } = await lotsOf("INFY.NS");
    expect(lots).toHaveLength(2);
    expect(lots.map((l) => l.date)).toEqual(["2024-01-15", "2024-06-15"]);
    // The summary still agrees with the lots it came from.
    expect(summary.quantity).toBe(20);
    expect(summary.cost).toBe(15000 + 17000);
    expect(summary.avgPrice).toBeCloseTo(32000 / 20, 6);
    expect(summary.buyDate).toBe("2024-01-15");
  });

  it("the instalments produce dated cash flows rather than one lump sum", async () => {
    const { lots } = await lotsOf("INFY.NS");
    const { flows, skipped } = cashFlows(lots, [], { date: "2025-01-15", amount: 38000 });
    expect(skipped).toBe(0);
    expect(flows).toEqual([
      { date: "2024-01-15", amount: -15000 },
      { date: "2024-06-15", amount: -17000 },
      { date: "2025-01-15", amount: 38000 },
    ]);
  });

  it("re-importing replaces the position and restates the ledger", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 25, avgPrice: 1900, buyDate: "2025-01-01", source: "zerodha" }]);
    const { summary, lots } = await lotsOf("INFY.NS");
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ quantity: 25, price: 1900, date: "2025-01-01" });
    expect(summary.quantity).toBe(25);
  });

  it("editing a holding restates the ledger to match the new summary", async () => {
    const [h] = (await listHoldings(user.id, pf)).filter((x) => x.symbol === "INFY.NS");
    await updateHolding(user.id, h.id, { quantity: 30, avgPrice: 2000, buyDate: "2025-02-02" });
    const { summary, lots } = await lotsOf("INFY.NS");
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ quantity: 30, price: 2000, date: "2025-02-02" });
    expect(summary).toMatchObject({ quantity: 30, cost: 60000 });
  });

  it("a manual asset is one contribution, tracked as one lot", async () => {
    const id = (await Assets.POST(await request(`/api/portfolios/${pf}/assets`, { user, method: "POST", body: { assetClass: "fd", name: "My FD", invested: 100000, value: 104000, valueAsOf: "2025-01-01", ratePct: 4 } }), params(pf))).headers.get("x-id") ?? "";
    expect(id).toBeDefined();
    const hs = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pf));
    const fd = hs.find((h) => h.symbol.startsWith("MANUAL:"))!;
    const all = await lotsForPortfolio(pf);
    expect(all.get(fd.id)).toHaveLength(1);
    expect(all.get(fd.id)![0]).toMatchObject({ quantity: 1, price: 100000 });
  });

  it("another user's edit never touches these lots", async () => {
    const intruder = await makeUser(db, { email: "intruder@test.nazar.dev" });
    const [h] = (await listHoldings(user.id, pf)).filter((x) => x.symbol === "INFY.NS");
      // Someone else's holding is simply not there, so the edit is refused and nothing changes.
      await expect(updateHolding(intruder.id, h.id, { quantity: 999 })).rejects.toThrow(/not found/i);
      const { summary } = await lotsOf("INFY.NS");
      expect(summary.quantity).toBe(30);
    });

  it("deleting a holding takes its lots with it", async () => {
    const [h] = (await listHoldings(user.id, pf)).filter((x) => x.symbol === "INFY.NS");
    await Holding.DELETE(await request(`/api/holdings/${h.id}`, { user, method: "DELETE" }), params(h.id));
    expect(await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.holdingId, h.id))).toHaveLength(0);
  });

  it("deleting a portfolio takes every lot in it", async () => {
      const another = await makePortfolio(db, user.id, [{ symbol: "TCS.NS", quantity: 4, avgPrice: 3000, buyDate: "2024-03-01" }], { name: "Second" });
      const before = await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.portfolioId, another));
      expect(before.length).toBeGreaterThan(0);
      await db.delete(schema.portfolios).where(eq(schema.portfolios.id, another));
      expect(await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.portfolioId, another))).toHaveLength(0);
    });
  });

describe("adding a holding through the API", () => {
  it("records its lot", async () => {
      // Exercised through the repository rather than the route: the route's after() hook needs a live
      // Next.js request scope, which a unit-level integration test does not have. The repository is
      // where the lot is written, and the route delegates straight to it.
      await upsertHoldings(user.id, pf, [{ symbol: "ITC.NS", quantity: 100, avgPrice: 400, buyDate: "2024-08-08" }]);
      const { lots } = await lotsOf("ITC.NS");
      expect(lots).toHaveLength(1);
      expect(lots[0]).toMatchObject({ quantity: 100, price: 400, date: "2024-08-08" });
    });
  });