import { cn } from "@/lib/cn";

/** The Nazar mark: the bead that wards off the evil eye. A lime disc, a violet iris, a pupil with a glint. */
export function NazarMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <circle cx="16" cy="16" r="15" fill="#c8ff4d" />
      <circle cx="16" cy="16" r="10.5" fill="#0a0a0f" />
      <circle cx="16" cy="16" r="7" fill="#a48bff" />
      <circle cx="16" cy="16" r="3.4" fill="#0a0a0f" />
      <circle cx="18.1" cy="13.9" r="1.25" fill="#ffffff" />
    </svg>
  );
}

export function Wordmark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <NazarMark size={size} />
      <span className="font-[family-name:var(--font-display)] font-extrabold lowercase leading-none tracking-[-0.055em] text-text" style={{ fontSize: size * 0.92 }}>
        nazar
      </span>
    </span>
  );
}
