import { z } from "zod";
import { CLIENT_EVENTS, track } from "@/lib/events";
import { badRequest } from "@/lib/errors";
import { api, json, parseBody, requireUser } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({
  type: z.string().max(40),
  chatId: z.string().max(64).optional(),
  props: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});

/** Client-side product events: allow-listed types only, small flat props. */
export const POST = api(async (req) => {
  const u = await requireUser(req);
  const { type, chatId, props } = await parseBody(req, Body);
  if (!CLIENT_EVENTS.has(type)) throw badRequest("Unknown event.");
  track(u.id, type, Object.fromEntries(Object.entries(props ?? {}).slice(0, 10)), chatId);
  return json({ ok: true });
});
