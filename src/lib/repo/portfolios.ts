import "server-only";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { track } from "@/lib/events";

/**
 * Portfolios, holdings and the Watching list. Every function takes the signed-in user's id and
 * scopes by it; portfolio-level calls go through requirePortfolio(), so one user can never read or
 * change another user's data (tests/integration/authorization.test.ts).
 */
export type Portfolio = typeof schema.portfolios.$inferSelect;
export type Holding = typeof schema.holdings.$inferSelect;

const MAX_PORTFOLIOS = 6;
const MAX_HOLDINGS = 100;

export async function listPortfolios(userId: string) {
  const db = await getDb();
  return db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, userId)).orderBy(asc(schema.portfolios.sortOrder), asc(schema.portfolios.createdAt));
}

/** The portfolio if it belongs to this user; otherwise a 404 (never reveals that it exists). */
export async function requirePortfolio(userId: string, portfolioId: string): Promise<Portfolio> {
  const db = await getDb();
  const [p] = await db.select().from(schema.portfolios).where(and(eq(schema.portfolios.id, portfolioId), eq(schema.portfolios.userId, userId))).limit(1);
  if (!p) throw notFound("Portfolio not found.");
  return p;
}

export async function createPortfolio(userId: string, input: { name: string; ownerLabel?: string | null; language?: "en" | "hi" }) {
  const db = await getDb();
  const existing = await listPortfolios(userId);
  if (existing.length >= MAX_PORTFOLIOS) throw badRequest(`You can track up to ${MAX_PORTFOLIOS} portfolios.`);
  const row = { id: randomUUID(), userId, name: input.name.trim(), ownerLabel: input.ownerLabel?.trim() || null, language: input.language ?? "en", isDefault: existing.length === 0, sortOrder: existing.length };
  await db.insert(schema.portfolios).values(row);
  track(userId, "portfolio_created", { family: Boolean(row.ownerLabel), language: row.language });
  return requirePortfolio(userId, row.id);
}

export async function updatePortfolio(userId: string, portfolioId: string, patch: Partial<{ name: string; ownerLabel: string | null; language: "en" | "hi"; alertsEnabled: boolean }>) {
  await requirePortfolio(userId, portfolioId);
  const db = await getDb();
  await db.update(schema.portfolios).set(patch).where(and(eq(schema.portfolios.id, portfolioId), eq(schema.portfolios.userId, userId)));
  return requirePortfolio(userId, portfolioId);
}

export async function deletePortfolio(userId: string, portfolioId: string) {
  const p = await requirePortfolio(userId, portfolioId);
  const db = await getDb();
  await db.delete(schema.portfolios).where(and(eq(schema.portfolios.id, p.id), eq(schema.portfolios.userId, userId)));
  if (p.isDefault) {
    const [next] = await listPortfolios(userId);
    if (next) await db.update(schema.portfolios).set({ isDefault: true }).where(eq(schema.portfolios.id, next.id));
  }
}

export async function listHoldings(userId: string, portfolioId: string): Promise<Holding[]> {
  await requirePortfolio(userId, portfolioId);
  const db = await getDb();
  return db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId)).orderBy(asc(schema.holdings.createdAt));
}

export type HoldingInput = { symbol: string; quantity: number; avgPrice: number; buyDate?: string | null; isin?: string | null; rawName?: string | null; source?: Holding["source"] };

/** Adds or replaces holdings (same symbol in the same portfolio is updated, not duplicated). */
export async function upsertHoldings(userId: string, portfolioId: string, items: HoldingInput[]) {
  await requirePortfolio(userId, portfolioId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId));
  if (Number(n) + items.length > MAX_HOLDINGS * 2) throw badRequest(`A portfolio can have up to ${MAX_HOLDINGS} stocks.`);
  for (const it of items) {
    await db
      .insert(schema.holdings)
      .values({ id: randomUUID(), portfolioId, symbol: it.symbol.toUpperCase(), quantity: it.quantity, avgPrice: it.avgPrice, buyDate: it.buyDate ?? null, isin: it.isin ?? null, rawName: it.rawName ?? null, source: it.source ?? "manual" })
      .onConflictDoUpdate({
        target: [schema.holdings.portfolioId, schema.holdings.symbol],
        set: { quantity: it.quantity, avgPrice: it.avgPrice, buyDate: it.buyDate ?? null, isin: it.isin ?? null, rawName: it.rawName ?? null, source: it.source ?? "manual", updatedAt: new Date() },
      });
  }
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId));
  if (Number(total) > MAX_HOLDINGS) throw badRequest(`A portfolio can have up to ${MAX_HOLDINGS} stocks.`);
  return listHoldings(userId, portfolioId);
}

export async function updateHolding(userId: string, holdingId: string, patch: Partial<{ quantity: number; avgPrice: number; buyDate: string | null }>) {
  const h = await requireHolding(userId, holdingId);
  const db = await getDb();
  await db.update(schema.holdings).set({ ...patch, updatedAt: new Date() }).where(eq(schema.holdings.id, h.id));
}

export async function deleteHolding(userId: string, holdingId: string) {
  const h = await requireHolding(userId, holdingId);
  const db = await getDb();
  await db.delete(schema.holdings).where(eq(schema.holdings.id, h.id));
}

async function requireHolding(userId: string, holdingId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ h: schema.holdings })
    .from(schema.holdings)
    .innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId))
    .where(and(eq(schema.holdings.id, holdingId), eq(schema.portfolios.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Holding not found.");
  return row.h;
}

/* ------------------------------------------------------------------ */
/* Watching (no quantity)                                              */
/* ------------------------------------------------------------------ */

export const WATCHING_MAX = 50;

export async function listWatching(userId: string) {
  const db = await getDb();
  return db.select().from(schema.watching).where(eq(schema.watching.userId, userId)).orderBy(asc(schema.watching.addedAt));
}

export async function addWatching(userId: string, symbols: string[]) {
  const db = await getDb();
  const cur = await listWatching(userId);
  const room = Math.max(0, WATCHING_MAX - cur.length);
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, room);
  if (list.length) await db.insert(schema.watching).values(list.map((symbol) => ({ userId, symbol }))).onConflictDoNothing();
  return listWatching(userId);
}

export async function removeWatching(userId: string, symbols: string[]) {
  const db = await getDb();
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (list.length) await db.delete(schema.watching).where(and(eq(schema.watching.userId, userId), inArray(schema.watching.symbol, list)));
  return listWatching(userId);
}
