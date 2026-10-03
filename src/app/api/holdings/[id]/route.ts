import { z } from "zod";
import { api, json, requireUser } from "@/lib/http";
import { ManualAsset } from "@/lib/portfolio/manual-schema";
import { deleteHolding, updateHolding } from "@/lib/repo/portfolios";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** A manual asset is edited as a whole ({ manual }); a market holding by quantity, average price and date. */
const Manual = z.object({ manual: ManualAsset });
const Patch = z.object({
  quantity: z.number().positive().max(1e9).optional(),
  avgPrice: z.number().positive().max(1e8).optional(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const PATCH = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  await updateHolding(u.id, id, body && typeof body === "object" && "manual" in body ? Manual.parse(body) : Patch.parse(body));
  return json({ ok: true });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await deleteHolding(u.id, id);
  return json({ ok: true });
});
