import { getUserId } from "@/lib/auth";
import { checkAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

/** Polled by the open app (~every minute): evaluates this user's alerts and returns newly triggered ones. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await checkAlerts(userId));
}
