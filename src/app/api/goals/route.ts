import { api, json, parseBody, requireUser } from "@/lib/http";
import { GoalBody } from "@/lib/goals/schema";
import { createGoal, listGoals } from "@/lib/repo/goals";

export const runtime = "nodejs";

/** The signed-in user's goals. */
export const GET = api(async (req) => {
  const u = await requireUser(req);
  return json({ goals: await listGoals(u.id) });
});

export const POST = api(async (req) => {
  const u = await requireUser(req);
  return json({ goal: await createGoal(u.id, await parseBody(req, GoalBody)) }, { status: 201 });
});