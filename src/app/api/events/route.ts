import { z } from "zod";
import { CLIENT_EVENTS, track } from "@/lib/analytics";
import { sessionFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

const Body = z.object({
  type: z.string().max(40),
  chatId: z.string().max(64).optional(),
  props: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});

/** Client-side product events (whitelisted types only, small flat props). */
export async function POST(req: Request) {
  const userId = (await sessionFromRequest(req))?.userId ?? null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success || !CLIENT_EVENTS.has(body.data.type)) return Response.json({ error: "Unknown event" }, { status: 400 });
  const props = Object.fromEntries(Object.entries(body.data.props ?? {}).slice(0, 10));
  track(userId, body.data.type, props, body.data.chatId);
  return Response.json({ ok: true });
}
