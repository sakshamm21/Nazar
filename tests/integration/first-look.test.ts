/**
 * First look: a new user's stocks are fetched straight away (not tonight), with a real beta.
 * Regression: a holiday checkup stores today's Nifty quote but no history; the first look must
 * still fetch the Nifty's history, and before the stocks, or every beta comes out empty.
 */
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { istDate } from "@/lib/data/provider";
import { NIFTY } from "@/lib/instruments/sectors";
import { prevWeekday } from "@/lib/market/store";
import { collectQuotes } from "@/lib/pipeline/collect";
import { firstLook } from "@/lib/pipeline/first-look";
import { fakeMarket } from "./fake-market";
import { memoryDb } from "./harness";

let db: DB;
const m = fakeMarket();

beforeAll(async () => {
  db = await memoryDb();
  m.state.day = prevWeekday(istDate(new Date()));
  // What a holiday checkup leaves behind: the Nifty's quote, no history.
  await collectQuotes(db, m.provider, [NIFTY], "live");
}, 120_000);

const latest = async (symbol: string) =>
  (await db.select().from(schema.symbolSnapshots).where(and(eq(schema.symbolSnapshots.symbol, symbol), eq(schema.symbolSnapshots.source, "live"))).orderBy(desc(schema.symbolSnapshots.tradeDate)).limit(1))[0];

describe("first look for newly added stocks", () => {
  it("fetches the Nifty's history first, so beta is there from day one", async () => {
    const r = await firstLook(["INFY.NS", "TMPV.NS"], m.provider);
    expect(r.fetched).toBe(2);
    const nifty = await db.select().from(schema.priceDaily).where(and(eq(schema.priceDaily.symbol, NIFTY), eq(schema.priceDaily.source, "live")));
    expect(nifty.length).toBeGreaterThan(200);
    const infy = await latest("INFY.NS");
    expect(infy.price).not.toBeNull();
    expect(infy.beta).toBeGreaterThan(0.6);
    expect(infy.beta).toBeLessThan(1.0); // the fake market's Infosys beta is 0.8
    expect((await latest("TMPV.NS")).beta).toBeGreaterThan(1.1);
  });

  it("runs once per symbol, ever (never per page view)", async () => {
    const before = m.state.calls.summary;
    expect(await firstLook(["INFY.NS", "TMPV.NS"], m.provider)).toEqual({ fetched: 0 });
    expect(m.state.calls.summary).toBe(before);
  });

  it("reuses stored Nifty history for later imports", async () => {
    const before = m.state.calls.history;
    expect((await firstLook(["HDFCBANK.NS"], m.provider)).fetched).toBe(1);
    expect(m.state.calls.history - before).toBe(1); // only HDFC Bank's own history
  });
});
