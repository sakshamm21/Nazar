import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { recordIncome } from "@/lib/repo/income";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ amount: z.number().positive().max(1e10), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["dividend", "interest", "other"]) });

/** Records a dividend, interest or other payout on a holding. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ income: await recordIncome(u.id, id, await parseBody(req, Body)) });
});
