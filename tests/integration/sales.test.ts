/**
 * A sale is a sale: the units come out of the oldest purchases, every other purchase keeps its own
 * date and price, the sale is stored with what it cost, and selling everything removes the holding
 * while the sale stays in the portfolio's history.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as Sales from "@/app/api/holdings/[id]/sales/route";
import * as Sip from "@/app/api/holdings/[id]/sip/route";
import { schema, type DB } from "@/lib/db";
import { summarise } from "@/lib/portfolio/lots";
import { lotsForPortfolio } from "@/lib/repo/lots";
import { listHoldings, upsertHoldings } from "@/lib/repo/portfolios";
import { salesForPortfolio } from "@/lib/repo/sales";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let user: TestUser;
let pf: string;

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "sales@test.nazar.dev" });
  pf = await makePortfolio(db, user.id, []);
}, 120_000);

const holdingOf = async (symbol: string) => (await listHoldings(user.id, pf)).find((h) => h.symbol === symbol);
const lotsOf = async (id: string) => ((await lotsForPortfolio(pf)).get(id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
const sell = async (id: string, body: unknown, as: TestUser = user) => Sales.POST(await request(`/api/holdings/${id}/sales`, { user: as, method: "POST", body }), params(id));

describe("recording a sale", () => {
  it("takes units from the oldest purchase first and keeps the others as they were", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1000, buyDate: "2023-01-10" }]);
    await upsertHoldings(user.id, pf, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1500, buyDate: "2024-06-10" }], "add");
    const h = (await holdingOf("INFY.NS"))!;
    const res = await sell(h.id, { units: 12, price: 1800, date: "2025-01-15" });
    expect(res.status).toBe(200);

    const lots = await lotsOf(h.id);
    expect(lots).toHaveLength(2);
    expect(lots.map((l) => [l.date, l.remaining])).toEqual([["2023-01-10", 0], ["2024-06-10", 8]]);
    const after = (await holdingOf("INFY.NS"))!;
    expect(after.quantity).toBe(8);
    expect(after.avgPrice).toBe(1500);
    expect(after.buyDate).toBe("2024-06-10");

    const [sale] = await salesForPortfolio(pf);
    expect(sale).toMatchObject({ symbol: "INFY.NS", units: 12, price: 1800, date: "2025-01-15", cost: 10 * 1000 + 2 * 1500 });
    expect(sale.parts).toEqual([{ date: "2023-01-10", units: 10, price: 1000 }, { date: "2024-06-10", units: 2, price: 1500 }]);
  });

  it("refuses more units than are held, a future date and a date before what is held", async () => {
    const h = (await holdingOf("INFY.NS"))!;
    expect((await sell(h.id, { units: 9, price: 1800, date: "2025-01-15" })).status).toBe(400);
    expect((await sell(h.id, { units: 1, price: 1800, date: "2999-01-01" })).status).toBe(400);
    expect((await sell(h.id, { units: 1, price: 1800, date: "2024-01-01" })).status).toBe(400);
    expect((await holdingOf("INFY.NS"))!.quantity).toBe(8);
  });

  it("selling everything removes the holding and keeps the sale", async () => {
    const h = (await holdingOf("INFY.NS"))!;
    const res = await sell(h.id, { units: 8, price: 2000, date: "2025-02-01" });
    expect(((await res.json()) as { removed: boolean }).removed).toBe(true);
    expect(await holdingOf("INFY.NS")).toBeUndefined();
    const sales = await salesForPortfolio(pf);
    expect(sales).toHaveLength(2);
    expect(sales[1]).toMatchObject({ units: 8, cost: 12000, holdingId: null });
  });

  it("another user can't sell this user's holding", async () => {
    await upsertHoldings(user.id, pf, [{ symbol: "TCS.NS", quantity: 5, avgPrice: 3000, buyDate: "2024-01-01" }]);
    const h = (await holdingOf("TCS.NS"))!;
    const intruder = await makeUser(db, { email: "sale-intruder@test.nazar.dev" });
    expect((await sell(h.id, { units: 1, price: 3000, date: "2025-01-01" }, intruder)).status).toBe(404);
    expect((await holdingOf("TCS.NS"))!.quantity).toBe(5);
  });

  it("a partial sale keeps SIP instalments, so taking the SIP out afterwards removes the right units", async () => {
    const h = (await holdingOf("TCS.NS"))!;
    // Two instalments a SIP added, then a sale that only touches the original purchase.
    await db.insert(schema.sips).values({ id: "sip-1", portfolioId: pf, holdingId: h.id, amount: 3000, dayOfMonth: 5, startDate: "2024-02-05", nextDue: "2024-04-05", instalments: 2, invested: 6000 });
    await db.insert(schema.holdingLots).values([
      { id: "l1", holdingId: h.id, portfolioId: pf, quantity: 1, price: 3000, date: "2024-02-05", remaining: 1, sipId: "sip-1" },
      { id: "l2", holdingId: h.id, portfolioId: pf, quantity: 1, price: 3000, date: "2024-03-05", remaining: 1, sipId: "sip-1" },
    ]);
    await db.update(schema.holdings).set({ quantity: 7 }).where(eq(schema.holdings.id, h.id));
    await sell(h.id, { units: 3, price: 3500, date: "2025-01-01" });
    const lots = await lotsOf(h.id);
    expect(lots).toHaveLength(3);
    expect(summarise(lots).quantity).toBe(4);

    const res = await Sip.DELETE(await request(`/api/holdings/${h.id}/sip?undo=1`, { user, method: "DELETE" }), params(h.id));
    expect(((await res.json()) as { removedInstalments: number }).removedInstalments).toBe(2);
    expect((await holdingOf("TCS.NS"))!.quantity).toBe(2);
  });
});
