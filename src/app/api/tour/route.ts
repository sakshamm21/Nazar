import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { track } from "@/lib/events";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["complete", "skip", "restart"]), step: z.number().int().min(0).max(20).optional() });

/** Guided tour state: completed/skipped (stored) or restarted from Settings. */
export const POST = api(async (req) => {
  const u = await requireUser(req);
  const { action, step } = await parseBody(req, Body);
  const db = await getDb();
  await db.update(schema.users).set({ tourCompletedAt: action === "restart" ? null : new Date() }).where(eq(schema.users.id, u.id));
  track(u.id, `tour_${action}`, { step: step ?? null });
  return json({ ok: true });
});
