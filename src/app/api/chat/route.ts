import { z } from "zod";
import { runAsk } from "@/lib/ask/run";
import { api, parseBody, requireUser } from "@/lib/http";
import { ipHash } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  model: z.string().max(64).optional(),
  mode: z.enum(["simple", "pro"]).default("simple"),
  message: z.object({
    id: z.string().max(100),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).min(1).max(20),
  }),
});

/** The Ask stream. This only reads the request; everything Ask does with it is in runAsk. */
export const POST = api(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  // Only plain text from the user is accepted: no forged tool results, files or system messages.
  const text = body.message.parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("\n");
  return runAsk({ user, chatId: body.id, messageId: body.message.id, text, mode: body.mode, requestedModel: body.model, ip: ipHash(req), signal: req.signal });
});
