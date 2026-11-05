/**
 * A split or bonus issue changes the share count, not the money: quantities go up, prices down,
 * what was paid stays the same, the stored history is restated in new shares, and running the
 * check again changes nothing.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import type { MarketDataProvider } from "@/lib/data/provider";
import { applySplits } from "@/lib/pipeline/corporate-actions";
import { summarise } from "@/lib/portfolio/lots";
import { makePortfolio, makeUser, memoryDb, type TestUser } from "./harness";

const EX = "2026-06-10";
let db: DB;
let user: TestUser;
let pf: string;

/** A source that knows one 1:2 split and serves history already adjusted for it. */
const provider = {
  name: "stub",
  quotes: async () => [],
  summary: async () => { throw new Error("unused"); },
  annualFundamentals: async () => [],
  fx: async () => null,
  dailyHistory: async () => [{ date: "2026-06-08", close: 500, volume: 1 }, { date: "2026-06-09", close: 510, volume: 1 }, { date: "2026-06-10", close: 520, volume: 1 }],
  splits: async (symbol: string) => (symbol === "INFY.NS" ? [{ date: EX, ratio: 2 }] : []),
} satisfies MarketDataProvider;

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "splits@test.nazar.dev" });
  pf = await makePortfolio(db, user.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1000, buyDate: "2025-01-01" }]);
  const [h] = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pf));
  // One purchase recorded long before the split, one recorded after it (a broker file in new shares).
  await db.delete(schema.holdingLots).where(eq(schema.holdingLots.holdingId, h.id));
  await db.insert(schema.holdingLots).values([
    { id: "before", holdingId: h.id, portfolioId: pf, quantity: 10, price: 1000, date: "2025-01-01", remaining: 10, createdAt: new Date("2025-01-01T10:00:00Z") },
    { id: "after", holdingId: h.id, portfolioId: pf, quantity: 4, price: 520, date: "2026-06-11", remaining: 4, createdAt: new Date("2026-06-11T10:00:00Z") },
  ]);
  await db.update(schema.holdings).set({ quantity: 14 }).where(eq(schema.holdings.id, h.id));
  await db.insert(schema.priceDaily).values([{ symbol: "INFY.NS", date: "2026-06-08", source: "live", close: 1000 }, { symbol: "INFY.NS", date: "2026-06-09", source: "live", close: 1020 }]);
}, 120_000);

describe("a 1:2 split", () => {
  it("doubles the units bought before it at half the price, and leaves later ones alone", async () => {
    const r = await applySplits(db, provider, ["INFY.NS"], "2026-06-12");
    expect(r).toEqual({ checked: 1, applied: 1 });
    const lots = await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.portfolioId, pf));
    expect(lots.find((l) => l.id === "before")).toMatchObject({ quantity: 20, remaining: 20, price: 500 });
    expect(lots.find((l) => l.id === "after")).toMatchObject({ quantity: 4, remaining: 4, price: 520 });
    const [h] = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pf));
    expect(h.quantity).toBe(24);
    // What was paid in total is unchanged.
    expect(summarise(lots).cost).toBe(10 * 1000 + 4 * 520);
  });

  it("restates the stored prices before the ex-date in new shares", async () => {
    const rows = await db.select().from(schema.priceDaily).where(eq(schema.priceDaily.symbol, "INFY.NS"));
    expect(rows.find((x) => x.date === "2026-06-08")!.close).toBe(500);
    expect(rows.find((x) => x.date === "2026-06-09")!.close).toBe(510);
  });

  it("is applied once, however often the check runs", async () => {
    expect(await applySplits(db, provider, ["INFY.NS"], "2026-06-13")).toEqual({ checked: 1, applied: 0 });
    const [h] = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, pf));
    expect(h.quantity).toBe(24);
  });

  it("funds and gold are never checked", async () => {
    expect(await applySplits(db, provider, ["MF:122639", "CMD:GOLD24"], "2026-06-13")).toEqual({ checked: 0, applied: 0 });
  });
});
