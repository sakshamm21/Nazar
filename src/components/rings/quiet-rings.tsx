import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Faint, still rings behind calm copy: empty and "all quiet" states (docs/DESIGN.md §1). */
export function QuietRings({ title, body, action, className, compact }: { title: string; body?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  const s = compact ? 88 : 132;
  return (
    <div className={cn("flex flex-col items-center px-4 text-center", compact ? "py-6" : "py-10", className)}>
      <svg width={s} height={s} viewBox="0 0 132 132" aria-hidden>
        <circle cx="66" cy="66" r="62" fill="none" stroke="var(--line)" strokeWidth="1.5" />
        <circle cx="66" cy="66" r="44" fill="none" stroke="var(--line)" strokeWidth="1.5" />
        <circle cx="66" cy="66" r="26" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
        <circle cx="66" cy="66" r="7" fill="var(--accent)" opacity="0.85" />
      </svg>
      <h3 className="t-title-2 mt-4 text-text">{title}</h3>
      {body && <div className="mt-1.5 max-w-sm text-sm text-muted">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
