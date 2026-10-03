"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { inrCompact } from "@/lib/format";
import { GROUP_COLOR, type AssetGroup } from "@/lib/instruments/asset-classes";

export type DonutSlice = { group: AssetGroup; value: number; weight: number; count: number; top?: { name: string; value: number }[] };

const R = 42, C = 2 * Math.PI * R;

/** What you own, as a ring. Tap or hover a slice (or its row) to see what is inside it. */
export function AllocationDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const [sel, setSel] = useState<AssetGroup | null>(null);
  const active = slices.find((s) => s.group === sel) ?? null;
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((a, s) => a + s.weight * C, 0));
  return (
    <div>
      <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col">
        <div className="relative h-[168px] w-[168px] shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`Allocation: ${slices.map((s) => `${s.group} ${Math.round(s.weight * 100)}%`).join(", ")}`}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
            {slices.map((s, i) => {
              const len = Math.max(0, s.weight * C - (slices.length > 1 ? 1.2 : 0));
              return (
                <circle
                  key={s.group}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={GROUP_COLOR[s.group]}
                  strokeWidth={sel === s.group ? 15 : 11}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-starts[i]}
                  opacity={sel && sel !== s.group ? 0.3 : 1}
                  className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                  onMouseEnter={() => setSel(s.group)}
                  onMouseLeave={() => setSel(null)}
                  onClick={() => setSel(s.group)}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="num text-[22px] font-bold leading-6 tracking-[-0.03em] text-text">{active ? `${Math.round(active.weight * 100)}%` : inrCompact(total)}</div>
              <div className="mx-auto mt-0.5 max-w-[92px] truncate text-[11px] font-medium text-subtle">{active ? active.group : `${slices.length} asset ${slices.length === 1 ? "type" : "types"}`}</div>
            </div>
          </div>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-0.5">
          {slices.map((s) => (
            <li key={s.group}>
              <button onMouseEnter={() => setSel(s.group)} onMouseLeave={() => setSel(null)} onFocus={() => setSel(s.group)} onBlur={() => setSel(null)} onClick={() => setSel(s.group)} aria-pressed={sel === s.group} className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[13px] transition-colors", sel === s.group ? "bg-surface-2" : "hover:bg-surface-2")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: GROUP_COLOR[s.group] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-text">{s.group}</span>
                <span className="num text-muted">{inrCompact(s.value)}</span>
                <span className="num w-9 text-right font-semibold text-text">{Math.round(s.weight * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 min-h-[44px] rounded-[12px] bg-surface-2 px-3 py-2.5 text-[13px] leading-5 text-muted">
        {active ? (
          <>
            <span className="font-medium text-text">{active.count} {active.count === 1 ? "holding" : "holdings"}</span>
            {active.top?.length ? <>: {active.top.map((t) => t.name).join(", ")}{active.count > active.top.length ? ` and ${active.count - active.top.length} more` : ""}.</> : "."}
          </>
        ) : (
          "Tap a colour to see what is inside it."
        )}
      </div>
    </div>
  );
}
