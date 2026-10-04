import { z } from "zod";
import { badRequest } from "@/lib/errors";
import { insightsKeyMatches, INSIGHTS_KEY_COOKIE } from "@/lib/insights";
import { api, json, parseBody } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({ key: z.string().min(1).max(200) });

/**
 * Opens the read-only insights view for someone without an admin account. The key is sent in the
 * body (never a query string, so it stays out of URLs, history and access logs) and stored in an
 * httpOnly cookie that the insights page then reads.
 */
export const POST = api(async (req) => {
  const { key } = await parseBody(req, Body);
  if (!insightsKeyMatches(key)) throw badRequest("That key is not valid.", "BAD_KEY");
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", `${INSIGHTS_KEY_COOKIE}=${encodeURIComponent(key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return res;
});

/** Signs the share cookie back out. */
export const DELETE = api(async () => {
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", `${INSIGHTS_KEY_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
});