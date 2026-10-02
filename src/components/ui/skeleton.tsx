import { cn } from "@/lib/cn";

/** Content-shaped skeleton block (DESIGN.md §6). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("nz-skeleton rounded-[10px]", className)} />;
}
