"use client";
import type { ReactNode } from "react";

export function Panel({ title, subtitle, right, children }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="gen-in my-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
          {subtitle && <div className="truncate text-xs text-zinc-500">{subtitle}</div>}
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
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`truncate text-sm font-medium tabular-nums ${tone ?? "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        {label}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
        <div className="h-24 animate-pulse rounded bg-zinc-800/70" />
      </div>
    </div>
  );
}

export function ErrorNote({ tool, message }: { tool: string; message: string }) {
  return (
    <div className="my-2 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
      <span className="font-mono">{tool}</span>: {message}
    </div>
  );
}

export const chartColors = {
  up: "#34d399",
  down: "#fb7185",
  series: ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee"],
  grid: "#27272a",
  axis: "#71717a",
};

export const tooltipStyle = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#a1a1aa" },
  itemStyle: { color: "#e4e4e7" },
};
