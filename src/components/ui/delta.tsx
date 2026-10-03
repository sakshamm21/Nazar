import { cn } from "@/lib/cn";
import { absPct, inr, inrCompact } from "@/lib/format";

/**
 * A change in ₹ and/or %, always with ▲/▼ and a sign so it reads without colour.
 * `pct` is a fraction (−0.072 = −7.2%).
 */
export function Delta({ amount, pct, compact, className, showArrow = true, size = "md" }: { amount?: number | null; pct?: number | null; compact?: boolean; className?: string; showArrow?: boolean; size?: "sm" | "md" }) {
  const v = amount ?? pct ?? 0;
  const tone = v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-muted";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "•";
  const sign = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "");
  return (
    <span className={cn("num inline-flex items-baseline gap-1 font-medium", tone, size === "sm" ? "text-[13px]" : "text-[15px]", className)}>
      {showArrow && (
        <span aria-hidden className="text-[0.7em] leading-none">
          {arrow}
        </span>
      )}
      {amount != null && (
        <span>
          {sign(amount)}
          {compact ? inrCompact(Math.abs(amount)) : inr(Math.abs(amount))}
        </span>
      )}
      {pct != null && (
        <span className={amount != null ? "opacity-85" : ""}>
          {amount != null ? "(" : ""}
          {sign(pct)}
          {absPct(pct)}
          {amount != null ? ")" : ""}
        </span>
      )}
      <span className="sr-only">{v > 0 ? "up" : v < 0 ? "down" : "unchanged"}</span>
    </span>
  );
}
