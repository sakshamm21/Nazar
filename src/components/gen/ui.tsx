"use client";
import type { ReactNode } from "react";

export function Panel({ title, subtitle, right, children }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="gen-in my-3 overflow-hidden rounded-none border border-line bg-surface-2 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{title}</div>
          {subtitle && <div className="truncate text-xs text-subtle">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-subtle">{label}</div>
      <div className={`truncate text-sm font-medium tabular-nums ${tone ?? "text-text"}`}>{value}</div>
    </div>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="my-3 rounded-none border border-line bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-none bg-accent" />
        {label}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-3" />
        <div className="h-24 animate-pulse rounded bg-surface-3" />
      </div>
    </div>
  );
}

export function ErrorNote({ tool, message }: { tool: string; message: string }) {
  return (
    <div className="my-2 rounded-none border border-loss bg-loss-soft px-3 py-2 text-xs text-loss">
      <span className="font-mono">{tool}</span>: {message}
    </div>
  );
}

export const chartColors = {
  up: "var(--gain)",
  down: "var(--loss)",
  series: ["var(--accent)", "var(--gain)", "var(--warn)", "var(--ice)", "var(--loss)", "var(--muted)"],
  grid: "transparent",
  axis: "var(--subtle)",
};

export const tooltipStyle = {
  contentStyle: { background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-pop)" },
  labelStyle: { color: "var(--subtle)" },
  itemStyle: { color: "var(--text)" },
};
