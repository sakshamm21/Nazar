import { api, json, parseBody, requireUser } from "@/lib/http";
import { ManualAsset } from "@/lib/portfolio/manual-schema";
import { addManualAsset } from "@/lib/repo/portfolios";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Adds an asset with no price feed: a deposit, PPF or EPF balance, NPS, a bond, property, cash. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ id: await addManualAsset(u.id, id, await parseBody(req, ManualAsset)) });
});
