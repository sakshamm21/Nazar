/**
 * Where to go after signing in. Only a path on this site is accepted: "/portfolio" yes,
 * "https://elsewhere" or "//elsewhere" (which a browser reads as another site) no.
 */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n\t]/.test(next)) return fallback;
  return next;
}
