import "server-only";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { track } from "@/lib/events";
import { MANUAL_PREFIX, isManualSymbol, type ManualClass, type ManualDetails } from "@/lib/instruments/asset-classes";
import { classOfSymbol } from "@/lib/instruments/catalog";

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

/** Buying more of something already held: the units add up and the average price is weighted by units. */
export function mergeLot(held: { quantity: number; avgPrice: number; buyDate: string | null }, bought: { quantity: number; avgPrice: number; buyDate?: string | null }) {
  const quantity = held.quantity + bought.quantity;
  const dates = [held.buyDate, bought.buyDate].filter((d): d is string => !!d).sort();
  return { quantity, avgPrice: (held.quantity * held.avgPrice + bought.quantity * bought.avgPrice) / quantity, buyDate: dates[0] ?? null };
}

/**
 * Saves holdings. A symbol appears once per portfolio, so when it is already held:
 *   "replace" (a broker import, which states the whole position) overwrites it;
 *   "add" (adding by hand) treats the new entry as a further purchase and merges it in.
 */
export async function upsertHoldings(userId: string, portfolioId: string, items: HoldingInput[], mode: "replace" | "add" = "replace") {
  await requirePortfolio(userId, portfolioId);
  const db = await getDb();
  items = items.filter((it) => !isManualSymbol(it.symbol.toUpperCase()));
  if (mode === "add") {
    const held = new Map((await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId))).map((h) => [h.symbol, h]));
    // The same symbol twice in one request is two purchases too.
    const merged = new Map<string, HoldingInput>();
    for (const it of items) {
      const symbol = it.symbol.toUpperCase();
      const prior = merged.get(symbol) ?? held.get(symbol);
      merged.set(symbol, prior ? { ...it, ...mergeLot({ quantity: prior.quantity, avgPrice: prior.avgPrice, buyDate: prior.buyDate ?? null }, it) } : it);
    }
    items = [...merged.values()];
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId));
  if (Number(n) + items.length > MAX_HOLDINGS * 2) throw badRequest(`A portfolio can have up to ${MAX_HOLDINGS} holdings.`);
  for (const it of items) {
    await db
      .insert(schema.holdings)
      .values({ id: randomUUID(), portfolioId, symbol: it.symbol.toUpperCase(), assetClass: classOfSymbol(it.symbol) ?? "stock", quantity: it.quantity, avgPrice: it.avgPrice, buyDate: it.buyDate ?? null, isin: it.isin ?? null, rawName: it.rawName ?? null, source: it.source ?? "manual" })
      .onConflictDoUpdate({
        target: [schema.holdings.portfolioId, schema.holdings.symbol],
        set: { quantity: it.quantity, avgPrice: it.avgPrice, buyDate: it.buyDate ?? null, isin: it.isin ?? null, rawName: it.rawName ?? null, source: it.source ?? "manual", updatedAt: new Date() },
      });
  }
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId));
  if (Number(total) > MAX_HOLDINGS) throw badRequest(`A portfolio can have up to ${MAX_HOLDINGS} holdings.`);
  return listHoldings(userId, portfolioId);
}

export type ManualAssetInput = { assetClass: ManualClass; name: string; invested: number; value: number; valueAsOf: string; ratePct?: number | null; startDate?: string | null; maturityDate?: string | null };

const manualColumns = (a: ManualAssetInput) => ({
  assetClass: a.assetClass,
  rawName: a.name.trim(),
  quantity: 1,
  avgPrice: a.invested,
  buyDate: a.startDate ?? null,
  details: { value: a.value, valueAsOf: a.valueAsOf, ratePct: a.ratePct ?? null, maturityDate: a.maturityDate ?? null } satisfies ManualDetails,
});

/** Adds an asset with no price feed (deposit, provident fund, property, cash…). */
export async function addManualAsset(userId: string, portfolioId: string, input: ManualAssetInput) {
  await requirePortfolio(userId, portfolioId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.holdings).where(eq(schema.holdings.portfolioId, portfolioId));
  if (Number(n) >= MAX_HOLDINGS) throw badRequest(`A portfolio can have up to ${MAX_HOLDINGS} holdings.`);
  const id = randomUUID();
  await db.insert(schema.holdings).values({ id, portfolioId, symbol: `${MANUAL_PREFIX}${id.toUpperCase()}`, source: "manual", ...manualColumns(input) });
  track(userId, "manual_asset_added", { assetClass: input.assetClass });
  return id;
}

export async function updateHolding(userId: string, holdingId: string, patch: Partial<{ quantity: number; avgPrice: number; buyDate: string | null }> | { manual: ManualAssetInput }) {
  const h = await requireHolding(userId, holdingId);
  const db = await getDb();
  const manual = isManualSymbol(h.symbol);
  if ("manual" in patch !== manual) throw badRequest("That change doesn't fit this kind of holding.");
  await db.update(schema.holdings).set({ ...("manual" in patch ? manualColumns(patch.manual) : patch), updatedAt: new Date() }).where(eq(schema.holdings.id, h.id));
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
