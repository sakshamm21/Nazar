import { cn } from "@/lib/cn";

/** The Nazar mark: an open eye on a blue tile. Nazar means "gaze": the eye that keeps watch. */
export function NazarMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="nz-eye-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7ea2ff" />
          <stop offset="100%" stopColor="#3558e6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#nz-eye-tile)" />
      <path d="M4.5 16 C9 8.8 23 8.8 27.5 16 C23 23.2 9 23.2 4.5 16 Z" fill="#ffffff" />
      <circle cx="16" cy="16" r="5.1" fill="#2b4fe0" />
      <circle cx="16" cy="16" r="2.3" fill="#0a0f1c" />
      <circle cx="17.9" cy="14.1" r="1.15" fill="#ffffff" />
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
