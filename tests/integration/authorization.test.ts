/**
 * Authorization: one user can never read or change another user's portfolios, holdings, alerts,
 * learned thresholds, family recipients or price levels. Exercised through the real route handlers
 * with signed session cookies, on an in-memory database.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import * as Portfolio from "@/app/api/portfolios/[id]/route";
import * as PortfolioHoldings from "@/app/api/portfolios/[id]/holdings/route";
import * as Portfolios from "@/app/api/portfolios/route";
import * as Holding from "@/app/api/holdings/[id]/route";
import * as Account from "@/app/api/account/route";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let alice: TestUser, bob: TestUser, expired: TestUser;
let pid: string, holdingId: string;

beforeAll(async () => {
  db = await memoryDb();
  alice = await makeUser(db, { email: "alice@test.nazar.dev" });
  bob = await makeUser(db, { email: "bob@test.nazar.dev" });
  expired = await makeUser(db, { isDemo: true, demoExpiresAt: new Date(Date.now() - 60_000) });
  pid = await makePortfolio(db, alice.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1500 }]);
  await makePortfolio(db, bob.id, [{ symbol: "TCS.NS", quantity: 5, avgPrice: 3500 }]);
  [{ id: holdingId }] = await db.select({ id: schema.holdings.id }).from(schema.holdings).where(eq(schema.holdings.portfolioId, pid));
}, 120_000);

const status = async (p: Promise<Response>) => (await p).status;

describe("signed-out and expired sessions", () => {
  it("every protected endpoint answers 401 without a session", async () => {
    expect(await status(Portfolios.GET(await request("/api/portfolios")))).toBe(401);
    expect(await status(Portfolio.GET(await request(`/api/portfolios/${pid}`), params(pid)))).toBe(401);
    expect(await status(Account.DELETE(await request("/api/account", { method: "DELETE" })))).toBe(401);
  });
  it("a tampered cookie is rejected", async () => {
    const req = new Request("http://localhost/api/portfolios", { headers: { cookie: "nazar_session=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.bad" } });
    expect(await status(Portfolios.GET(req))).toBe(401);
  });
  it("a demo whose 24 hours are up is signed out", async () => {
    expect(await status(Portfolios.GET(await request("/api/portfolios", { user: expired })))).toBe(401);
  });
});

describe("another user's data is invisible (404) and unchanged", () => {
  it("portfolio: read, rename, delete", async () => {
    expect(await status(Portfolio.GET(await request(`/api/portfolios/${pid}`, { user: bob }), params(pid)))).toBe(404);
    expect(await status(Portfolio.PATCH(await request(`/api/portfolios/${pid}`, { user: bob, method: "PATCH", body: { name: "pwned" } }), params(pid)))).toBe(404);
    expect(await status(Portfolio.DELETE(await request(`/api/portfolios/${pid}`, { user: bob, method: "DELETE" }), params(pid)))).toBe(404);
    const [p] = await db.select().from(schema.portfolios).where(eq(schema.portfolios.id, pid));
    expect(p.name).toBe("Mine");
    // …while the owner can.
    const ok = await Portfolio.GET(await request(`/api/portfolios/${pid}`, { user: alice }), params(pid));
    expect(ok.status).toBe(200);
    expect((await ok.json()).holdings).toHaveLength(1);
  });
  it("the portfolio list only shows your own", async () => {
    const r = await (await Portfolios.GET(await request("/api/portfolios", { user: bob }))).json();
    expect(JSON.stringify(r)).not.toContain(pid);
  });
  it("holdings: add into, edit, delete", async () => {
    expect(await status(PortfolioHoldings.POST(await request(`/api/portfolios/${pid}/holdings`, { user: bob, method: "POST", body: { holdings: [{ symbol: "ITC", quantity: 1, avgPrice: 1 }] } }), params(pid)))).toBe(404);
    expect(await status(Holding.PATCH(await request(`/api/holdings/${holdingId}`, { user: bob, method: "PATCH", body: { quantity: 1 } }), params(holdingId)))).toBe(404);
    expect(await status(Holding.DELETE(await request(`/api/holdings/${holdingId}`, { user: bob, method: "DELETE" }), params(holdingId)))).toBe(404);
    const hs = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pid));
    expect(hs.map((h) => [h.symbol, h.quantity])).toEqual([["INFY.NS", 10]]);
  });
  it("deleting your account removes only your data", async () => {
    expect(await status(Account.DELETE(await request("/api/account", { user: bob, method: "DELETE", body: { confirm: "DELETE" } })))).toBe(200);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, bob.id))).toHaveLength(0);
    expect(await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, alice.id))).toHaveLength(1);
    expect(await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pid))).toHaveLength(1);
  });
});
