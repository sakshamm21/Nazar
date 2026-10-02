import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { markRead } from "@/lib/repo/alerts";

export const runtime = "nodejs";

const Body = z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(64)).max(200)]) });

export const POST = api(async (req) => {
  const u = await requireUser(req);
  const { ids } = await parseBody(req, Body);
  await markRead(u.id, ids);
  return json({ ok: true });
});
