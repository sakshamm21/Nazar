import { LoginBody } from "@/lib/auth/schemas";
import { login, publicUser } from "@/lib/auth/service";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { api, json, parseBody } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";

export const POST = api(async (req) => {
  const { email, password } = await parseBody(req, LoginBody);
  await rateLimit(`auth:login:${ipHash(req)}`, 30, 15 * 60_000, "Too many sign-in attempts. Please wait 15 minutes.");
  await rateLimit(`auth:login:${email}`, 10, 15 * 60_000, "Too many sign-in attempts for this account. Please wait 15 minutes.");
  const u = await login(email, password);
  track(u.id, "signed_in", { testAccount: u.isTestAccount });
  const res = json({ user: publicUser(u) });
  res.headers.append("Set-Cookie", sessionCookie(await signSession({ userId: u.id, isDemo: u.isDemo })));
  return res;
});
