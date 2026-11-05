import { api, json, requireUser } from "@/lib/http";
import { deleteLot } from "@/lib/repo/sales";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; lotId: string }> };

/** Takes one purchase out of a holding. */
export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id, lotId } = await ctx.params;
  await deleteLot(u.id, id, lotId);
  return json({ ok: true });
});
