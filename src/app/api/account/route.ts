import { eq } from "drizzle-orm";
import { enabledOAuth, getUserId } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { remainingToday } from "@/lib/limits";

export const runtime = "nodejs";

/** Who am I, which sign-in providers exist, and how many questions are left today. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const linked = await db.select({ provider: schema.accounts.provider }).from(schema.accounts).where(eq(schema.accounts.userId, userId));
  return Response.json({
    user: { name: u?.name ?? `Analyst ${userId.slice(0, 4).toUpperCase()}`, email: u?.email ?? null, image: u?.image ?? null, linked: linked.map((l) => l.provider) },
    providers: enabledOAuth,
    limits: await remainingToday(userId),
  });
}
