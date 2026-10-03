"use client";
import { useId, useMemo, useState } from "react";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { absPct, dayLabel, inr } from "@/lib/format";

const RANGES = [
  { id: "1W", days: 7, word: "past week" },
  { id: "1M", days: 30, word: "past month" },
  { id: "3M", days: 91, word: "past 3 months" },
  { id: "6M", days: 182, word: "past 6 months" },
  { id: "1Y", days: 365, word: "past year" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const back = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/**
 * The portfolio's value over time. Drag or hover along the line and the big number follows it;
 * the range chips change the window, and "vs Nifty" draws what the same money would have done
 * in the index.
 */
export function ValueChart({ dates, values, nifty, height = 240, footnote }: { dates: string[]; values: number[]; nifty: (number | null)[]; height?: number; footnote?: string }) {
  const id = useId().replace(/:/g, "");
  const available = useMemo(() => RANGES.filter((r, i) => i === 0 || dates[0] <= back(dates.at(-1) ?? "", RANGES[i - 1].days + 3)), [dates]);
  const [range, setRange] = useState<RangeId>(() => (available.find((r) => r.id === "3M") ?? available.at(-1) ?? RANGES[0]).id);
  const [vsNifty, setVsNifty] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    const cutoff = back(dates.at(-1) ?? "", r.days);
    let start = 0;
    dates.forEach((d, i) => {
      if (d <= cutoff) start = i;
    });
    const base = nifty[start];
    return dates.slice(start).map((date, k) => {
      const i = start + k;
      return { date, value: values[i], nifty: base && nifty[i] != null ? (nifty[i]! / base) * values[start] : null };
    });
  }, [dates, values, nifty, range]);

  if (points.length < 2) return <div className="grid place-items-center rounded-[14px] bg-surface-2 text-sm text-subtle" style={{ height }}>The chart fills in after a few days of prices.</div>;

  const first = points[0];
  const shown = points[hover != null && hover < points.length ? hover : points.length - 1];
  const change = shown.value - first.value;
  const pct = first.value ? change / first.value : 0;
  const up = points.at(-1)!.value >= first.value;
  const color = up ? "var(--gain)" : "var(--loss)";
  const tone = change > 0 ? "text-gain" : change < 0 ? "text-loss" : "text-muted";
  const niftyChange = shown.nifty != null ? shown.nifty / first.value - 1 : null;

  return (
    <div>
      <div className="num t-display text-text" aria-live="off">
        {inr(Math.round(shown.value), { decimals: 0 })}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px]">
        <span className={cn("num font-medium", tone)}>
          <span aria-hidden className="mr-1 text-[0.7em]">{change > 0 ? "▲" : change < 0 ? "▼" : "•"}</span>
          {change > 0 ? "+" : change < 0 ? "−" : ""}
          {inr(Math.abs(Math.round(change)), { decimals: 0 })} ({change > 0 ? "+" : change < 0 ? "−" : ""}
          {absPct(pct)})
        </span>
        <span className="text-sm text-subtle">{hover != null ? `${dayLabel(first.date, "en", false)} to ${dayLabel(shown.date, "en", false)}` : RANGES.find((r) => r.id === range)!.word}</span>
        {vsNifty && niftyChange != null && <span className="num text-sm text-subtle">· Nifty {niftyChange >= 0 ? "+" : "−"}{absPct(niftyChange)}</span>}
      </div>

      <div style={{ height }} className="-mx-2 mt-3 touch-pan-y select-none" role="img" aria-label={`Portfolio value, ${RANGES.find((r) => r.id === range)!.word}: from ${inr(Math.round(first.value))} to ${inr(Math.round(points.at(-1)!.value))}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 8, left: 8, bottom: 0 }} onMouseMove={(s) => setHover(typeof s?.activeTooltipIndex === "number" ? s.activeTooltipIndex : null)} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id={`v${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis domain={["dataMin", "dataMax"]} hide padding={{ top: 6, bottom: 6 }} />
            <Tooltip cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} content={() => null} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.25} fill={`url(#v${id})`} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--surface-1)", fill: color }} animationDuration={500} />
            {vsNifty && <Line type="monotone" dataKey="nifty" stroke="var(--subtle)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Time range" className="flex gap-1">
          {available.map((r) => (
            <button key={r.id} role="radio" aria-checked={range === r.id} onClick={() => { setRange(r.id); setHover(null); }} className={cn("num rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors", range === r.id ? "bg-text text-bg" : "text-muted hover:bg-surface-2 hover:text-text")}>
              {r.id}
            </button>
          ))}
        </div>
        <button aria-pressed={vsNifty} onClick={() => setVsNifty((v) => !v)} className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors", vsNifty ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-text")}>
          vs Nifty
        </button>
      </div>
      {footnote && <p className="t-caption mt-3">{footnote}</p>}
    </div>
  );
}
