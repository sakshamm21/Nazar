"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { inr, inrCompact, signedPct } from "@/lib/format";

export type HeatTile = { symbol: string; name: string; value: number; today: number | null; total: number | null; href: string | null };
type Rect = { x: number; y: number; w: number; h: number };

/** Squarified treemap: lays `values` (largest first) into a w × h box, keeping tiles close to square. */
export function squarify(values: number[], w: number, h: number): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  const out: Rect[] = [];
  if (!(total > 0)) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const areas = values.map((v) => (v / total) * w * h);
  let x = 0, y = 0, cw = w, ch = h, i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    return Math.max(...row.map((a) => Math.max((side * side * a) / (s * s), (s * s) / (side * side * a))));
  };
  while (i < areas.length) {
    const side = Math.min(cw, ch);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
    const s = row.reduce((a, b) => a + b, 0);
    const thick = side > 0 ? s / side : 0;
    let off = 0;
    for (const a of row) {
      const len = thick > 0 ? a / thick : 0;
      out.push(cw >= ch ? { x, y: y + off, w: thick, h: len } : { x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (cw >= ch) {
      x += thick;
      cw -= thick;
    } else {
      y += thick;
      ch -= thick;
    }
    i = j;
  }
  return out;
}

const MODES = [
  { id: "today", label: "Today", cap: 0.03 },
  { id: "total", label: "Since you invested", cap: 0.3 },
] as const;

/**
 * Every holding as a tile: the size is how much of your money it is, the colour is how it moved.
 * Hover or tap a tile for the numbers; tap again to open it.
 */
export function Heatmap({ tiles }: { tiles: HeatTile[] }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("today");
  const [sel, setSel] = useState<string | null>(null);
  const sorted = useMemo(() => [...tiles].filter((t) => t.value > 0).sort((a, b) => b.value - a.value), [tiles]);
  // Laid out in a 100 × 62 box, then placed with percentages so it scales with the card.
  const W = 100, H = 62;
  const rects = useMemo(() => squarify(sorted.map((t) => t.value), W, H), [sorted]);
  const cap = MODES.find((m) => m.id === mode)!.cap;
  const active = sorted.find((t) => t.symbol === sel) ?? null;
  const pctOf = (t: HeatTile) => (mode === "today" ? t.today : t.total);
  const sum = sorted.reduce((a, t) => a + t.value, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Colour by" className="flex gap-1">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors", mode === m.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text")}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-subtle" aria-hidden>
          fell
          <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--loss), var(--surface-3), var(--gain))" }} />
          rose
        </div>
      </div>

      <div className="relative mt-3 w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: `${W} / ${H}` }} onMouseLeave={() => setSel(null)}>
        {sorted.map((t, i) => {
          const r = rects[i];
          const p = pctOf(t);
          const strength = p == null ? 0 : Math.min(1, Math.abs(p) / cap);
          const bg = p == null || Math.abs(p) < 0.0005 ? "var(--surface-3)" : `color-mix(in srgb, ${p > 0 ? "var(--gain)" : "var(--loss)"} ${Math.round(18 + strength * 62)}%, var(--surface-2))`;
          const big = r.w > 13 && r.h > 11, mid = r.w > 7 && r.h > 6;
          const body = (
            <>
              {mid && <span className={cn("block truncate font-semibold leading-tight text-text", big ? "text-[13px]" : "text-[10px]")}>{t.name}</span>}
              {big && <span className="num mt-0.5 block text-[12px] font-medium text-text/80">{p == null ? inrCompact(t.value) : signedPct(p)}</span>}
            </>
          );
          const cls = cn("absolute block overflow-hidden border border-bg p-1.5 text-left transition-[filter,opacity] duration-150 sm:p-2", sel && sel !== t.symbol && "opacity-55", sel === t.symbol && "brightness-110");
          const style = { left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`, background: bg };
          const label = `${t.name}: ${inr(Math.round(t.value))}${p != null ? `, ${signedPct(p)}` : ""}`;
          // First tap selects (so the numbers show on a phone); a second tap follows the link.
          return t.href ? (
            <Link key={t.symbol} href={t.href} aria-label={label} className={cls} style={style} onMouseEnter={() => setSel(t.symbol)} onFocus={() => setSel(t.symbol)} onClick={(e) => { if (sel !== t.symbol) { e.preventDefault(); setSel(t.symbol); } }}>
              {body}
            </Link>
          ) : (
            <button key={t.symbol} aria-label={label} className={cls} style={style} onMouseEnter={() => setSel(t.symbol)} onFocus={() => setSel(t.symbol)} onClick={() => setSel(t.symbol)}>
              {body}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[12px] bg-surface-2 px-3 py-2.5 text-[13px]">
        {active ? (
          <>
            <span className="min-w-0 truncate font-medium text-text">{active.name}</span>
            <span className="num flex flex-wrap gap-x-3 text-muted">
              <span>{inr(Math.round(active.value))} · {sum ? Math.round((active.value / sum) * 100) : 0}% of this portfolio</span>
              {active.today != null && <span className={active.today > 0 ? "text-gain" : active.today < 0 ? "text-loss" : ""}>{signedPct(active.today)} today</span>}
              {active.total != null && <span className={active.total > 0 ? "text-gain" : active.total < 0 ? "text-loss" : ""}>{signedPct(active.total)} overall</span>}
            </span>
          </>
        ) : (
          <span className="text-muted">Bigger tile, more of your money. Tap one for its numbers.</span>
        )}
      </div>
    </div>
  );
}
