import "server-only";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { track } from "@/lib/events";
import { MAX_GOALS } from "@/lib/goals/schema";

/**
 * Savings goals. Every function takes the signed-in user's id and scopes by it, so one user can never
 * read or change another's goals. A goal is just an amount, a date and the user's own figures for
 * what has been saved and what is added each month: nothing is linked to holdings, because which
 * money counts towards a goal is the user's judgement.
 */
export type Goal = typeof schema.goals.$inferSelect;

export async function listGoals(userId: string) {
  const db = await getDb();
  return db.select().from(schema.goals).where(eq(schema.goals.userId, userId)).orderBy(asc(schema.goals.sortOrder), asc(schema.goals.createdAt));
}

async function requireGoal(userId: string, goalId: string): Promise<Goal> {
  const db = await getDb();
  const [g] = await db.select().from(schema.goals).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId))).limit(1);
  if (!g) throw notFound("Goal not found.");
  return g;
}

export type GoalInput = {
  name: string;
  target: number;
  byDate: string;
  saved?: number;
  savedAsOf?: string | null;
  monthly?: number | null;
  ratePct?: number | null;
  icon?: string | null;
};

export async function createGoal(userId: string, input: GoalInput) {
  const db = await getDb();
  const existing = await listGoals(userId);
  if (existing.length >= MAX_GOALS) throw badRequest(`You can track up to ${MAX_GOALS} goals.`);
  const id = randomUUID();
  await db.insert(schema.goals).values({
    id,
    userId,
    sortOrder: existing.length,
    name: input.name.trim(),
    target: input.target,
    byDate: input.byDate,
    saved: input.saved ?? 0,
    savedAsOf: input.savedAsOf ?? null,
    monthly: input.monthly ?? null,
    ratePct: input.ratePct ?? null,
    icon: input.icon ?? null,
  });
  track(userId, "goal_created", { target: input.target });
  return requireGoal(userId, id);
}

export async function updateGoal(userId: string, goalId: string, patch: Partial<GoalInput>) {
  await requireGoal(userId, goalId);
  const db = await getDb();
  await db.update(schema.goals).set({ ...columns(patch), updatedAt: new Date() }).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
  return requireGoal(userId, goalId);
}

/** Records what has been put away so far, leaving the target and date untouched. */
export async function recordProgress(userId: string, goalId: string, saved: number, savedAsOf: string) {
  await requireGoal(userId, goalId);
  const db = await getDb();
  await db.update(schema.goals).set({ saved, savedAsOf, updatedAt: new Date() }).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
  track(userId, "goal_progress", { goalId });
  return requireGoal(userId, goalId);
}

export async function deleteGoal(userId: string, goalId: string) {
  await requireGoal(userId, goalId);
  const db = await getDb();
  await db.delete(schema.goals).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
}

const columns = (i: Partial<GoalInput>) => ({
  ...(i.name != null ? { name: i.name.trim() } : {}),
  ...(i.target != null ? { target: i.target } : {}),
  ...(i.byDate != null ? { byDate: i.byDate } : {}),
  ...(i.saved != null ? { saved: i.saved } : {}),
  ...(i.savedAsOf !== undefined ? { savedAsOf: i.savedAsOf ?? null } : {}),
  ...(i.monthly !== undefined ? { monthly: i.monthly ?? null } : {}),
  ...(i.ratePct !== undefined ? { ratePct: i.ratePct ?? null } : {}),
  ...(i.icon !== undefined ? { icon: i.icon ?? null } : {}),
});