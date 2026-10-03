import { z } from "zod";
import { changePassword } from "@/lib/auth/service";
import { forbidden } from "@/lib/errors";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

const Body = z.object({ current: z.string().min(1, "Enter your current password.").max(200), next: z.string().min(8, "Use at least 8 characters.").max(200) });

/** Change my password (I must know the current one). The shared test account keeps its public password. */
export const POST = api(async (req) => {
  const u = await requireUser(req);
  if (u.isTestAccount || u.isDemo) throw forbidden("The test account's password can't be changed.");
  await rateLimit(`auth:password:${u.id}`, 8, 15 * 60_000);
  const { current, next } = await parseBody(req, Body);
  await changePassword(u.id, current, next);
  return json({ ok: true });
});
