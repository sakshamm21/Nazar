"use client";
import { useHydrated } from "@/lib/client-store";

/**
 * Formats a timestamp in the viewer's locale and timezone. Server-rendered pages would otherwise
 * format in the server's locale/timezone (UTC on Vercel) and cause hydration mismatches.
 */
export function LocalTime({ iso, options, timeZone }: { iso: string; options?: Intl.DateTimeFormatOptions; timeZone?: string | null }) {
  const hydrated = useHydrated();
  const text = hydrated ? new Date(iso).toLocaleString(undefined, { ...options, ...(timeZone ? { timeZone } : {}) }) : iso.slice(0, 16).replace("T", " ");
  return <time dateTime={iso}>{text}</time>;
}
