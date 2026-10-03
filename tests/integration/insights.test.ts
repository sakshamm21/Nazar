/**
 * The admin dashboard's numbers, on real SQL: who counts as a user, the activation funnel, which
 * screens are used, what people track, and the shared demo kept apart.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { getInsights, type Insights } from "@/lib/insights";
import { makePortfolio, makeUser, memoryDb } from "./harness";

let db: DB;
let r: Insights;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeAll(async () => {
  db = await memoryDb();
  // Asha: signed up this month, tracks stocks and a fund, reads Analysis, asks, comes back.
  const asha = await makeUser(db, { email: "asha@test.nazar.dev" });
  await makePortfolio(db, asha.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1500 }, { symbol: "TCS.NS", quantity: 5, avgPrice: 3500 }, { symbol: "MF:122639", quantity: 100, avgPrice: 80 }]);
  await db.update(schema.holdings).set({ assetClass: "mf", source: "cas" }).where(eq(schema.holdings.symbol, "MF:122639"));
  // Ben: signed up, never added anything.
  const ben = await makeUser(db, { email: "ben@test.nazar.dev" });
  // Old-timer: has a portfolio, last active two weeks ago.
  const old = await makeUser(db, { email: "old@test.nazar.dev", createdAt: ago(200) });
  await makePortfolio(db, old.id, [{ symbol: "ITC.NS", quantity: 100, avgPrice: 400 }]);
  // The shared demo: a test account whose activity must not count as a user's.
  const demo = await makeUser(db, { email: "demo@test.nazar.dev", isTestAccount: true });
  await makePortfolio(db, demo.id, [{ symbol: "SBIN.NS", quantity: 10, avgPrice: 800 }]);

  const ev = (userId: string, type: string, props: Record<string, unknown>, at: Date) => ({ id: randomUUID(), userId, type, props, createdAt: at });
  await db.insert(schema.events).values([
    ev(asha.id, "view", { area: "home" }, ago(0.1)),
    ev(asha.id, "view", { area: "analysis" }, ago(0.1)),
    ev(asha.id, "view", { area: "analysis" }, ago(3)),
    ev(asha.id, "analysis_period", { period: "3M" }, ago(3)),
    ev(asha.id, "question", { latencyMs: 4000, costUsd: 0.01, tools: ["getMyPortfolio"] }, ago(0.1)),
    ev(ben.id, "signed_in", {}, ago(1)),
    ev(old.id, "view", { area: "portfolio" }, ago(10)),
    ev(demo.id, "signed_in", { testAccount: true }, ago(1)),
    ev(demo.id, "view", { area: "analysis" }, ago(1)),
    ev(demo.id, "question", { latencyMs: 3000 }, ago(1)),
  ]);
  r = await getInsights();
}, 120_000);

describe("admin insights", () => {
  it("counts real users only, and the North Star is trackers active this week", () => {
    expect(r.kpis).toMatchObject({ realUsers: 3, trackers: 2, holdings: 4, portfolios: 2 });
    expect(r.nsm).toEqual({ value: 1, prev: 1 }); // Asha this week; the old-timer the week before
  });
  it("follows a new user from sign-up to a question", () => {
    expect(r.funnel.map((f) => [f.step, f.users])).toEqual([["Signed up", 2], ["Verified email", 2], ["Added a holding", 1], ["Opened Analysis", 1], ["Asked a question", 1]]);
  });
  it("shows which screens are used and which periods are picked", () => {
    expect(r.areas.find((a) => a.area === "Analysis")).toEqual({ area: "Analysis", views: 2, users: 1 });
    expect(r.areas.find((a) => a.area === "Portfolio")!.views).toBe(0); // ten days ago is outside the week
    expect(r.periods).toEqual([{ period: "3M", n: 1 }]);
  });
  it("describes what people track and how it got in", () => {
    expect(r.assets).toEqual([{ label: "Stocks", holdings: 3, users: 2 }, { label: "Mutual funds", holdings: 1, users: 1 }]);
    expect(r.sources.map((s) => [s.label, s.holdings])).toEqual([["Added by hand", 3], ["Mutual fund statement", 1]]);
    expect(r.mix.multiAsset).toBe(0.5);
  });
  it("counts returning users, and Ask across everyone", () => {
    expect(r.retention).toMatchObject({ active14: 3, returning14: 1 });
    expect(r.ask).toMatchObject({ questions7: 2, askers7: 2, portfolioToolShare: 0.5 });
  });
  it("reports the shared demo on its own", () => {
    expect(r.demo).toEqual({ signIns: 1, views: 1, analysisViews: 1, questions: 1 });
  });
  it("says so when there is no market data yet", () => {
    expect(r.data).toMatchObject({ latestSession: null, symbols: null, stale: [] });
  });
});
