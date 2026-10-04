import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession, sessionIsCurrent } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

/** The signed-in user for server components (cached per request), or null. */
export const currentUser = cache(async () => {
  const s = await getSession();
  if (!s) return null;
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  if (!u || (u.isDemo && u.demoExpiresAt && u.demoExpiresAt < new Date())) return null;
  if (!sessionIsCurrent(s, u)) return null;
  return u;
});

/** Pages inside the app: redirect to sign-in when there's no session. */
export async function requirePageUser() {
  const u = await currentUser();
  if (!u) redirect("/signin");
  return u;
}

/** The portfolio the user last selected (cookie), validated against their portfolios later. */
export async function selectedPortfolioId(): Promise<string | null> {
  return (await cookies()).get("nazar_pf")?.value ?? null;
}
