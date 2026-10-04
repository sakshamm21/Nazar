import { VerifyBody } from "@/lib/auth/schemas";
import { publicUser, verifyEmail } from "@/lib/auth/service";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { api, json, parseBody } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

/** Confirms the 6-digit code and signs the user in. */
export const POST = api(async (req) => {
  const { email, code } = await parseBody(req, VerifyBody);
  await rateLimit(`auth:verify:${ipHash(req)}`, 30, 3600_000);
  const u = await verifyEmail(email, code);
  const res = json({ user: publicUser(u) });
  res.headers.append("Set-Cookie", sessionCookie(await signSession({ userId: u.id, isDemo: false, version: u.sessionVersion })));
  return res;
});
