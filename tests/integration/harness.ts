/** Shared helpers for integration tests: an in-memory PGlite database, users, and signed requests. */
import { randomUUID } from "node:crypto";
import { createPglite, schema, setDbForTests, type DB } from "@/lib/db";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";

/** A fresh, migrated, in-memory database installed as the app's database. */
export async function memoryDb(): Promise<DB> {
  process.env.EMAIL_DISABLED = "1"; // never send real email from tests
  process.env.NEWS_ENABLED = "0"; // never call Google News from tests
  const db = await createPglite("memory://");
  setDbForTests(db);
  return db;
}

export type TestUser = typeof schema.users.$inferSelect;

export async function makeUser(db: DB, o: Partial<typeof schema.users.$inferInsert> = {}): Promise<TestUser> {
  const id = o.id ?? randomUUID();
  const [u] = await db
    .insert(schema.users)
    .values({ id, email: `${id.slice(0, 8)}@test.nazar.dev`, name: "Test", emailVerifiedAt: new Date(), ...o })
    .returning();
  return u;
}

export async function makePortfolio(db: DB, userId: string, holdings: { symbol: string; quantity: number; avgPrice: number; buyDate?: string }[], o: Partial<typeof schema.portfolios.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(schema.portfolios).values({ id, userId, name: "Mine", isDefault: true, ...o });
  for (const h of holdings) {
    const holdingId = randomUUID();
    const buyDate = h.buyDate ?? null;
    await db.insert(schema.holdings).values({ id: holdingId, portfolioId: id, buyDate, ...h });
    // Mirror the migration's backfill: a holding that predates the lots ledger still gets one lot,
    // so tests see the same ledger a real account would have.
    await db.insert(schema.holdingLots).values({ id: randomUUID(), holdingId, portfolioId: id, quantity: h.quantity, price: h.avgPrice, date: buyDate ?? new Date().toISOString().slice(0, 10), remaining: h.quantity });
  }
  return id;
}

/** A Request carrying the user's session cookie (or none). */
export async function request(url: string, opts: { user?: TestUser | null; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.user) headers.cookie = `${SESSION_COOKIE}=${await signSession({ userId: opts.user.id, isDemo: opts.user.isDemo, version: opts.user.sessionVersion })}`;
  return new Request(`http://localhost${url}`, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });
