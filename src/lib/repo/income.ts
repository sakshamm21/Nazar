import "server-only";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { istDate } from "@/lib/data/provider";
import { getDb, schema } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { track } from "@/lib/events";
import { displayName } from "@/lib/market/portfolio-day";
import { requireHolding } from "@/lib/repo/portfolios";

/**
 * Income a holding paid: dividends, interest, anything else. Recorded by the user, so it is exactly
 * what they say it was; it belongs to the portfolio and stays after the holding is sold.
 */
export type Income = typeof schema.holdingIncome.$inferSelect;
export type IncomeKind = Income["kind"];

export async function recordIncome(userId: string, holdingId: string, input: { amount: number; date: string; kind: IncomeKind }) {
  const h = await requireHolding(userId, holdingId);
  if (!(input.amount > 0)) throw badRequest("Enter the amount received.");
  if (input.date > istDate(new Date())) throw badRequest("Income can't be dated in the future.");
  const db = await getDb();
  const [inst] = await db.select().from(schema.instruments).where(eq(schema.instruments.symbol, h.symbol)).limit(1);
  const row = { id: randomUUID(), userId, portfolioId: h.portfolioId, holdingId: h.id, symbol: h.symbol, name: h.rawName && h.symbol.startsWith("MANUAL:") ? h.rawName : displayName(h.symbol, inst ?? null), kind: input.kind, amount: input.amount, date: input.date };
  await db.insert(schema.holdingIncome).values(row);
  track(userId, "income_recorded", { kind: input.kind });
  return row;
}

export async function deleteIncome(userId: string, id: string) {
  const db = await getDb();
  const gone = await db.delete(schema.holdingIncome).where(and(eq(schema.holdingIncome.id, id), eq(schema.holdingIncome.userId, userId))).returning({ id: schema.holdingIncome.id });
  if (!gone.length) throw notFound("Not found.");
}

export async function incomeForPortfolios(portfolioIds: string[]): Promise<Income[]> {
  if (!portfolioIds.length) return [];
  const db = await getDb();
  return db.select().from(schema.holdingIncome).where(inArray(schema.holdingIncome.portfolioId, portfolioIds)).orderBy(asc(schema.holdingIncome.date));
}

export async function incomeForUser(userId: string): Promise<Income[]> {
  const db = await getDb();
  return db.select().from(schema.holdingIncome).where(eq(schema.holdingIncome.userId, userId)).orderBy(asc(schema.holdingIncome.date));
}

export async function incomeForHolding(userId: string, holdingId: string): Promise<Income[]> {
  await requireHolding(userId, holdingId);
  const db = await getDb();
  const rows = await db.select().from(schema.holdingIncome).where(eq(schema.holdingIncome.holdingId, holdingId));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
