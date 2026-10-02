"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Minus, X } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, fmtLarge, money, pct, upDown } from "@/lib/format";
import { Panel, Stat, chartColors as C, tooltipStyle } from "./ui";

const p = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const r2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));

/* ---------------- Risk & return ---------------- */
export function RiskReturnView({ data }: { data: any }) {
  const s = data.stats;
  return (
    <Panel
      title={<span><span className="font-mono">{data.symbol}</span> vs <span className="font-mono">{data.benchmark}</span> · Risk &amp; return</span>}
      subtitle={`${data.range} · ${data.interval === "1d" ? "daily" : "weekly"} returns · risk-free rate ${p(data.riskFree)}`}
      right={<div className={`text-sm font-semibold tabular-nums ${upDown(s.cagr)}`}>{p(s.cagr)} / yr</div>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="CAGR (index)" value={<>{p(s.cagr)} <span className="text-subtle">({p(s.benchmarkCagr)})</span></>} tone={upDown(s.cagr)} />
        <Stat label="Volatility (index)" value={<>{p(s.volatility)} <span className="text-subtle">({p(s.benchmarkVolatility)})</span></>} />
        <Stat label="Sharpe · Sortino" value={`${r2(s.sharpe)} · ${r2(s.sortino)}`} />
        <Stat label="Max drawdown" value={p(s.maxDrawdown)} tone="text-loss" />
        <Stat label="Beta" value={r2(s.beta)} />
        <Stat label="Alpha (annual)" value={p(s.alpha)} tone={upDown(s.alpha)} />
        <Stat label="Correlation" value={r2(s.correlation)} />
        <Stat label="Total return" value={p(s.totalReturn)} tone={upDown(s.totalReturn)} />
      </div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: C.axis, fontSize: 11 }} minTickGap={50} tickLine={false} axisLine={false} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.axis, fontSize: 11 }} width={44} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={100} stroke="var(--line-strong)" strokeDasharray="4 4" />
            <Line dataKey="stock" name={`${data.symbol} (growth of 100)`} stroke={C.series[0]} strokeWidth={2} dot={false} />
            <Line dataKey="benchmark" name={data.benchmark} stroke="var(--subtle)" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/* ---------------- Correlation ---------------- */
export function CorrelationView({ data }: { data: any }) {
  const bg = (v: number, diag: boolean) => (diag ? "var(--surface-3)" : v >= 0 ? `color-mix(in srgb, var(--accent) ${Math.round(Math.min(0.6, v * 0.65) * 100)}%, transparent)` : `color-mix(in srgb, var(--loss) ${Math.round(Math.min(0.6, -v * 0.65) * 100)}%, transparent)`);
  return (
    <Panel title="Correlation matrix" subtitle={`${data.range} · ${data.observations} ${data.interval === "1d" ? "daily" : "weekly"} returns · 1 = move together, 0 = unrelated, −1 = opposite`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm tabular-nums">
          <thead>
            <tr>
              <th />
              {data.symbols.map((s: string) => <th key={s} className="px-2 py-1 text-right font-mono text-xs font-medium text-muted">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.symbols.map((s: string, i: number) => (
              <tr key={s}>
                <td className="py-1 pr-2 font-mono text-xs text-muted">{s}</td>
                {data.matrix[i].map((v: number, j: number) => (
                  <td key={j} className="px-2 py-1.5 text-right text-text" style={{ background: bg(v, i === j) }} title={`${s} vs ${data.symbols[j]}: ${v}`}>{v.toFixed(2)}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-1 pr-2 text-xs text-subtle">Volatility</td>
              {data.volatility.map((v: number, j: number) => <td key={j} className="px-2 py-1 text-right text-xs text-muted">{p(v)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-subtle">Green = move together (less diversification), red = move opposite. Low correlations diversify a portfolio.</div>
    </Panel>
  );
}

/* ---------------- Comparable valuation ---------------- */
const MULT: [string, string][] = [["trailingPE", "P/E"], ["forwardPE", "Fwd P/E"], ["evToEbitda", "EV/EBITDA"], ["priceToBook", "P/B"], ["priceToSales", "P/S"]];
const METHOD: Record<string, string> = { trailingPE: "P/E × EPS", forwardPE: "Forward P/E × forward EPS", evToEbitda: "EV/EBITDA − net debt", priceToBook: "P/B × book value", priceToSales: "P/S × revenue" };
export function CompsView({ data }: { data: any }) {
  const cur = data.currency;
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · Comparable company valuation</span>} subtitle={`${data.peers.length} peers${data.missingPeers?.length ? ` · no data: ${data.missingPeers.join(", ")}` : ""}${data.fxNote ? ` · ${data.fxNote}` : ""}`}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Price" value={<span className="text-lg">{fmt(data.price, "currency", cur)}</span>} />
        <Stat label="Blended fair value" value={<span className="text-lg">{fmt(data.blended, "currency", cur)}</span>} />
        <Stat label="Model vs price" value={<span className="text-lg">{pct(data.upside)}</span>} tone={upDown(data.upside)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs tabular-nums">
          <thead><tr className="text-subtle"><th className="py-1 text-left font-medium">Company</th>{MULT.map(([, l]) => <th key={l} className="py-1 text-right font-medium">{l}</th>)}</tr></thead>
          <tbody>
            {[data.target, ...data.peers].map((r: any, i: number) => (
              <tr key={r.symbol} className={`border-t border-line/60 ${i === 0 ? "font-semibold text-accent" : "text-text"}`}>
                <td className="py-1"><span className="font-mono">{r.symbol}</span>{i === 0 && <span className="ml-1 text-[10px] text-subtle">this stock</span>}</td>
                {MULT.map(([k]) => <td key={k} className="py-1 text-right">{r2(r[k])}</td>)}
              </tr>
            ))}
            <tr className="border-t border-line-strong text-text"><td className="py-1 font-medium">Peer median</td>{MULT.map(([k]) => <td key={k} className="py-1 text-right font-medium">{r2(data.medians[k])}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-1 text-xs">
        {MULT.map(([k]) => (
          <div key={k} className="flex justify-between border-t border-line/60 pt-1">
            <span className="text-muted">{METHOD[k]}</span>
            <span className={`tabular-nums ${data.implied[k] == null ? "text-subtle" : upDown(data.price ? data.implied[k] / data.price - 1 : null)}`}>
              {data.implied[k] == null ? "n/a" : `${fmt(data.implied[k], "currency", cur)} (${pct(data.price ? data.implied[k] / data.price - 1 : null)})`}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------- DuPont ---------------- */
export function DupontView({ data }: { data: any }) {
  const ys = data.years.map((y: any) => ({ ...y, label: String(y.period).slice(0, 4), roePct: y.roe * 100 }));
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · DuPont ROE analysis</span>} subtitle="ROE = net margin × asset turnover × equity multiplier (leverage)">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ys} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip {...tooltipStyle} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "ROE"]} />
            <Bar dataKey="roePct" name="ROE" fill={C.series[1]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-3 w-full text-xs tabular-nums">
        <thead><tr className="text-subtle"><th className="py-1 text-left font-medium">Fiscal year</th><th className="text-right font-medium">Net margin</th><th className="text-right font-medium">× Asset turnover</th><th className="text-right font-medium">× Leverage</th><th className="text-right font-medium">= ROE</th></tr></thead>
        <tbody>
          {ys.map((y: any) => (
            <tr key={y.period} className="border-t border-line/60">
              <td className="py-1 text-muted">{y.period}</td>
              <td className="text-right">{p(y.netMargin)}</td>
              <td className="text-right">{y.assetTurnover?.toFixed(2)}×</td>
              <td className="text-right">{y.equityMultiplier?.toFixed(2)}×</td>
              <td className="text-right font-semibold text-text">{p(y.roe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[11px] text-subtle">Amounts in {data.currency}. Rising ROE from margin or turnover is healthier than ROE driven by leverage.</div>
    </Panel>
  );
}

/* ---------------- Financial health ---------------- */
export function HealthView({ data }: { data: any }) {
  const f = data.fScore;
  const band = f >= 7 ? ["Strong", "text-accent bg-accent-soft"] : f >= 4 ? ["Average", "text-warn bg-warn-soft"] : ["Weak", "text-loss bg-loss-soft"];
  const z = data.altman;
  const zTone = z?.zone === "Safe" ? "text-accent bg-accent-soft" : z?.zone === "Grey" ? "text-warn bg-warn-soft" : "text-loss bg-loss-soft";
  const groups = [...new Set(data.tests.map((t: any) => t.group))] as string[];
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · Financial health</span>} subtitle={`Fiscal ${String(data.periods[0]).slice(0, 4)} → ${String(data.periods[1]).slice(0, 4)}`}>
      {data.note && <div className="mb-3 rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">{data.note}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line p-3">
          <div className="text-[11px] uppercase tracking-wide text-subtle">Piotroski F-score</div>
          <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums">{f}</span><span className="text-sm text-subtle">/ 9</span><span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${band[1]}`}>{band[0]}</span></div>
          {data.scoredTests < 9 && <div className="mt-1 text-[11px] text-subtle">{9 - data.scoredTests} test(s) had no data</div>}
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-[11px] uppercase tracking-wide text-subtle">Altman Z-score</div>
          {z ? (
            <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums">{z.z.toFixed(2)}</span><span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${zTone}`}>{z.zone} zone</span></div>
          ) : (
            <div className="mt-2 text-sm text-subtle">Not enough data</div>
          )}
          <div className="mt-1 text-[11px] text-subtle">&gt; 2.99 safe · 1.81–2.99 grey · &lt; 1.81 distress</div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent/80">{g}</div>
            <ul className="space-y-1 text-xs">
              {data.tests.filter((t: any) => t.group === g).map((t: any) => (
                <li key={t.name} className="flex gap-1.5">
                  {t.pass === true ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-label="pass" /> : t.pass === false ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-loss" aria-label="fail" /> : <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-label="no data" />}
                  <span><span className="text-text">{t.name}</span><br /><span className="text-subtle">{t.detail}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------- SIP backtest ---------------- */
export function SipView({ data }: { data: any }) {
  const cur = data.currency;
  const series = data.schedule.map((r: any) => ({ date: String(r.date).slice(0, 7), invested: r.invested, value: r.value }));
  return (
    <Panel
      title={<span><span className="font-mono">{data.symbol}</span> · SIP backtest</span>}
      subtitle={`${money(data.monthlyAmount, cur)} every month · ${data.installments} instalments over ${data.years} years`}
      right={<div className={`text-sm font-semibold tabular-nums ${upDown(data.xirr)}`}>XIRR {p(data.xirr)}</div>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Invested" value={money(data.invested, cur)} />
        <Stat label="Value today" value={money(data.value, cur)} />
        <Stat label="Gain" value={`${money(data.gain, cur)} (${p(data.absoluteReturn)})`} tone={upDown(data.gain)} />
        <Stat label="Lump sum instead" value={`${money(data.lumpSum.value, cur)} (${p(data.lumpSum.return)})`} />
      </div>
      <div className="mt-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: C.axis, fontSize: 11 }} minTickGap={40} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} width={60} tickLine={false} axisLine={false} tickFormatter={(v) => fmtLarge(v, "", cur)} />
            <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [money(v, cur), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area dataKey="invested" name="Invested" stroke="var(--subtle)" fill="var(--subtle)" fillOpacity={0.12} strokeWidth={1.5} />
            <Area dataKey="value" name="Portfolio value" stroke={C.series[1]} fill={C.series[1]} fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-[11px] text-subtle">Invests at each month&apos;s closing price; ignores costs and taxes. Past returns don&apos;t predict future returns.</div>
    </Panel>
  );
}

/* ---------------- Technicals ---------------- */
export function TechnicalsView({ data }: { data: any }) {
  const l = data.last, cur = data.currency;
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · Technical indicators</span>} subtitle={`As of ${l.date} · educational, not trading advice`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Price" value={fmt(l.price, "currency", cur)} />
        <Stat label="RSI (14)" value={l.rsi14?.toFixed(0)} tone={l.rsi14 >= 70 ? "text-loss" : l.rsi14 <= 30 ? "text-accent" : undefined} />
        <Stat label="From 52W high" value={p(data.range52w.fromHigh)} tone="text-loss" />
        <Stat label="MACD vs signal" value={`${l.macd?.toFixed(2)} / ${l.macdSignal?.toFixed(2)}`} tone={upDown(l.macd - l.macdSignal)} />
      </div>
      <div className="mt-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: C.axis, fontSize: 11 }} minTickGap={50} tickLine={false} axisLine={false} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.axis, fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => fmtLarge(v, "", cur)} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="close" name="Price" stroke={C.series[0]} strokeWidth={2} dot={false} />
            <Line dataKey="sma50" name="50-day avg" stroke={C.series[2]} strokeWidth={1.5} dot={false} />
            <Line dataKey="sma200" name="200-day avg" stroke={C.series[3]} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fill: C.axis, fontSize: 10 }} width={56} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} formatter={(v: any) => [v, "RSI"]} />
            <ReferenceLine y={70} stroke="var(--loss)" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="var(--gain)" strokeDasharray="3 3" />
            <Line dataKey="rsi" name="RSI" stroke="var(--subtle)" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-text">
        {data.signals.map((s: string) => <li key={s}>• {s}</li>)}
      </ul>
    </Panel>
  );
}
