import { api, json, requireUser } from "@/lib/http";
import { listAlerts, unreadCount } from "@/lib/repo/alerts";

export const runtime = "nodejs";

export const GET = api(async (req) => {
  const u = await requireUser(req);
  const p = new URL(req.url).searchParams.get("portfolio");
  return json({ alerts: await listAlerts(u.id, { portfolioId: p }), unread: await unreadCount(u.id) });
});
