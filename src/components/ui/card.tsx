import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Surface-1 card: hairline border, 20px radius, soft depth (docs/DESIGN.md §4). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface-1 shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ overline, title, right, className }: { overline?: ReactNode; title?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {overline && <div className="t-overline">{overline}</div>}
        {title && <h2 className="t-title-2 mt-0.5 text-text">{title}</h2>}
      </div>
      {right}
    </div>
  );
}
