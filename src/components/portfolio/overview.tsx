"use client";
import { ArrowRight, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AllocationDonut, type DonutSlice } from "@/components/charts/allocation-donut";
import { Sparkline } from "@/components/charts/sparkline";
import { ValueChart } from "@/components/charts/value-chart";
import { RingGauge, RingLegend } from "@/components/rings/ring-gauge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { absPct, inr, inrCompact, signedPct } from "@/lib/format";
import { ASSET_META, shortCode, type AssetClass } from "@/lib/instruments/asset-classes";
import { AssetIcon } from "./asset-ui";

export type OverviewCard = { symbol: string; name: string; assetClass: AssetClass; href: string | null; value: number; weight: number; pnl: number; pnlPct: number | null; changePct: number | null; dayImpact: number | null; health: number | null; sparkline: number[] };
export type OverviewData = {
  name: string;
  asOf: string;
  perf: { dates: string[]; values: number[]; nifty: (number | null)[] };
  valuation: { value: number; invested: number; unrealised: number; unrealisedPct: number | null; dayChange: number; dayChangePct: number | null };
  niftyPct: number | null;
  xirr: { xirr: number | null; niftyXirr: number | null; dated: number };
  allocation: DonutSlice[];
  sectors: { sector: string; weight: number; value: number }[];
  health: { score: number | null; scored: number; total: number };
  innerRing: number | null;
  risk: { stressLoss: number; effectiveBets: number | null; clusterCount: number | null; clusterWeight: number | null };
  cards: OverviewCard[];
};

type Sort = "value" | "today" | "overall";
const SORTS: { id: Sort; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "today", label: "Today" },
  { id: "overall", label: "Overall" },
];

/** The reading side of Portfolio: every chart and number about what you own, nothing to edit. */
export function Overview({ d }: { d: OverviewData }) {
  const [sort, setSort] = useState<Sort>("value");
  const [desc, setDesc] = useState(true);
  const rows = useMemo(() => {
    const key = (c: OverviewCard) => (sort === "value" ? c.value : sort === "today" ? (c.changePct ?? -Infinity) : (c.pnlPct ?? -Infinity));
    return [...d.cards].sort((a, b) => (desc ? key(b) - key(a) : key(a) - key(b)));
  }, [d.cards, sort, desc]);
  const movers = d.cards.filter((c) => c.dayImpact != null && Math.abs(c.dayImpact) >= 1).sort((a, b) => b.dayImpact! - a.dayImpact!);
  const up = movers.filter((c) => c.dayImpact! > 0).slice(0, 3), down = movers.filter((c) => c.dayImpact! < 0).slice(-3).reverse();
  const maxW = Math.max(0.01, ...d.cards.map((c) => c.weight));
  const v = d.valuation;

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="t-overline">{d.name} · as of {d.asOf}</div>
          <InfoTip k="value" />
        </div>
        <div className="mt-2">
          <ValueChart dates={d.perf.dates} values={d.perf.values} nifty={d.perf.nifty} height={260} footnote="The line is what you own today, priced on each past day. Drag along it to read any date." />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Today">
            <Delta amount={v.dayChange} compact showArrow={false} size="sm" />
            <div className="num text-[12px] text-subtle">{signedPct(v.dayChangePct)}{d.niftyPct != null ? ` · Nifty ${signedPct(d.niftyPct)}` : ""}</div>
          </Stat>
          <Stat label="Gain or loss so far" tip="unrealised">
            <Delta amount={v.unrealised} compact showArrow={false} size="sm" />
            <div className="num text-[12px] text-subtle">{signedPct(v.unrealisedPct)}</div>
          </Stat>
          <Stat label="Yearly return (XIRR)" tip="xirr">
            <div className="num text-[15px] font-medium text-text">{d.xirr.xirr != null ? `${(d.xirr.xirr * 100).toFixed(1)}%` : "—"}</div>
            <div className="num text-[12px] text-subtle">{d.xirr.niftyXirr != null ? `Nifty ${(d.xirr.niftyXirr * 100).toFixed(1)}%` : d.xirr.dated ? "" : "add purchase dates"}</div>
          </Stat>
          <Stat label="Invested">
            <div className="num text-[15px] font-medium text-text">{inrCompact(v.invested)}</div>
            <div className="num text-[12px] text-subtle">{d.cards.length} holdings</div>
          </Stat>
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <Card className="min-w-0 p-5 sm:p-6">
          <CardHeader overline="Allocation" title="What you own" />
          <div className="mt-4">
            <AllocationDonut slices={d.allocation} total={v.value} />
          </div>
        </Card>

        <Card className="min-w-0 p-5 sm:p-6">
          <CardHeader overline="Today" title="Biggest movers" right={<Link href="/analysis" className="text-sm font-medium text-accent">Why?</Link>} />
          {movers.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing you own has moved today.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MoverList title="Added the most" items={up} empty="Nothing rose today." />
              <MoverList title="Took the most away" items={down} empty="Nothing fell today." />
            </div>
          )}
          {d.sectors.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-text">
                Your stocks, by sector <InfoTip k="sector" />
              </div>
              <ul className="mt-3 space-y-2.5">
                {d.sectors.slice(0, 5).map((s) => (
                  <li key={s.sector}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="text-muted">{s.sector}</span>
                      <span className="num text-text">{absPct(s.weight, 0)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-[var(--ease-calm)]" style={{ width: `${Math.max(2, s.weight * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
          <RingGauge outer={d.health.score} inner={d.innerRing} size={124} label="health" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="t-title-2 text-text">Health and hidden risk</h2>
              <InfoTip k="portfolioHealth" />
            </div>
            <div className="mt-3 max-w-xs">
              <RingLegend outer={d.health.score} inner={d.innerRing} />
            </div>
            <p className="mt-3 text-sm text-muted">
              If the Nifty fell 10%, this portfolio would lose about <span className="num font-medium text-loss">{inrCompact(Math.abs(d.risk.stressLoss))}</span>.
              {d.risk.effectiveBets != null && <> It behaves like <span className="num font-medium text-text">{d.risk.effectiveBets}</span> independent bets.</>}
              {d.risk.clusterCount != null && d.risk.clusterCount >= 2 && <> <span className="num font-medium text-text">{d.risk.clusterCount}</span> holdings ({absPct(d.risk.clusterWeight, 0)} of your money) tend to move together.</>}
            </p>
          </div>
          <ButtonLink href="/risk" variant="secondary">
            Test a market fall <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <CardHeader overline="Holdings" title={`All ${d.cards.length}, compared`} />
          <div role="radiogroup" aria-label="Sort holdings by" className="flex items-center gap-1 rounded-[12px] border border-line bg-surface-2 p-1">
            {SORTS.map((s) => (
              <button key={s.id} role="radio" aria-checked={sort === s.id} onClick={() => (sort === s.id ? setDesc((x) => !x) : (setSort(s.id), setDesc(true)))} className={cn("flex items-center gap-1 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-colors", sort === s.id ? "bg-surface-1 text-text shadow-[var(--shadow-card)]" : "text-muted hover:text-text")}>
                {s.label}
                {sort === s.id && <ArrowUpDown className="h-3 w-3" aria-label={desc ? "highest first" : "lowest first"} />}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {rows.map((c) => (
            <li key={c.symbol}>
              <Link href={c.href ?? "/portfolio?tab=manage"} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 sm:px-6">
                <AssetIcon assetClass={c.assetClass} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-text">{c.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-surface-3 sm:w-28">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${(c.weight / maxW) * 100}%` }} />
                    </div>
                    <span className="truncate text-[12px] text-subtle">
                      {absPct(c.weight, 0)} · {c.assetClass === "stock" ? shortCode(c.symbol) : ASSET_META[c.assetClass].label}
                      {c.health != null && <> · health {c.health}</>}
                    </span>
                  </div>
                </div>
                {c.sparkline.length > 1 && <Sparkline values={c.sparkline} width={72} height={28} className="hidden shrink-0 md:block" />}
                <div className="w-[92px] shrink-0 text-right">
                  <div className="num text-[15px] font-medium text-text">{inr(c.value)}</div>
                  <div className="num text-[12px] text-subtle">{c.changePct != null ? <span className={c.changePct > 0 ? "text-gain" : c.changePct < 0 ? "text-loss" : ""}>{signedPct(c.changePct)} today</span> : "no daily price"}</div>
                </div>
                <div className="hidden w-[96px] shrink-0 text-right sm:block">
                  <Delta amount={c.pnl} compact showArrow={false} size="sm" />
                  <div className="num text-[12px] text-subtle">{signedPct(c.pnlPct)} overall</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, tip, children }: { label: string; tip?: Parameters<typeof InfoTip>[0]["k"]; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[12px] text-subtle">
        {label}
        {tip && <InfoTip k={tip} />}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function MoverList({ title, items, empty }: { title: string; items: OverviewCard[]; empty: string }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-subtle">{title}</div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((c) => (
            <li key={c.symbol} className="flex items-baseline justify-between gap-2 text-sm">
              <Link href={c.href ?? "/portfolio"} className="min-w-0 truncate text-text hover:underline">
                {c.name}
              </Link>
              <Delta amount={c.dayImpact} compact showArrow={false} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
