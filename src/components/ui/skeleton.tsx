import { cn } from "@/lib/cn";

/** Content-shaped skeleton block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("nz-skeleton rounded-[10px]", className)} />;
}
