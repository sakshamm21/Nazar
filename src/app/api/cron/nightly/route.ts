import { after } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runNightly } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The nightly checkup (vercel.json schedules it three times each weekday evening). Each call
 * advances the resumable pipeline under a 240s budget; if work remains it re-invokes itself, and
 * the later cron entries finish anything left over.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runNightly({ budgetMs: 240_000 });
  if (result.more) {
    const url = new URL(req.url);
    after(async () => {
      await fetch(`${url.origin}/api/cron/nightly`, { headers: { authorization: req.headers.get("authorization") ?? "" }, signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
    });
  }
  return Response.json(result);
}
