import { api, json, requireUser } from "@/lib/http";
import { deleteIncome } from "@/lib/repo/income";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await deleteIncome(u.id, id);
  return json({ ok: true });
});
