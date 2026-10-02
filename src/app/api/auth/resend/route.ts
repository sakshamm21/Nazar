import { EmailBody } from "@/lib/auth/schemas";
import { resendCode } from "@/lib/auth/service";
import { api, json, parseBody } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

export const POST = api(async (req) => {
  const { email } = await parseBody(req, EmailBody);
  await rateLimit(`auth:resend:${ipHash(req)}`, 10, 3600_000);
  return json(await resendCode(email));
});
