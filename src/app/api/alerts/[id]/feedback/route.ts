import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { rateAlert } from "@/lib/repo/alerts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ rating: z.enum(["up", "down"]).nullable() });

/** 👍/👎 on an alert (null clears). Feeds H5 tuning and the North Star metric. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const { rating } = await parseBody(req, Body);
  await rateAlert(u.id, id, rating, "app");
  return json({ ok: true });
});
