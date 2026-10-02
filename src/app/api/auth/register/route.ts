import { RegisterBody } from "@/lib/auth/schemas";
import { register } from "@/lib/auth/service";
import { api, json, parseBody } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

/** Sign up: creates an unverified account and emails a 6-digit code. */
export const POST = api(async (req) => {
  const body = await parseBody(req, RegisterBody);
  await rateLimit(`auth:register:${ipHash(req)}`, 10, 3600_000);
  return json(await register(body), { status: 201 });
});
