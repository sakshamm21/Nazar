import { getDb } from "@/lib/db";
import { login, publicUser } from "@/lib/auth/service";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/demo/config";
import { createVisitorDemo } from "@/lib/demo/seed";
import { track } from "@/lib/events";
import { api, json } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

/**
 * "Try the demo": a private copy of the demo portfolio for this visitor, for 24 hours, so what one
 * visitor changes never shows up for another. Until the demo portfolio has been built (a fresh
 * deployment), it signs in to the shared demo account instead.
 */
export const POST = api(async (req) => {
  await rateLimit(`auth:demo:${ipHash(req)}`, 20, 3600_000, "That's a lot of demos from one network. Please wait a while, or create an account.");
  const db = await getDb();
  const u = (await createVisitorDemo(db)) ?? (await login(TEST_ACCOUNTS[0].email, TEST_PASSWORD));
  track(u.id, "demo_started", { private: u.isDemo });
  const res = json({ user: publicUser(u), private: u.isDemo });
  res.headers.append("Set-Cookie", sessionCookie(await signSession({ userId: u.id, isDemo: u.isDemo, version: u.sessionVersion })));
  return res;
});
