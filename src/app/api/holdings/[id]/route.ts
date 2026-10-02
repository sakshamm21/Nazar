import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { deleteHolding, updateHolding } from "@/lib/repo/portfolios";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  quantity: z.number().positive().max(1e9).optional(),
  avgPrice: z.number().positive().max(1e8).optional(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const PATCH = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await updateHolding(u.id, id, await parseBody(req, Patch));
  return json({ ok: true });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await deleteHolding(u.id, id);
  return json({ ok: true });
});
