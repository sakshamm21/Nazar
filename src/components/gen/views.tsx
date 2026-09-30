"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import { Star } from "lucide-react";
import { fmt, fmtLarge, money, pct, upDown, type Fmt } from "@/lib/format";
import { useActions } from "../actions";
import { LocalTime } from "../LocalTime";
import { Panel, Stat, chartColors as C, tooltipStyle } from "./ui";

/* ---------------- Quote ---------------- */
const QUOTE_TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZoneName: "short" };
export const marketLabel = (state?: string) =>
  !state ? null : state === "REGULAR" ? "Market open" : /PRE/.test(state) ? "Pre-market" : /POST/.test(state) ? "After hours" : "Market closed";

export function QuoteView({ data }: { data: any }) {
  const actions = useActions();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.quotes.map((q: any) => {
        const range = q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow ? (q.price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow) : null;
        return (
          <Panel key={q.symbol} title={<span><span className="font-mono">{q.symbol}</span> · {q.name}</span>} subtitle={<>{[q.exchange, marketLabel(q.marketState)].filter(Boolean).join(" · ")}{q.asOf && <> · as of <LocalTime iso={q.asOf} timeZone={q.timeZone} options={QUOTE_TIME} /></>}</>}
            right={actions?.watch && (
              <button onClick={() => actions.watch!(q.symbol)} className={`no-print rounded-md p-1 ${actions.watched?.has(q.symbol) ? "text-amber-400" : "text-zinc-500 hover:text-amber-300"}`} title={actions.watched?.has(q.symbol) ? "Remove from watchlist" : "Add to watchlist"} aria-label="Toggle watchlist">
                <Star className="h-4 w-4" fill={actions.watched?.has(q.symbol) ? "currentColor" : "none"} />
              </button>
            )}>
            <div className="flex items-baseline gap-3">
              <div className="text-2xl font-semibold tabular-nums">{fmt(q.price, "currency", q.currency)}</div>
              <div className={`text-sm tabular-nums ${upDown(q.change)}`}>
                {q.change != null ? `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}` : ""} ({pct(q.changePercent, true)})
              </div>
            </div>
            {range != null && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-zinc-500"><span>52W low {fmt(q.fiftyTwoWeekLow, "currency", q.currency)}</span><span>high {fmt(q.fiftyTwoWeekHigh, "currency", q.currency)}</span></div>
                <div className="relative mt-1 h-1.5 rounded-full bg-zinc-800">
                  <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-900 bg-emerald-400" style={{ left: `${Math.min(100, Math.max(0, range * 100))}%` }} />
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Mkt cap" value={money(q.marketCap, q.currency)} />
              <Stat label="P/E" value={fmt(q.trailingPE, "ratio")} />
              <Stat label="Volume" value={fmtLarge(q.volume, "", q.currency)} />
              <Stat label="Open" value={fmt(q.open, "currency", q.currency)} />
              <Stat label="Day high" value={fmt(q.dayHigh, "currency", q.currency)} />
              <Stat label="Day low" value={fmt(q.dayLow, "currency", q.currency)} />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

/* ---------------- Price chart ---------------- */
export function PriceView({ data }: { data: any }) {
  const up = (data.stats?.returnPct ?? 0) >= 0;
  const color = up ? C.up : C.down;
  const gid = `g-${data.symbol}-${data.range}`.replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <Panel
      title={<span><span className="font-mono">{data.symbol}</span> price · {data.range.toUpperCase()}</span>}
      subtitle={`${data.points.length} points · ${data.interval} interval`}
      right={<div className={`text-sm font-semibold tabular-nums ${upDown(data.stats?.returnPct)}`}>{pct(data.stats?.returnPct)}</div>}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: C.axis, fontSize: 11 }} minTickGap={40} tickLine={false} axisLine={false} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.axis, fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => fmtLarge(v, "", data.currency)} />
            <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(v, "currency", data.currency), "Close"]} />
            <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Start" value={fmt(data.stats?.start, "currency", data.currency)} />
        <Stat label="End" value={fmt(data.stats?.end, "currency", data.currency)} />
        <Stat label="High" value={fmt(data.stats?.high, "currency", data.currency)} />
        <Stat label="Low" value={fmt(data.stats?.low, "currency", data.currency)} />
        <Stat label="Volatility" value={data.stats?.volatility != null ? `${(data.stats.volatility * 100).toFixed(1)}%` : "—"} />
        <Stat label="Max drawdown" value={pct(data.stats?.maxDrawdown)} tone="text-rose-400" />
      </div>
    </Panel>
  );
}

/* ---------------- Metrics table ---------------- */
export function MetricsView({ data }: { data: any }) {
  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const m of data.metrics) (g[m.category] ??= []).push(m);
    return Object.entries(g);
  }, [data.metrics]);
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · {data.name}</span>} subtitle={data.fxNote ? `${data.metrics.length} metrics · ${data.fxNote}` : `${data.metrics.length} metrics`}>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {groups.map(([cat, rows]) => (
          <div key={cat}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400/80">{cat}</div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((m) => (
                  <tr key={m.key} className="border-b border-zinc-800/60 last:border-0">
                    <td className="py-1 text-zinc-400">{m.label}</td>
                    <td className={`py-1 text-right tabular-nums ${m.key === "changePercent" ? upDown(m.value) : "text-zinc-100"}`}>
                      {m.key === "changePercent" ? pct(m.value, true) : m.format === "large" ? (m.key === "averageVolume" ? fmtLarge(m.value, "", data.currency) : money(m.value, data.currency)) : fmt(m.value, m.format as Fmt, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------- Financial statements ---------------- */
export function FinancialsView({ data }: { data: any }) {
  const defaults = data.fields.slice(0, 3).map((f: any) => f.key);
  const [shown, setShown] = useState<string[]>(defaults);
  if (!data.periods.length) return <Panel title={`${data.symbol} ${data.statement}`}><div className="text-sm text-zinc-400">No statement data returned.</div></Panel>;
  const title = { income: "Income statement", balance: "Balance sheet", cashflow: "Cash flow" }[data.statement as string];
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · {title}</span>} subtitle={`${data.period} · ${data.periods.length} periods${data.currency ? ` · ${data.currency}` : ""}`}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {data.fields.map((f: any, i: number) => {
          const on = shown.includes(f.key);
          return (
            <button key={f.key} onClick={() => setShown(on ? shown.filter((k) => k !== f.key) : [...shown, f.key])} className={`rounded-full border px-2 py-0.5 text-[11px] transition ${on ? "border-transparent text-zinc-950" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`} style={on ? { background: C.series[i % C.series.length] } : undefined}>
              {f.label}
            </button>
          );
        })}
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.periods} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="period" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => (data.period === "annual" ? String(v).slice(0, 4) : String(v).slice(0, 7))} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => fmtLarge(v, "", data.currency)} />
            <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [money(v, data.currency), data.fields.find((f: any) => f.key === n)?.label ?? n]} />
            <ReferenceLine y={0} stroke="#52525b" />
            {data.fields.map((f: any, i: number) => shown.includes(f.key) && <Bar key={f.key} dataKey={f.key} fill={C.series[i % C.series.length]} radius={[3, 3, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1 text-left font-medium">Line item</th>
              {data.periods.map((p: any) => <th key={p.period} className="py-1 text-right font-medium">{data.period === "annual" ? String(p.period).slice(0, 4) : String(p.period).slice(0, 7)}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.fields.map((f: any) => (
              <tr key={f.key} className="border-t border-zinc-800/60">
                <td className="py-1 text-zinc-400">{f.label}</td>
                {data.periods.map((p: any) => <td key={p.period} className="py-1 text-right tabular-nums text-zinc-200">{f.key === "dilutedEPS" ? fmt(p[f.key], "ratio") : fmtLarge(p[f.key], "", data.currency)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------------- Compare ---------------- */
const LOWER_IS_BETTER = new Set(["trailingPE", "forwardPE", "pegRatio", "priceToBook", "priceToSales", "evToRevenue", "evToEbitda", "debtToEquity", "beta", "shortPercentOfFloat", "totalDebt"]);
export function CompareView({ data }: { data: any }) {
  return (
    <Panel title="Comparison" subtitle={data.symbols.map((s: any) => s.symbol).join(" · ")}>
      {new Set(data.currencies ?? []).size > 1 && <div className="mb-2 text-[11px] text-amber-300/80">Mixed currencies ({[...new Set(data.currencies)].join(", ")}): absolute values are in each stock&apos;s own currency, so compare ratios and percentages.</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr>
              <th className="py-1.5 text-left text-xs font-medium text-zinc-500">Metric</th>
              {data.symbols.map((s: any) => (
                <th key={s.symbol} className="py-1.5 text-right">
                  <div className="font-mono text-zinc-100">{s.symbol}</div>
                  <div className="max-w-[140px] truncate text-[10px] font-normal text-zinc-500 ml-auto">{s.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((m: any) => {
              const mixed = new Set(data.currencies ?? []).size > 1 && (m.format === "large" || m.format === "currency");
              const vals = mixed ? [] : m.values.filter((v: any) => v != null && (!LOWER_IS_BETTER.has(m.key) || v > 0));
              const best = vals.length > 1 ? (LOWER_IS_BETTER.has(m.key) ? Math.min(...vals) : Math.max(...vals)) : null;
              return (
                <tr key={m.key} className="border-t border-zinc-800/60">
                  <td className="py-1.5 text-zinc-400">{m.label}</td>
                  {m.values.map((v: any, i: number) => (
                    <td key={i} className={`py-1.5 text-right tabular-nums ${v === best ? "font-semibold text-emerald-400" : "text-zinc-200"}`}>
                      {m.key === "changePercent" ? pct(v, true) : m.format === "large" ? (m.key === "averageVolume" ? fmtLarge(v, "", data.currencies?.[i]) : money(v, data.currencies?.[i])) : fmt(v, m.format, data.currencies?.[i])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">Green = best in group (lower is better for valuation multiples, leverage & risk).</div>
    </Panel>
  );
}

/* ---------------- Analysts ---------------- */
export function AnalystView({ data }: { data: any }) {
  const t = data.target;
  const lo = Math.min(t.low ?? Infinity, data.currentPrice ?? Infinity);
  const hi = Math.max(t.high ?? -Infinity, data.currentPrice ?? -Infinity);
  const pos = (v: number | null) => (v == null || !Number.isFinite(lo) || hi === lo ? null : ((v - lo) / (hi - lo)) * 100);
  const trend = [...data.trend].reverse();
  return (
    <Panel
      title={<span><span className="font-mono">{data.symbol}</span> · Analyst consensus</span>}
      subtitle={`${data.analystCount ?? "?"} analysts`}
      right={data.recommendation && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold uppercase text-emerald-300">{String(data.recommendation).replace("_", " ")}</span>}
    >
      {t.mean != null && (
        <div className="mb-5">
          <div className="mb-6 flex justify-between text-xs text-zinc-400">
            <span>Target mean <b className="text-zinc-100">{fmt(t.mean, "currency", data.currency)}</b></span>
            {data.currentPrice && <span>Implied upside <b className={upDown(t.mean / data.currentPrice - 1)}>{pct(t.mean / data.currentPrice - 1)}</b></span>}
          </div>
          <div className="relative h-2 rounded-full bg-gradient-to-r from-rose-500/40 via-amber-400/40 to-emerald-500/40">
            {[{ v: t.low, l: "Low" }, { v: t.mean, l: "Mean" }, { v: t.high, l: "High" }].map((x) => pos(x.v) != null && (
              <div key={x.l} className="absolute -top-5 -translate-x-1/2 text-center text-[10px] text-zinc-400" style={{ left: `${pos(x.v)}%` }}>
                {x.l}
                <div className="mx-auto mt-0.5 h-3 w-0.5 bg-zinc-300" />
              </div>
            ))}
            {pos(data.currentPrice) != null && <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-900 bg-sky-400" style={{ left: `${pos(data.currentPrice)}%` }} title="Current price" />}
          </div>
          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-zinc-500"><span>{fmt(t.low, "currency", data.currency)}</span><span className="text-sky-400">● price {fmt(data.currentPrice, "currency", data.currency)}</span><span>{fmt(t.high, "currency", data.currency)}</span></div>
        </div>
      )}
      {trend.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(p) => (p === "0m" ? "Now" : p)} />
              <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="strongBuy" name="Strong buy" stackId="a" fill="#059669" />
              <Bar dataKey="buy" name="Buy" stackId="a" fill="#34d399" />
              <Bar dataKey="hold" name="Hold" stackId="a" fill="#a1a1aa" />
              <Bar dataKey="sell" name="Sell" stackId="a" fill="#fb7185" />
              <Bar dataKey="strongSell" name="Strong sell" stackId="a" fill="#e11d48" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.recentActions?.length > 0 && (
        <div className="mt-3 space-y-1 text-xs">
          {data.recentActions.slice(0, 5).map((a: any, i: number) => (
            <div key={i} className="flex justify-between gap-2 border-t border-zinc-800/60 pt-1">
              <span className="text-zinc-500">{a.date}</span>
              <span className="flex-1 truncate text-zinc-300">{a.firm}</span>
              <span className={a.action === "up" ? "text-emerald-400" : a.action === "down" ? "text-rose-400" : "text-zinc-400"}>{a.from ? `${a.from} → ` : ""}{a.to}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Earnings ---------------- */
export function EarningsView({ data }: { data: any }) {
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · Earnings</span>} subtitle={[data.nextEarningsDate && `Next report: ${data.nextEarningsDate}`, data.currencyUncertain && "Amounts as reported by the data provider; currency unconfirmed"].filter(Boolean).join(" · ") || undefined}>
      {data.history.length > 0 && (
        <>
          <div className="mb-1 text-xs text-zinc-400">EPS actual vs. estimate</div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.history} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => String(v).slice(0, 7)} />
                <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="estimate" name="Estimate" fill="#3f3f46" radius={[3, 3, 0, 0]} />
                <Scatter dataKey="actual" name="Actual" fill={C.up}>
                  {data.history.map((h: any, i: number) => <Cell key={i} fill={h.actual != null && h.estimate != null && h.actual < h.estimate ? C.down : C.up} />)}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.history.map((h: any) => (
              <span key={h.quarter} className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${upDown(h.surprisePct)} bg-zinc-800/60`}>{String(h.quarter).slice(0, 7)} {pct(h.surprisePct)}</span>
            ))}
          </div>
        </>
      )}
      {data.quarterly.length > 0 && (
        <div className="mt-4 h-44">
          <div className="mb-1 text-xs text-zinc-400">Quarterly revenue & earnings</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.quarterly} margin={{ top: 5, right: 5, left: 0, bottom: 10 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: C.axis, fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => fmtLarge(v, "", data.currency)} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => money(v, data.currency)} />
              <Bar dataKey="revenue" name="Revenue" fill={C.series[0]} radius={[3, 3, 0, 0]} />
              <Line dataKey="earnings" name="Earnings" stroke={C.series[2]} strokeWidth={2} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.estimates.length > 0 && (
        <table className="mt-6 w-full text-xs">
          <thead><tr className="text-zinc-500"><th className="text-left font-medium">Period</th><th className="text-right font-medium">EPS est.</th><th className="text-right font-medium">Revenue est.</th><th className="text-right font-medium">Growth</th></tr></thead>
          <tbody>
            {data.estimates.map((e: any) => (
              <tr key={e.period} className="border-t border-zinc-800/60">
                <td className="py-1 text-zinc-400">{e.period} <span className="text-zinc-600">{e.endDate}</span></td>
                <td className="py-1 text-right tabular-nums">{fmt(e.epsAvg, "ratio")}</td>
                <td className="py-1 text-right tabular-nums">{money(e.revenueAvg, data.currency)}</td>
                <td className={`py-1 text-right tabular-nums ${upDown(e.growth)}`}>{pct(e.growth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ---------------- DCF ---------------- */
export function DcfView({ data }: { data: any }) {
  const a = data.assumptions;
  const cur = data.currency;
  return (
    <Panel
      title={<span><span className="font-mono">{data.symbol}</span> · DCF valuation</span>}
      subtitle={`${a.years}y · growth ${(a.growthRate * 100).toFixed(1)}% · WACC ${(a.discountRate * 100).toFixed(1)}% · terminal ${(a.terminalGrowth * 100).toFixed(1)}%${data.fxConversion ? ` · ${data.fxConversion.from} financials converted at ${data.fxConversion.rate.toFixed(2)}` : ""}`}
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Intrinsic value" value={<span className="text-lg">{fmt(data.intrinsicValue, "currency", cur)}</span>} />
        <Stat label="Price" value={<span className="text-lg">{fmt(data.price, "currency", cur)}</span>} />
        <Stat label="Upside" value={<span className="text-lg">{pct(data.upside)}</span>} tone={upDown(data.upside)} />
      </div>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.projections} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="year" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(y) => `Y${y}`} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => fmtLarge(v, "", data.financialCurrency ?? cur)} />
            <Tooltip {...tooltipStyle} formatter={(v: any) => money(v, data.financialCurrency ?? cur)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="fcf" name="Projected FCF" fill={C.series[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pv" name="Present value" fill={C.series[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="mb-1 text-xs text-zinc-400">Sensitivity — value per share (rows: WACC, cols: FCF growth)</div>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr><th />{data.sensitivity.growthRates.map((g: number) => <th key={g} className="px-1 py-1 text-right font-medium text-zinc-500">{(g * 100).toFixed(0)}%</th>)}</tr>
          </thead>
          <tbody>
            {data.sensitivity.grid.map((row: number[], i: number) => (
              <tr key={i} className="border-t border-zinc-800/60">
                <td className="py-1 pr-2 text-zinc-500">{(data.sensitivity.discountRates[i] * 100).toFixed(1)}%</td>
                {row.map((v, j) => {
                  const u = data.price && v != null ? v / data.price - 1 : 0;
                  return <td key={j} className="px-1 py-1 text-right" style={{ background: u >= 0 ? `rgba(52,211,153,${Math.min(0.35, u * 0.5)})` : `rgba(251,113,133,${Math.min(0.35, -u * 0.5)})` }}>{v == null ? "n/a" : fmt(v, "ratio")}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="TTM FCF" value={money(a.fcf, data.financialCurrency ?? cur)} />
        <Stat label="PV of FCF" value={money(data.breakdown.pvFcf, data.financialCurrency ?? cur)} />
        <Stat label="PV terminal" value={money(data.breakdown.pvTerminal, data.financialCurrency ?? cur)} />
        <Stat label="Net cash" value={money(data.breakdown.netCash, data.financialCurrency ?? cur)} tone={upDown(data.breakdown.netCash)} />
      </div>
    </Panel>
  );
}
