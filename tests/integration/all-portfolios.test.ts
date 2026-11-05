/**
 * "All portfolios": every portfolio as one, with a stock held in two of them counted once, and the
 * view the app opens on when someone has more than one portfolio.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { ALL, buildPortfolioView, mergeHoldings } from "@/lib/views/portfolio";
import { makePortfolio, makeUser, memoryDb, type TestUser } from "./harness";

let db: DB;
let user: TestUser;

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "all@test.nazar.dev" });
  await makePortfolio(db, user.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 1000, buyDate: "2024-01-01" }], { name: "Main", isDefault: true });
  await makePortfolio(db, user.id, [{ symbol: "INFY.NS", quantity: 10, avgPrice: 2000, buyDate: "2025-01-01" }, { symbol: "TCS.NS", quantity: 5, avgPrice: 3000, buyDate: "2025-02-01" }], { name: "Second" });
}, 120_000);

describe("all portfolios together", () => {
  it("one symbol in two portfolios is one position, with every purchase kept", async () => {
    const rows = await db.select().from(schema.holdings);
    const lots = new Map(rows.map((r) => [r.id, [{ quantity: r.quantity, price: r.avgPrice, date: r.buyDate! }]]));
    const m = mergeHoldings(rows, lots);
    const infy = m.rows.find((r) => r.symbol === "INFY.NS")!;
    expect(m.rows).toHaveLength(2);
    expect(infy).toMatchObject({ quantity: 20, avgPrice: 1500, buyDate: "2024-01-01" });
    expect(m.lots.get(infy.id)).toHaveLength(2);
  });

  it("is what opens when nothing was picked, and can be picked by name", async () => {
    const opened = await buildPortfolioView(user, null);
    expect(opened.active).toMatchObject({ id: ALL, combined: true });
    const picked = await buildPortfolioView(user, ALL);
    expect(picked.active?.id).toBe(ALL);
    const [main] = (await db.select().from(schema.portfolios)).filter((p) => p.name === "Main");
    expect((await buildPortfolioView(user, main.id)).active?.id).toBe(main.id);
  });
});
