import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { getSettings, getThresholds, listThresholdChanges, updateSettings } from "@/lib/repo/alerts";
import { effectiveSettings } from "@/lib/alerts/thresholds";

export const runtime = "nodejs";

const Patch = z.object({
  sensitivity: z.enum(["major", "balanced", "everything"]).optional(),
  quietMode: z.boolean().optional(),
  emailDigest: z.boolean().optional(),
  uiLanguage: z.enum(["en", "hi"]).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export const GET = api(async (req) => {
  const u = await requireUser(req);
  const s = await getSettings(u.id);
  const t = await getThresholds(u.id);
  return json({ settings: s, effective: { ...effectiveSettings(s.sensitivity, t), muted: [...effectiveSettings(s.sensitivity, t).muted] }, changes: await listThresholdChanges(u.id) });
});

export const PATCH = api(async (req) => {
  const u = await requireUser(req);
  const { uiLanguage, name, ...alert } = await parseBody(req, Patch);
  if (uiLanguage || name) {
    const db = await getDb();
    await db.update(schema.users).set({ ...(uiLanguage ? { uiLanguage } : {}), ...(name ? { name } : {}) }).where(eq(schema.users.id, u.id));
  }
  const s = Object.keys(alert).length ? await updateSettings(u.id, alert) : await getSettings(u.id);
  return json({ settings: s });
});
