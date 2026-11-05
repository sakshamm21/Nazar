import "server-only";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { BENCHMARKS, DASH_PERIODS, defaultWidgets } from "@/lib/dashboards/compare";
import { badRequest, notFound } from "@/lib/errors";

/** Dashboards are the user's own: every call takes their id and touches nothing else. */
export type Dashboard = typeof schema.dashboards.$inferSelect;
export const MAX_DASHBOARDS = 8;
export const MAX_WIDGETS = 12;

export const Widget = z.object({
  id: z.string().min(1).max(64),
  portfolio: z.string().min(1).max(64),
  part: z.string().min(1).max(80),
  benchmark: z.enum(BENCHMARKS.map((b) => b.id) as [string, ...string[]]),
  period: z.enum(DASH_PERIODS.map((p) => p.id) as ["1M", "3M", "6M", "1Y"]),
});
export const Widgets = z.array(Widget).max(MAX_WIDGETS);

/** The user's dashboards, creating the first one on first use. */
export async function listDashboards(userId: string): Promise<Dashboard[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.dashboards).where(eq(schema.dashboards.userId, userId)).orderBy(asc(schema.dashboards.sortOrder), asc(schema.dashboards.createdAt));
  if (rows.length) return rows;
  const [first] = await db.insert(schema.dashboards).values({ id: randomUUID(), userId, name: "My dashboard", widgets: defaultWidgets(randomUUID) }).returning();
  return [first];
}

export async function createDashboard(userId: string, name: string) {
  const db = await getDb();
  const rows = await listDashboards(userId);
  if (rows.length >= MAX_DASHBOARDS) throw badRequest(`You can have up to ${MAX_DASHBOARDS} dashboards.`);
  const [row] = await db.insert(schema.dashboards).values({ id: randomUUID(), userId, name: name.trim(), sortOrder: rows.length, widgets: defaultWidgets(randomUUID).slice(0, 1) }).returning();
  return row;
}

export async function updateDashboard(userId: string, id: string, patch: { name?: string; widgets?: z.infer<typeof Widgets> }) {
  const db = await getDb();
  const [row] = await db
    .update(schema.dashboards)
    .set({ ...(patch.name != null ? { name: patch.name.trim() } : {}), ...(patch.widgets ? { widgets: patch.widgets } : {}), updatedAt: new Date() })
    .where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.userId, userId)))
    .returning();
  if (!row) throw notFound("Dashboard not found.");
  return row;
}

export async function deleteDashboard(userId: string, id: string) {
  const db = await getDb();
  const rows = await listDashboards(userId);
  if (!rows.some((r) => r.id === id)) throw notFound("Dashboard not found.");
  if (rows.length <= 1) throw badRequest("Keep at least one dashboard. Change its comparisons instead.");
  const gone = await db.delete(schema.dashboards).where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.userId, userId))).returning({ id: schema.dashboards.id });
  if (!gone.length) throw notFound("Dashboard not found.");
}
