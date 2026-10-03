import { cn } from "@/lib/cn";

/**
 * The Nazar mark: an N drawn as one line, the way a chart is drawn, ending in a single point.
 * The line is your money over time; the point is the latest value, the thing Nazar keeps in view.
 */
export function NazarMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="nz-mark-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6f95ff" />
          <stop offset="100%" stopColor="#2f52e0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#nz-mark-tile)" />
      <path d="M9.5 22.5V9.5L22.5 22.5V15.2" fill="none" stroke="#ffffff" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="9.4" r="2.25" fill="#ffffff" />
    </svg>
  );
}

export function Wordmark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NazarMark size={size} />
      <span className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.025em] text-text" style={{ fontSize: Math.round(size * 0.72) }}>
        Nazar
      </span>
    </span>
  );
}
