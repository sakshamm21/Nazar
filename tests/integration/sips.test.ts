/**
 * Monthly SIPs end to end: a plan is set on a holding through the API, the checkup adds each
 * instalment once at that day's price as its own purchase lot, and an import or a stop puts things
 * right when what Nazar expected is not what happened.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as SipRoute from "@/app/api/holdings/[id]/sip/route";
import { makeTools } from "@/lib/ask/tools";
import { schema, type DB } from "@/lib/db";
import { dueOnOrAfter } from "@/lib/portfolio/sip";
import { upsertHoldings } from "@/lib/repo/portfolios";
import { applyDueSips, setSip } from "@/lib/repo/sips";
import { sipsView } from "@/lib/views/sips";
import { makePortfolio, makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let user: TestUser;
let other: TestUser;
let pf: string;
const FUND = "MF:122639";

const holdingOf = async (symbol = FUND, portfolioId = pf) => (await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId))).find((h) => h.symbol === symbol)!;
const sipOf = async (holdingId: string) => (await db.select().from(schema.sips).where(eq(schema.sips.holdingId, holdingId)))[0];
const lotsOf = async (holdingId: string) => (await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.holdingId, holdingId))).sort((a, b) => (a.date < b.date ? -1 : 1));
const price = (date: string, close: number, symbol = FUND) => db.insert(schema.priceDaily).values({ symbol, date, source: "live", close }).onConflictDoNothing();
const put = async (u: TestUser | null, holdingId: string, body: unknown) => SipRoute.PUT(await request(`/api/holdings/${holdingId}/sip`, { user: u, method: "PUT", body }), params(holdingId));

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "sips@test.nazar.dev" });
  other = await makeUser(db, { email: "sips-other@test.nazar.dev" });
}, 120_000);

beforeEach(async () => {
  await db.delete(schema.portfolios).where(eq(schema.portfolios.userId, user.id));
  await db.delete(schema.priceDaily);
  pf = await makePortfolio(db, user.id, [{ symbol: FUND, quantity: 100, avgPrice: 80, buyDate: "2025-01-10" }]);
});

describe("setting a plan", () => {
  it("is saved for the holding's owner, starting from the next due date and never reaching back", async () => {
    const h = await holdingOf();
    const res = await put(user, h.id, { amount: 5000, dayOfMonth: 5 });
    expect(res.status).toBe(200);
    const sip = await sipOf(h.id);
    expect(sip).toMatchObject({ amount: 5000, dayOfMonth: 5, active: true, instalments: 0, invested: 0, portfolioId: pf });
    expect(sip.nextDue).toBe(dueOnOrAfter(5, new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)));
    // Nothing is added for the months before the plan existed.
    expect(await lotsOf(h.id)).toHaveLength(1);
  });

  it("is refused for someone else's holding, when signed out, and for an amount or day that makes no sense", async () => {
    const h = await holdingOf();
    expect((await put(other, h.id, { amount: 5000, dayOfMonth: 5 })).status).toBe(404);
    expect((await put(null, h.id, { amount: 5000, dayOfMonth: 5 })).status).toBe(401);
    expect((await put(user, h.id, { amount: 5, dayOfMonth: 5 })).status).toBe(400);
    expect((await put(user, h.id, { amount: 5000, dayOfMonth: 31 })).status).toBe(400);
    expect(await sipOf(h.id)).toBeUndefined();
  });

  it("is one per holding: setting it again changes it", async () => {
    const h = await holdingOf();
    await put(user, h.id, { amount: 5000, dayOfMonth: 5 });
    await put(user, h.id, { amount: 7500, dayOfMonth: 5 });
    expect(await db.select().from(schema.sips).where(eq(schema.sips.holdingId, h.id))).toHaveLength(1);
    expect((await sipOf(h.id)).amount).toBe(7500);
  });
});

describe("the checkup adding instalments", () => {
  const start = async (nextDue: string, extra: Partial<typeof schema.sips.$inferInsert> = {}) => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5 }, "2026-10-01");
    await db.update(schema.sips).set({ nextDue, ...extra }).where(eq(schema.sips.holdingId, h.id));
    return h;
  };

  it("adds the instalment at that day's price as its own lot, and moves the holding's units and average", async () => {
    const h = await start("2026-10-05");
    await price("2026-10-05", 100);
    expect(await applyDueSips(db, "2026-10-05")).toMatchObject({ plans: 1, added: 1, failed: 0 });
    const after = await holdingOf();
    expect(after.quantity).toBeCloseTo(150);
    // 100 units at 80 and 50 units at 100.
    expect(after.avgPrice).toBeCloseTo((100 * 80 + 50 * 100) / 150);
    const lots = await lotsOf(h.id);
    expect(lots).toHaveLength(2);
    expect(lots[1]).toMatchObject({ date: "2026-10-05", price: 100, sipId: (await sipOf(h.id)).id });
    expect(lots[1].quantity).toBeCloseTo(50);
    expect(await sipOf(h.id)).toMatchObject({ nextDue: "2026-11-05", instalments: 1, invested: 5000 });
  });

  it("adds it once, however many times the checkup runs", async () => {
    const h = await start("2026-10-05");
    await price("2026-10-05", 100);
    await applyDueSips(db, "2026-10-05");
    expect(await applyDueSips(db, "2026-10-05")).toMatchObject({ plans: 0, added: 0 });
    expect(await applyDueSips(db, "2026-10-20")).toMatchObject({ added: 0 });
    expect((await holdingOf()).quantity).toBeCloseTo(150);
    expect(await lotsOf(h.id)).toHaveLength(2);
  });

  it("waits for the price, then uses the next trading day when the due date was a holiday", async () => {
    const h = await start("2026-10-05");
    expect(await applyDueSips(db, "2026-10-05")).toMatchObject({ plans: 1, added: 0 });
    expect((await sipOf(h.id)).nextDue).toBe("2026-10-05");
    await price("2026-10-07", 125);
    expect(await applyDueSips(db, "2026-10-07")).toMatchObject({ added: 1 });
    expect((await lotsOf(h.id))[1]).toMatchObject({ date: "2026-10-07", price: 125 });
  });

  it("catches up months it missed, each at its own price", async () => {
    const h = await start("2026-08-05");
    await price("2026-08-05", 100);
    await price("2026-09-07", 125);
    await price("2026-10-05", 200);
    expect(await applyDueSips(db, "2026-10-10")).toMatchObject({ added: 3 });
    expect((await lotsOf(h.id)).slice(1).map((l) => [l.date, Math.round(l.quantity)])).toEqual([["2026-08-05", 50], ["2026-09-07", 40], ["2026-10-05", 25]]);
    expect(await sipOf(h.id)).toMatchObject({ nextDue: "2026-11-05", instalments: 3, invested: 15000 });
  });

  it("adds nothing for a paused plan, and nothing for the gap when it is resumed", async () => {
    const h = await start("2026-08-05", { active: false });
    await price("2026-08-05", 100);
    await price("2026-09-07", 100);
    expect(await applyDueSips(db, "2026-09-10")).toMatchObject({ plans: 0, added: 0 });
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5, active: true }, "2026-09-10");
    expect(await sipOf(h.id)).toMatchObject({ active: true, nextDue: "2026-10-05" });
    expect(await applyDueSips(db, "2026-09-10")).toMatchObject({ added: 0 });
  });

  it("ends on its end date and is switched off", async () => {
    const h = await start("2026-10-05", { endDate: "2026-10-31" });
    await price("2026-10-05", 100);
    await price("2026-11-05", 100);
    expect(await applyDueSips(db, "2026-11-10")).toMatchObject({ added: 1, ended: 1 });
    expect(await sipOf(h.id)).toMatchObject({ active: false, instalments: 1 });
  });
});

describe("when what Nazar expected is not what happened", () => {
  it("a broker import states the position and replaces the instalments Nazar added; the plan carries on", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5 }, "2026-10-01");
    await price("2026-10-05", 100);
    await applyDueSips(db, "2026-10-05");
    await upsertHoldings(user.id, pf, [{ symbol: FUND, quantity: 140, avgPrice: 85, buyDate: "2025-01-10", source: "cas" }], "replace");
    expect(await holdingOf()).toMatchObject({ quantity: 140, avgPrice: 85 });
    const lots = await lotsOf(h.id);
    expect(lots).toHaveLength(1);
    expect(lots[0].sipId).toBeNull();
    expect(await sipOf(h.id)).toMatchObject({ active: true, nextDue: "2026-11-05" });
  });

  it("stopping the plan keeps what was bought", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5 }, "2026-10-01");
    await price("2026-10-05", 100);
    await applyDueSips(db, "2026-10-05");
    expect((await SipRoute.DELETE(await request(`/api/holdings/${h.id}/sip`, { user: other, method: "DELETE" }), params(h.id))).status).toBe(404);
    expect((await SipRoute.DELETE(await request(`/api/holdings/${h.id}/sip`, { user, method: "DELETE" }), params(h.id))).status).toBe(200);
    expect(await sipOf(h.id)).toBeUndefined();
    expect((await holdingOf()).quantity).toBeCloseTo(150);
    expect(await lotsOf(h.id)).toHaveLength(2);
  });

  it("removing the holding removes its plan", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5 }, "2026-10-01");
    await db.delete(schema.holdings).where(eq(schema.holdings.id, h.id));
    expect(await sipOf(h.id)).toBeUndefined();
  });
});

describe("what Ask is told about the user's SIPs", () => {
  const ask = async (u: TestUser) => (makeTools(u.id).getSips as unknown as { execute: (i: unknown, o: unknown) => Promise<any> }).execute({}, { toolCallId: "t", messages: [] });

  it("is each plan, the monthly total, and what the added instalments are worth now", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5 }, "2026-10-01");
    await price("2026-10-05", 100);
    await applyDueSips(db, "2026-10-05");
    await db.insert(schema.symbolSnapshots).values({ symbol: FUND, tradeDate: "2026-10-06", source: "live", price: 110 } as typeof schema.symbolSnapshots.$inferInsert).onConflictDoNothing();
    const out = await ask(user);
    expect(out).toMatchObject({ totalEachMonth: 5000, activeSips: 1, pausedSips: 0, nextInstalmentOn: "2026-11-05", goals: null });
    expect(out.sips[0]).toMatchObject({ amountEachMonth: 5000, dayOfMonth: 5, status: "active", instalmentsAddedByNazar: 1, investedInThoseInstalments: 5000, thoseUnitsWorthNow: 5500, gainOnThoseInstalments: 500 });
    expect((await sipsView(user)).rows[0].gainPct).toBeCloseTo(0.1);
  });

  it("is nothing of anyone else's, and a plain note when there are none", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 5 }, "2026-10-01");
    const out = await ask(other);
    expect(out.sips).toEqual([]);
    expect(out.note).toMatch(/No SIPs/);
  });
});

describe("a SIP that began before today", () => {
  /** A market that traded every day from the start of 2026, at a price that rises a rupee a month. */
  const provider = (fail = false) =>
    ({
      name: "fake",
      async dailyHistory(_symbol: string, from: Date) {
        if (fail) throw new Error("provider down");
        const out: { date: string; close: number; volume: number | null }[] = [];
        for (let d = new Date(from); d <= new Date("2026-10-08T00:00:00Z"); d = new Date(d.getTime() + 86_400_000)) out.push({ date: d.toISOString().slice(0, 10), close: 100 + d.getUTCMonth(), volume: null });
        return out;
      },
    }) as unknown as Parameters<typeof setSip>[4];

  it("has every instalment since its start date added when it is set up, each at its own day's price", async () => {
    const h = await holdingOf();
    const { sip, added } = await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 10, startDate: "2026-06-01" }, "2026-10-08", provider());
    // 10 June, July, August, September. 10 October has not come yet.
    expect(added).toBe(4);
    expect(sip).toMatchObject({ startDate: "2026-06-01", instalments: 4, invested: 20000, nextDue: "2026-10-10", active: true });
    const lots = (await lotsOf(h.id)).filter((l) => l.sipId === sip.id);
    expect(lots.map((l) => [l.date, l.price])).toEqual([["2026-06-10", 105], ["2026-07-10", 106], ["2026-08-10", 107], ["2026-09-10", 108]]);
    const units = lots.reduce((a, l) => a + l.quantity, 0);
    const after = await holdingOf();
    // On top of the 100 units at 80 the holding had.
    expect(after.quantity).toBeCloseTo(100 + units);
    expect(after.avgPrice).toBeCloseTo((100 * 80 + 20000) / (100 + units));
    // The checkup then carries on from the next due date, adding nothing twice.
    expect(await applyDueSips(db, "2026-10-08")).toMatchObject({ plans: 0, added: 0 });
  });

  it("is refused for a start date in the future or absurdly far back, and nothing is saved", async () => {
    const h = await holdingOf();
    await expect(setSip(user.id, h.id, { amount: 5000, dayOfMonth: 10, startDate: "2026-12-01" }, "2026-10-08", provider())).rejects.toThrow(/future/);
    await expect(setSip(user.id, h.id, { amount: 5000, dayOfMonth: 10, startDate: "1990-01-01" }, "2026-10-08", provider())).rejects.toThrow(/years back/);
    expect(await sipOf(h.id)).toBeUndefined();
  });

  it("is not saved at all when past prices cannot be had, so nothing is half done", async () => {
    const h = await holdingOf();
    await expect(setSip(user.id, h.id, { amount: 5000, dayOfMonth: 10, startDate: "2026-06-01" }, "2026-10-08", provider(true))).rejects.toThrow(/past prices/);
    expect(await sipOf(h.id)).toBeUndefined();
    expect(await lotsOf(h.id)).toHaveLength(1);
    expect((await holdingOf()).quantity).toBe(100);
  });

  it("keeps its start date when the amount is changed later, and adds nothing again", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 10, startDate: "2026-06-01" }, "2026-10-08", provider());
    const { sip, added } = await setSip(user.id, h.id, { amount: 8000, dayOfMonth: 10, startDate: "2025-01-01" }, "2026-10-08", provider());
    expect(added).toBe(0);
    expect(sip).toMatchObject({ amount: 8000, startDate: "2026-06-01", instalments: 4 });
    expect(await lotsOf(h.id)).toHaveLength(5);
  });

  it("can be stopped with its instalments taken back out, leaving the holding as it was", async () => {
    const h = await holdingOf();
    await setSip(user.id, h.id, { amount: 5000, dayOfMonth: 10, startDate: "2026-06-01" }, "2026-10-08", provider());
    const res = await SipRoute.DELETE(await request(`/api/holdings/${h.id}/sip?undo=1`, { user, method: "DELETE" }), params(h.id));
    expect(await res.json()).toMatchObject({ ok: true, removedInstalments: 4 });
    expect(await sipOf(h.id)).toBeUndefined();
    const after = await holdingOf();
    expect(after.quantity).toBeCloseTo(100);
    expect(after.avgPrice).toBeCloseTo(80);
    expect(await lotsOf(h.id)).toHaveLength(1);
  });
});
