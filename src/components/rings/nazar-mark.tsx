import { cn } from "@/lib/cn";

/** The Nazar mark: two concentric rings and a pupil — an eye that watches. */
export function NazarMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <circle cx="16" cy="16" r="13.25" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="7.75" fill="none" stroke="var(--ice)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="3" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <NazarMark size={26} />
      <span className="font-[family-name:var(--font-display)] text-[21px] font-extrabold lowercase tracking-[-0.04em] text-text">nazar</span>
    </span>
  );
}
