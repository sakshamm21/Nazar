import { eq } from "drizzle-orm";
import { verifyLink } from "@/lib/auth/links";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

/** One click from the weekly email turns it off, signed in or not. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const p = verifyLink(token);
  const page = (msg: string, status = 200) =>
    new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nazar</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#1b2335"><h1 style="font-size:22px">${msg}</h1><p><a href="/settings" style="color:#2b54f0">Email settings</a></p></body>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  if (!p || p.a !== "unsub-owner") return page("That link has expired. Switch the weekly email off on the You page instead.", 400);
  const db = await getDb();
  const [u] = await db.select({ prefs: schema.users.prefs }).from(schema.users).where(eq(schema.users.id, p.user)).limit(1);
  if (u) await db.update(schema.users).set({ prefs: { ...(u.prefs ?? {}), weeklyEmail: false } }).where(eq(schema.users.id, p.user));
  return page("Done. You won't get the weekly email any more.");
}
