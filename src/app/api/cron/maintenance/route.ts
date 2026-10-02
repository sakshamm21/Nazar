import { cronAuthorized } from "@/lib/cron";
import { runMaintenance } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Nightly housekeeping: expire demo visitors, prune rate limits, roll the demo market forward a day. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runMaintenance());
}
