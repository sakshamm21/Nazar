import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { api, json, parseBody, requireUser } from "@/lib/http";

export const runtime = "nodejs";

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

/** This device wants notifications. */
export const POST = api(async (req) => {
  const u = await requireUser(req);
  const s = await parseBody(req, Sub);
  const db = await getDb();
  await db
    .insert(schema.pushSubscriptions)
    .values({ endpoint: s.endpoint, userId: u.id, p256dh: s.keys.p256dh, auth: s.keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: u.id, p256dh: s.keys.p256dh, auth: s.keys.auth } });
  return json({ ok: true });
});

/** This device no longer wants them. */
export const DELETE = api(async (req) => {
  const u = await requireUser(req);
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string().max(1000) }));
  const db = await getDb();
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, u.id)));
  return json({ ok: true });
});
