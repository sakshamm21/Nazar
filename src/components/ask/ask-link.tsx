"use client";

import Link from "next/link";
import { trackClient } from "@/lib/events-client";
import { cn } from "@/lib/cn";

/**
 * "Ask Nazar about this", under something a screen has just shown. The question is worded by the
 * screen so that Ask reads the same data the screen was drawn from, not a guess at it.
 */
export function AskLink({ question, kind, props, className, children = "Ask Nazar about this →" }: { question: string; kind: string; props?: Record<string, string | number | boolean | null>; className?: string; children?: React.ReactNode }) {
  return (
    <Link href={`/ask?q=${encodeURIComponent(question)}`} onClick={() => trackClient("suggestion_click", { kind, ...props })} className={cn("inline-block text-sm font-medium text-accent", className)}>
      {children}
    </Link>
  );
}
