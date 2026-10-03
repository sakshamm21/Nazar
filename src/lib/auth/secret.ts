import "server-only";

const DEV_SECRET = "nazar-dev-secret-change-me-0123456789";

/**
 * The one server secret behind sessions, signed email links and IP hashing. AUTH_SECRET (or v1's
 * NEXTAUTH_SECRET name). Production refuses to run without a real one: a guessable fallback would
 * let anyone forge sessions or one-click email links.
 */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (at least 32 characters) in production.");
  return s || DEV_SECRET;
}
