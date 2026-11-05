import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { Widgets, deleteDashboard, updateDashboard } from "@/lib/repo/dashboards";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({ name: z.string().trim().min(1).max(40).optional(), widgets: Widgets.optional() });

export const PATCH = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ dashboard: await updateDashboard(u.id, id, await parseBody(req, Patch)) });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await deleteDashboard(u.id, id);
  return json({ ok: true });
});
