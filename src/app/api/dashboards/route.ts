import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { createDashboard, listDashboards } from "@/lib/repo/dashboards";

export const runtime = "nodejs";

export const GET = api(async (req) => {
  const u = await requireUser(req);
  return json({ dashboards: await listDashboards(u.id) });
});

export const POST = api(async (req) => {
  const u = await requireUser(req);
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(40) }));
  return json({ dashboard: await createDashboard(u.id, name) });
});
