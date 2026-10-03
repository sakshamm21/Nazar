"use client";
import { useEffect, useState } from "react";

/**
 * Portfolio health as concentric rings (docs/DESIGN.md §1): outer = overall health (0–100),
 * inner = diversification and risk (0–100). Arcs fill on mount; static under reduced motion.
 */
export function RingGauge({ outer, inner, size = 168, label, sublabel }: { outer: number | null; inner: number | null; size?: number; label?: string; sublabel?: string }) {
  const [shown, setShown] = useState({ o: 0, i: 0 });
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown({ o: outer ?? 0, i: inner ?? 0 }));
    return () => cancelAnimationFrame(id);
  }, [outer, inner]);
  const sw = size * 0.075;
  const rO = size / 2 - sw / 2 - 1;
  const rI = rO - sw - size * 0.05;
  const arc = (r: number, pct: number) => {
    const c = 2 * Math.PI * r;
    return { strokeDasharray: c, strokeDashoffset: c * (1 - Math.max(0, Math.min(100, pct)) / 100) };
  };
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Health ${outer ?? "not scored"} out of 100; diversification and risk ${inner ?? "not scored"} out of 100`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={rO} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={rI} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
        {outer != null && (
          <circle cx={size / 2} cy={size / 2} r={rO} fill="none" stroke="var(--accent)" strokeWidth={sw} strokeLinecap="round" style={{ ...arc(rO, shown.o), transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }} />
        )}
        {inner != null && (
          <circle cx={size / 2} cy={size / 2} r={rI} fill="none" stroke="var(--ice)" strokeWidth={sw} strokeLinecap="round" style={{ ...arc(rI, shown.i), transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1) 120ms" }} />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num font-[family-name:var(--font-display)] font-semibold tracking-[-0.02em] text-text" style={{ fontSize: size * 0.22, lineHeight: 1 }}>
            {outer ?? "—"}
          </div>
          {label && <div className="t-caption mt-1">{label}</div>}
          {sublabel && <div className="t-caption">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}

/** Small legend row for the two rings. */
export function RingLegend({ outer, inner }: { outer: number | null; inner: number | null }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="text-muted">Health</span>
        <span className="num ml-auto font-medium text-text">{outer ?? "—"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-ice" />
        <span className="text-muted">Diversification & risk</span>
        <span className="num ml-auto font-medium text-text">{inner ?? "—"}</span>
      </div>
    </div>
  );
}
