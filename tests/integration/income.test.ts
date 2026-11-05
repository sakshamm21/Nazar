/**
 * Income and a holding's history: dividends recorded by the user count in its return and outlive
 * it; one wrong purchase can be taken out without restating the rest.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as History from "@/app/api/holdings/[id]/history/route";
import * as Income from "@/app/api/holdings/[id]/income/route";
import * as Lot from "@/app/api/holdings/[id]/lots/[lotId]/route";
import { type DB } from "@/lib/db";
import { listHoldings, upsertHoldings } from "@/lib/repo/portfolios";
import { incomeForPortfolios } from "@/lib/repo/income";
import { returnsSummary } from "@/lib/views/portfolio";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let user: TestUser;
let pf: string;

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "income@test.nazar.dev" });
  pf = await makePortfolio(db, user.id, []);
  await upsertHoldings(user.id, pf, [{ symbol: "ITC.NS", quantity: 100, avgPrice: 400, buyDate: "2024-01-01" }]);
  await upsertHoldings(user.id, pf, [{ symbol: "ITC.NS", quantity: 50, avgPrice: 450, buyDate: "2025-01-01" }], "add");
}, 120_000);

const itc = async () => (await listHoldings(user.id, pf)).find((h) => h.symbol === "ITC.NS")!;
type H = { lots: { id: string; date: string }[]; income: { amount: number }[] };

describe("income on a holding", () => {
  it("is recorded and shows in the holding's history", async () => {
    const h = await itc();
    const res = await Income.POST(await request(`/api/holdings/${h.id}/income`, { user, method: "POST", body: { amount: 1575, date: "2025-06-01", kind: "dividend" } }), params(h.id));
    expect(res.status).toBe(200);
    const hist = (await (await History.GET(await request(`/api/holdings/${h.id}/history`, { user }), params(h.id))).json()) as H;
    expect(hist.income).toEqual([expect.objectContaining({ amount: 1575, kind: "dividend" })]);
    expect(hist.lots).toHaveLength(2);
  });

  it("refuses a future date and another user's holding", async () => {
    const h = await itc();
    expect((await Income.POST(await request(`/api/holdings/${h.id}/income`, { user, method: "POST", body: { amount: 1, date: "2999-01-01", kind: "dividend" } }), params(h.id))).status).toBe(400);
    const other = await makeUser(db, { email: "income-other@test.nazar.dev" });
    expect((await Income.POST(await request(`/api/holdings/${h.id}/income`, { user: other, method: "POST", body: { amount: 1, date: "2025-01-01", kind: "dividend" } }), params(h.id))).status).toBe(404);
  });

  it("taking out one purchase leaves the rest as they were", async () => {
    const h = await itc();
    const hist = (await (await History.GET(await request(`/api/holdings/${h.id}/history`, { user }), params(h.id))).json()) as H;
    const later = hist.lots.find((l) => l.date === "2025-01-01")!;
    expect((await Lot.DELETE(await request(`/api/holdings/${h.id}/lots/${later.id}`, { user, method: "DELETE" }), { params: Promise.resolve({ id: h.id, lotId: later.id }) })).status).toBe(200);
    expect(await itc()).toMatchObject({ quantity: 100, avgPrice: 400, buyDate: "2024-01-01" });
    // The last purchase still held can't be taken out this way.
    const left = (await (await History.GET(await request(`/api/holdings/${h.id}/history`, { user }), params(h.id))).json()) as H;
    expect((await Lot.DELETE(await request(`/api/holdings/${h.id}/lots/${left.lots[0].id}`, { user, method: "DELETE" }), { params: Promise.resolve({ id: h.id, lotId: left.lots[0].id }) })).status).toBe(400);
  });

  it("counts in the total return, in total and for the financial year", async () => {
    const income = await incomeForPortfolios([pf]);
    const r = returnsSummary(5000, [{ units: 10, price: 500, cost: 4000, date: "2025-05-01" }, { units: 1, price: 100, cost: 50, date: "2024-05-01" }], income, "2025-11-05");
    expect(r).toMatchObject({ fy: "2025-26", unrealised: 5000, realised: 1050, realisedThisYear: 1000, income: 1575, incomeThisYear: 1575, total: 5000 + 1050 + 1575 });
  });
});
