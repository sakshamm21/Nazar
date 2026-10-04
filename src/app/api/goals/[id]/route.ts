import { api, json, parseBody, requireUser } from "@/lib/http";
import { GoalPatch } from "@/lib/goals/schema";
import { deleteGoal, updateGoal } from "@/lib/repo/goals";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ goal: await updateGoal(u.id, id, await parseBody(req, GoalPatch)) });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await deleteGoal(u.id, id);
  return json({ ok: true });
});