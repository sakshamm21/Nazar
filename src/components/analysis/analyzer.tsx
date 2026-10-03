"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PriceChart } from "@/components/charts/price-chart";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { absPct, dayLabel, inr, inrCompact, signedPct } from "@/lib/format";
import { GROUP_COLOR, isManualSymbol } from "@/lib/instruments/asset-classes";
import { PERIODS, explain, type Performance, type PeriodId } from "@/lib/portfolio/performance";

const tone = (n: number | null | undefined) => (n == null || Math.abs(n) < 1e-9 ? "text-muted" : n > 0 ? "text-gain" : "text-loss");
const signed = (n: number) => inr(Math.round(n), { sign: true, decimals: 0 });

/**
 * The analyzer: pick a period and read what your portfolio did, why (which holdings, and how much
 * was simply the market), and how the ride went. Everything is worked out from stored prices.
 */
export function Analyzer({ perf, name }: { perf: Performance; name: string }) {
  const periods = PERIODS.filter((p) => perf.periods[p.id]);
  const [period, setPeriod] = useState<PeriodId>(periods.some((p) => p.id === "1M") ? "1M" : (periods[0]?.id ?? "1D"));
  const [all, setAll] = useState(false);
  const a = perf.periods[period];
  const story = useMemo(() => (a ? explain(a) : null), [a]);
  const points = useMemo(() => {
    if (!a) return [];
    const start = Math.max(0, perf.dates.indexOf(a.from) - (a.period === "1D" ? 5 : 0));
    const base = perf.nifty[start];
    return perf.dates.slice(start).map((date, k) => ({ date, value: perf.values[start + k], compare: base && perf.nifty[start + k] != null ? (perf.nifty[start + k]! / base) * perf.values[start] : null }));
  }, [a, perf]);

  if (!a || !story) return <Card className="p-6 text-sm text-muted">The analysis appears once Nazar has two days of prices for this portfolio.</Card>;

  const movers = a.contributors.filter((c) => Math.abs(c.amount) >= 1).sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
  const shown = all ? movers : movers.slice(0, 8);
  const max = Math.max(1, ...movers.map((c) => Math.abs(c.amount)));
  const gap = a.changePct != null && a.niftyPct != null ? a.changePct - a.niftyPct : null;
  const mk = Math.abs(a.marketPart), own = Math.abs(a.ownPart);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Period" className="flex gap-1 rounded-full border border-line bg-surface-1 p-1">
          {periods.map((p) => (
            <button key={p.id} role="radio" aria-checked={period === p.id} onClick={() => { setPeriod(p.id); setAll(false); }} className={cn("num rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors", period === p.id ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-subtle">{name} · {dayLabel(a.from, "en", false)} to {dayLabel(a.to, "en", false)}</span>
      </div>

      {/* What */}
      <Card className="nz-ring p-5 sm:p-6">
        <div className="t-overline">What happened</div>
        <h2 className={cn("t-title-1 mt-1", tone(Math.abs(a.changePct ?? 0) < 0.0005 ? 0 : a.change))}>{story.headline}</h2>
        <p className="mt-2 text-[15px] leading-6 text-muted">{story.what}</p>
        <div className="mt-3">
          <PriceChart points={points} height={170} compare={{ label: "Same money in the Nifty" }} format={(v) => inr(Math.round(v), { decimals: 0 })} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Tile label="You" value={signedPct(a.changePct)} cls={tone(a.changePct)} />
          <Tile label="Nifty 50" value={signedPct(a.niftyPct)} cls={tone(a.niftyPct)} />
          <Tile label="Difference" value={gap == null ? "—" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${Math.abs(gap * 100).toFixed(1)} pts`} cls={tone(gap)} />
        </dl>
      </Card>

      {/* Why */}
      <Card className="p-5 sm:p-6">
        <div className="t-overline">Why</div>
        <h2 className="t-title-2 mt-0.5 text-text">What moved it</h2>
        <ul className="mt-3 space-y-1.5 text-[15px] leading-6 text-muted">
          {story.why.map((w) => (
            <li key={w} className="flex gap-2.5">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>

        {a.niftyPct != null && mk + own > 0 && (
          <div className="mt-5">
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Market ${signed(a.marketPart)}, your holdings ${signed(a.ownPart)}`}>
              <div className="h-full rounded-l-full bg-subtle" style={{ width: `${(mk / (mk + own)) * 100}%` }} />
              <div className="h-full flex-1 rounded-r-full bg-accent" />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px]">
              <span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-subtle" aria-hidden />The market <span className={cn("num font-semibold", tone(a.marketPart))}>{signed(a.marketPart)}</span></span>
              <span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />Specific to what you own <span className={cn("num font-semibold", tone(a.ownPart))}>{signed(a.ownPart)}</span></span>
            </div>
          </div>
        )}

        <ul className="mt-5 space-y-2.5">
          {shown.map((c) => {
            const w = (Math.abs(c.amount) / max) * 50;
            const label = <span className="truncate font-medium text-text">{c.name}</span>;
            return (
              <li key={c.symbol}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  {isManualSymbol(c.symbol) ? label : <Link href={`/stock/${encodeURIComponent(c.symbol)}`} className="min-w-0 truncate hover:underline">{label}</Link>}
                  <span className={cn("num shrink-0 font-medium", tone(c.amount))}>
                    {signed(c.amount)} <span className="opacity-80">({signedPct(c.pct)})</span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-surface-2" aria-hidden>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                  <span className={cn("absolute inset-y-0 rounded-full", c.amount >= 0 ? "bg-gain" : "bg-loss")} style={c.amount >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        {movers.length === 0 && <p className="mt-4 text-sm text-muted">Nothing you own changed in value in this period.</p>}
        {movers.length > 8 && (
          <button onClick={() => setAll((x) => !x)} className="mt-4 text-sm font-semibold text-accent">
            {all ? "Show fewer" : `Show all ${movers.length}`}
          </button>
        )}

        {a.groups.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            {a.groups.map((g) => (
              <span key={g.group} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px]">
                <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[g.group] }} aria-hidden />
                <span className="text-text">{g.group}</span>
                <span className={cn("num font-semibold", tone(g.amount))}>{inrCompact(g.amount, { sign: true })}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* How */}
      <Card className="p-5 sm:p-6">
        <div className="t-overline">How it went</div>
        <h2 className="t-title-2 mt-0.5 text-text">Against the market, and the ride</h2>
        <ul className="mt-3 space-y-1.5 text-[15px] leading-6 text-muted">
          {story.how.map((w) => (
            <li key={w} className="flex gap-2.5">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
        {a.period !== "1D" && (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
            <Tile label="Best day" value={a.bestDay ? signedPct(a.bestDay.pct) : "—"} sub={a.bestDay ? dayLabel(a.bestDay.date, "en", false) : undefined} cls={tone(a.bestDay?.pct)} />
            <Tile label="Roughest day" value={a.worstDay ? signedPct(a.worstDay.pct) : "—"} sub={a.worstDay ? dayLabel(a.worstDay.date, "en", false) : undefined} cls={tone(a.worstDay?.pct)} />
            <Tile label="Deepest dip from a high" value={a.drawdown < 0 ? `−${absPct(a.drawdown)}` : "none"} cls={a.drawdown < -0.0005 ? "text-loss" : "text-muted"} />
            <Tile label="Days up / down" value={`${a.upDays} / ${a.downDays}`} cls="text-text" />
          </dl>
        )}
      </Card>

      <p className="t-caption px-1">
        Worked out from what you own today, priced at each day&apos;s close. Purchases and sales along the way are not replayed.
        {perf.covered < perf.total ? ` ${perf.total - perf.covered} holding${perf.total - perf.covered === 1 ? " has" : "s have"} too little price history and are held flat.` : ""} Nazar explains; it does not predict.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className={cn("num mt-0.5 text-[17px] font-semibold tracking-[-0.02em]", cls)}>{value}</dd>
      {sub && <dd className="text-[12px] text-subtle">{sub}</dd>}
    </div>
  );
}
