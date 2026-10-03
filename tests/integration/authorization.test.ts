/**
 * Authorization: one user can never read or change another user's portfolios, holdings, alerts,
 * learned thresholds, family recipients or price levels. Exercised through the real route handlers
 * with signed session cookies, on an in-memory database.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import * as Portfolio from "@/app/api/portfolios/[id]/route";
import * as PortfolioHoldings from "@/app/api/portfolios/[id]/holdings/route";
import * as Recipient from "@/app/api/portfolios/[id]/recipient/route";
import * as Portfolios from "@/app/api/portfolios/route";
import * as Holding from "@/app/api/holdings/[id]/route";
import * as Alerts from "@/app/api/alerts/route";
import * as AlertFeedback from "@/app/api/alerts/[id]/feedback/route";
import * as AlertsRead from "@/app/api/alerts/read/route";
import * as Undo from "@/app/api/thresholds/[id]/undo/route";
import * as Targets from "@/app/api/targets/route";
import * as Account from "@/app/api/account/route";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let alice: TestUser, bob: TestUser, expired: TestUser;
let pid: string, holdingId: string, alertId: string, changeId: string, targetId: string;

beforeAll(async () => {
  db = await memoryDb();
  alice = await makeUser(db, { email: "alice@test.nazar.dev" });
  bob = await makeUser(db, { email: "bob@test.nazar.dev" });
  expired = await makeUser(db, { isDemo: true, demoExpiresAt: new Date(Date.now() - 60_000) });
  pid = await makePortfolio(db, alice.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1500 }], { language: "hi", ownerLabel: "Papa" });
  await makePortfolio(db, bob.id, [{ symbol: "TCS.NS", quantity: 5, avgPrice: 3500 }]);
  [{ id: holdingId }] = await db.select({ id: schema.holdings.id }).from(schema.holdings).where(eq(schema.holdings.portfolioId, pid));
  alertId = randomUUID();
  await db.insert(schema.alertEvents).values({ id: alertId, userId: alice.id, portfolioId: pid, type: "stock_move", symbol: "INFY.NS", severity: "important", tradeDate: "2026-10-01", dedupeKey: "k1", titleEn: "Infosys fell 5.0%", bodyEn: "b", titleHi: "t", bodyHi: "b", data: {} });
  changeId = randomUUID();
  await db.insert(schema.thresholdChanges).values({ id: changeId, userId: alice.id, alertType: "stock_move", oldValue: 2.5, newValue: 5, muted: false, evidence: { below: { useful: 0, total: 3 }, above: { useful: 2, total: 2 }, window: 5 }, messageEn: "m", messageHi: "m" });
  targetId = randomUUID();
  await db.insert(schema.priceTargets).values({ id: targetId, userId: alice.id, symbol: "INFY.NS", direction: "below", target: 1400 });
}, 120_000);

const status = async (p: Promise<Response>) => (await p).status;

describe("signed-out and expired sessions", () => {
  it("every protected endpoint answers 401 without a session", async () => {
    expect(await status(Portfolios.GET(await request("/api/portfolios")))).toBe(401);
    expect(await status(Alerts.GET(await request("/api/alerts")))).toBe(401);
    expect(await status(Portfolio.GET(await request(`/api/portfolios/${pid}`), params(pid)))).toBe(401);
    expect(await status(Targets.GET(await request("/api/targets")))).toBe(401);
  });
  it("a tampered cookie is rejected", async () => {
    const req = new Request("http://localhost/api/alerts", { headers: { cookie: "nazar_session=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.bad" } });
    expect(await status(Alerts.GET(req))).toBe(401);
  });
  it("a demo whose 24 hours are up is signed out", async () => {
    expect(await status(Alerts.GET(await request("/api/alerts", { user: expired })))).toBe(401);
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
  it("family recipient (H6)", async () => {
    expect(await status(Recipient.POST(await request(`/api/portfolios/${pid}/recipient`, { user: bob, method: "POST", body: { email: "x@y.in" } }), params(pid)))).toBe(404);
    expect(await status(Recipient.DELETE(await request(`/api/portfolios/${pid}/recipient`, { user: bob, method: "DELETE" }), params(pid)))).toBe(404);
    expect(await db.select().from(schema.recipients)).toHaveLength(0);
  });
  it("alerts: list, rate, mark read", async () => {
    const list = await (await Alerts.GET(await request(`/api/alerts?portfolio=${pid}`, { user: bob }))).json();
    expect(list.alerts).toHaveLength(0);
    expect(await status(AlertFeedback.POST(await request(`/api/alerts/${alertId}/feedback`, { user: bob, method: "POST", body: { rating: "down" } }), params(alertId)))).toBe(404);
    expect(await status(AlertsRead.POST(await request("/api/alerts/read", { user: bob, method: "POST", body: { ids: [alertId] } })))).toBe(200);
    const [a] = await db.select().from(schema.alertEvents).where(eq(schema.alertEvents.id, alertId));
    expect(a.readAt).toBeNull();
    expect(await db.select().from(schema.alertFeedback)).toHaveLength(0);
  });
  it("learned thresholds: undo (H5)", async () => {
    expect(await status(Undo.POST(await request(`/api/thresholds/${changeId}/undo`, { user: bob, method: "POST" }), params(changeId)))).toBe(404);
    const [c] = await db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.id, changeId));
    expect(c.undoneAt).toBeNull();
    // The owner can undo, and tuning is paused for that type.
    expect(await status(Undo.POST(await request(`/api/thresholds/${changeId}/undo`, { user: alice, method: "POST" }), params(changeId)))).toBe(200);
    const [t] = await db.select().from(schema.alertThresholds).where(eq(schema.alertThresholds.userId, alice.id));
    expect(t).toMatchObject({ alertType: "stock_move", value: 2.5, source: "manual" });
    expect(t.frozenUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
  });
  it("price levels", async () => {
    const mine = await (await Targets.GET(await request("/api/targets", { user: bob }))).json();
    expect(mine.targets).toHaveLength(0);
    expect(await status(Targets.DELETE(await request("/api/targets", { user: bob, method: "DELETE", body: { ids: [targetId] } })))).toBe(200);
    expect(await db.select().from(schema.priceTargets).where(eq(schema.priceTargets.id, targetId))).toHaveLength(1);
  });
  it("deleting your account removes only your data", async () => {
    expect(await status(Account.DELETE(await request("/api/account", { user: bob, method: "DELETE", body: { confirm: "DELETE" } })))).toBe(200);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, bob.id))).toHaveLength(0);
    expect(await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, alice.id))).toHaveLength(1);
    expect(await db.select().from(schema.alertEvents).where(eq(schema.alertEvents.userId, alice.id))).toHaveLength(1);
  });
});
