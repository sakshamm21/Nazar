import { ResetBody } from "@/lib/auth/schemas";
import { publicUser, resetPassword } from "@/lib/auth/service";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { api, json, parseBody } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

export const POST = api(async (req) => {
  const { token, password } = await parseBody(req, ResetBody);
  await rateLimit(`auth:reset:${ipHash(req)}`, 10, 3600_000);
  const u = await resetPassword(token, password);
  const res = json({ user: publicUser(u) });
  res.headers.append("Set-Cookie", sessionCookie(await signSession({ userId: u.id, isDemo: u.isDemo })));
  return res;
});
