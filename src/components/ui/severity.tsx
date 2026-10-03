import { cn } from "@/lib/cn";

/** Severity by shape and colour (docs/DESIGN.md §1): filled ring = critical, half ring = important, dot = info. */
export function SeverityIcon({ severity, size = 14, className }: { severity: "critical" | "important" | "info"; size?: number; className?: string }) {
  const label = severityLabel[severity];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={label} className={cn("shrink-0", className)}>
      {severity === "critical" && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--loss)" strokeWidth="2" />
          <circle cx="8" cy="8" r="3.2" fill="var(--loss)" />
        </>
      )}
      {severity === "important" && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
          <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {severity === "info" && <circle cx="8" cy="8" r="3" fill="var(--subtle)" />}
    </svg>
  );
}

export const severityLabel = { critical: "Major", important: "Worth knowing", info: "For your information" } as const;
