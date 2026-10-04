import { api, json, parseBody, requireUser } from "@/lib/http";
import { GoalProgressBody } from "@/lib/goals/schema";
import { recordProgress } from "@/lib/repo/goals";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Records what has been put away so far, leaving the target and the date alone. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const { saved, savedAsOf } = await parseBody(req, GoalProgressBody);
  return json({ goal: await recordProgress(u.id, id, saved, savedAsOf) });
});