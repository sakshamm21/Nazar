import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  res.headers.append("Set-Cookie", "nazar_pf=; Path=/; Max-Age=0");
  return res;
}
