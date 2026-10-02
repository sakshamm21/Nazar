import { cronAuthorized } from "@/lib/cron";
import { runWeekly } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Sunday weekly reports (H6): in-app plus email to each portfolio's recipients, in their language. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runWeekly({ budgetMs: 240_000 }));
}
