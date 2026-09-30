"use client";
import { useEffect, useState } from "react";

/**
 * Formats a timestamp in the viewer's locale and timezone. Server-rendered pages would otherwise
 * format in the server's locale/timezone (UTC on Vercel) and cause hydration mismatches.
 */
export function LocalTime({ iso, options, timeZone }: { iso: string; options?: Intl.DateTimeFormatOptions; timeZone?: string | null }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, { ...options, ...(timeZone ? { timeZone } : {}) }));
  }, [iso, options, timeZone]);
  return <time dateTime={iso}>{text ?? iso.slice(0, 16).replace("T", " ")}</time>;
}
