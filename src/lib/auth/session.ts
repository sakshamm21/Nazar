import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { authSecret } from "./secret";

/**
 * Sessions: a signed JWT (HS256) in an httpOnly cookie. A cookie rather than a bearer token because
 * the pages and the API share one origin.
 */
export const SESSION_COOKIE = "nazar_session";
const MAX_AGE_DAYS = 30;

export type Session = { userId: string; isDemo: boolean; version: number };

const secret = () => new TextEncoder().encode(authSecret());

export async function signSession(s: Omit<Session, "version"> & { version?: number }, maxAgeDays = MAX_AGE_DAYS): Promise<string> {
  return new SignJWT({ demo: s.isDemo, ver: s.version ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeDays}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { userId: payload.sub, isDemo: Boolean(payload.demo), version: typeof payload.ver === "number" ? payload.ver : 0 };
  } catch {
    return null;
  }
}

/**
 * A session is only good while it matches the user's current sessionVersion. Changing or resetting
 * the password bumps that number, which signs out every device at once — so a stolen session dies
 * the moment the real owner resets their password.
 */
export function sessionIsCurrent(s: Session, user: { sessionVersion: number }): boolean {
  return s.version === user.sessionVersion;
}

export function sessionCookie(token: string, maxAgeDays = MAX_AGE_DAYS) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}${secure}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Session from an incoming request (route handlers; testable without Next's request context). */
export async function sessionFromRequest(req: Request): Promise<Session | null> {
  return verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
}

/** Session in server components / server actions. */
export async function getSession(): Promise<Session | null> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}
