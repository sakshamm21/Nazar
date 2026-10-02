import { EmailBody } from "@/lib/auth/schemas";
import { forgotPassword } from "@/lib/auth/service";
import { api, json, parseBody } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

/** Always answers the same way, so it can't be used to find out who has an account. */
export const POST = api(async (req) => {
  const { email } = await parseBody(req, EmailBody);
  await rateLimit(`auth:forgot:${ipHash(req)}`, 8, 3600_000);
  return json({ ok: true, ...(await forgotPassword(email)) });
});
