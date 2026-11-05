import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { recordSale, salesForHolding } from "@/lib/repo/sales";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  units: z.number().positive().max(1e9),
  price: z.number().positive().max(1e8),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Records a sale of part or all of a holding. Selling everything removes the holding; the sale stays. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  const { sale, removed } = await recordSale(u.id, id, body);
  return json({ sale, removed });
});

export const GET = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ sales: await salesForHolding(u.id, id) });
});
