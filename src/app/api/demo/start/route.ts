import { sessionCookie, signSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createDemoVisitor } from "@/lib/demo/seed";
import { api, json } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const maxDuration = 60;

/** "Try the demo, no sign-up": an isolated 24-hour copy of the demo account for this visitor. */
export const POST = api(async (req) => {
  await rateLimit(`demo:start:${ipHash(req)}`, 15, 24 * 3600_000, "You've started a lot of demos today. Sign in with a test account from TEST_ACCOUNTS.md instead, or try again tomorrow.");
  const db = await getDb();
  const id = await createDemoVisitor(db);
  track(id, "demo_started", {});
  const res = json({ ok: true, redirect: "/home?tour=1" });
  res.headers.append("Set-Cookie", sessionCookie(await signSession({ userId: id, isDemo: true }, 1), 1));
  res.headers.append("Set-Cookie", "nazar_pf=; Path=/; Max-Age=0");
  return res;
});
