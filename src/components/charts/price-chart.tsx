"use client";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inr } from "@/lib/format";

/**
 * Nazar chart style (docs/DESIGN.md §6): thin line, fading gradient fill, crosshair tooltip, no gridlines.
 * `points` are { date, value }; colour follows the period's direction unless `tone` is given.
 */
export function PriceChart({ points, height = 220, tone, format = (v: number) => inr(v), compare }: { points: { date: string; value: number; compare?: number | null }[]; height?: number; tone?: "accent" | "gain" | "loss"; format?: (v: number) => string; compare?: { label: string } }) {
  const id = useId().replace(/:/g, "");
  if (points.length < 2) return <div className="grid place-items-center text-sm text-subtle" style={{ height }}>Not enough history yet.</div>;
  const up = points.at(-1)!.value >= points[0].value;
  const color = tone === "accent" ? "var(--accent)" : tone === "gain" || (!tone && up) ? "var(--gain)" : "var(--loss)";
  return (
    <div style={{ height }} className="-mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-[12px] border border-line bg-surface-1 px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
                  <div className="text-subtle">{new Date(`${label}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</div>
                  <div className="num mt-0.5 text-sm font-medium text-text">{format(Number(payload[0].value))}</div>
                  {compare && payload[1]?.value != null && (
                    <div className="num text-muted">
                      {compare.label}: {format(Number(payload[1].value))}
                    </div>
                  )}
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#g${id})`} dot={false} activeDot={{ r: 3.5, strokeWidth: 0, fill: color }} isAnimationActive={false} />
          {compare && <Area type="monotone" dataKey="compare" stroke="var(--subtle)" strokeWidth={1.25} strokeDasharray="4 4" fill="none" dot={false} isAnimationActive={false} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
