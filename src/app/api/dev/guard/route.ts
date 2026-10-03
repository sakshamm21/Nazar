import { z } from "zod";
import { classify } from "@/lib/ask/scope-guard";
import { allowedModelIds } from "@/lib/ask/openai-models";

export const runtime = "nodejs";

const Body = z.object({ text: z.string().min(1).max(2000), previousUser: z.string().max(500).optional(), previousAssistant: z.string().max(500).optional() });

/**
 * Runs ONLY the scope classifier — used by scripts/eval-guard.mjs to measure precision/recall.
 * Open in development; in production it requires `x-admin-key: $INSIGHTS_KEY`.
 */
export async function POST(req: Request) {
  const key = process.env.INSIGHTS_KEY;
  if (process.env.NODE_ENV === "production" && (!key || req.headers.get("x-admin-key") !== key)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const t = Date.now();
  const r = await classify(body.data.text, body.data, await allowedModelIds());
  return Response.json({ verdict: r.verdict, topic: r.topic, skipped: r.skipped ?? false, ms: Date.now() - t });
}
