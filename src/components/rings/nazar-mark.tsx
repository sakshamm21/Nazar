import { cn } from "@/lib/cn";

/** The Nazar mark: a square eye. A yellow block, a black iris and one bright glint. */
export function NazarMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <rect width="32" height="32" fill="#ffe500" />
      <circle cx="16" cy="16" r="9" fill="#000000" />
      <rect x="17" y="10" width="5" height="5" fill="#f7f4ea" />
    </svg>
  );
}

export function Wordmark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NazarMark size={size} />
      <span className="font-[family-name:var(--font-display)] font-black uppercase leading-none tracking-[0.04em] text-text" style={{ fontSize: size * 1.05 }}>
        Nazar
      </span>
    </span>
  );
}
