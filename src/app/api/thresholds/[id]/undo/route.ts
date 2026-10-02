import { api, json, requireUser } from "@/lib/http";
import { undoTuning } from "@/lib/repo/alerts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** H5 undo: restores the previous threshold and pauses auto-tuning for that alert type for 30 days. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ change: await undoTuning(u.id, id) });
});
