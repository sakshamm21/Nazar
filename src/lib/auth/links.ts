import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { authSecret } from "./secret";

/**
 * Signed one-click links for emails (no sign-in needed): rate an alert, confirm a family
 * recipient, unsubscribe. Format: base64url(payload).signature, HMAC-SHA256 with AUTH_SECRET.
 */
export type LinkPayload =
  | { a: "rate"; alert: string; user: string; r: "up" | "down" }
  | { a: "confirm"; rec: string }
  | { a: "unsub"; rec: string }
  | { a: "unsub-owner"; user: string };

// "link:" separates these signatures from any other use of the same secret.
const sign = (s: string) => createHmac("sha256", authSecret()).update(`link:${s}`).digest("base64url");

export function signLink(p: LinkPayload, ttlDays = 60): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + ttlDays * 86400000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyLink(token: string): LinkPayload | null {
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i), sig = token.slice(i + 1);
  const want = sign(body);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as LinkPayload & { exp: number };
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
