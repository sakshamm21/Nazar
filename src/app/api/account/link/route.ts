import { LINK_COOKIE, getUserId, signLink } from "@/lib/auth";

export const runtime = "nodejs";

/** Called right before "Sign in with Google/GitHub" so the callback can attach this device's history. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const res = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.append("Set-Cookie", `${LINK_COOKIE}=${signLink(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  return res;
}
