import { checkAlerts } from "@/lib/alerts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json) — checks every user's alerts even when nobody has the app open,
 * so triggered alerts are waiting for users the next time they visit.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await checkAlerts();
  return Response.json({ ok: true });
}
