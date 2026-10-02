import { eq } from "drizzle-orm";
import { publicUser } from "@/lib/auth/service";
import { clearSessionCookie } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { api, json, requireUser } from "@/lib/http";
import { remainingToday } from "@/lib/limits";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";

/** Who am I, and how many Ask questions are left today. */
export const GET = api(async (req) => {
  const u = await requireUser(req);
  return json({ user: publicUser(u), limits: await remainingToday(u.id, u.isDemo) });
});

/** Delete my account and everything in it (portfolios, alerts, chats). */
export const DELETE = api(async (req) => {
  const u = await requireUser(req);
  const db = await getDb();
  track(u.id, "account_deleted", { demo: u.isDemo });
  await db.delete(schema.users).where(eq(schema.users.id, u.id));
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
});
