import { ArrowRight, CalendarClock, FileBarChart2, Layers, PieChart, TimerOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Analyzer } from "@/components/analysis/analyzer";
import { PortfolioTabs } from "@/components/portfolio/portfolio-tabs";
import { QuietRings } from "@/components/rings/quiet-rings";
import { RingGauge, RingLegend } from "@/components/rings/ring-gauge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { absPct, inr, inrCompact, signedPct } from "@/lib/format";
import { buildPortfolioView, type FullPortfolioView, type Note } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Analysis" };

const NOTE_ICON: Record<Note["kind"], typeof Layers> = { results: FileBarChart2, cluster: Layers, concentration: PieChart, upcoming: CalendarClock, stale: TimerOff };

/** The full reading of a portfolio: what it did over any period and why, then returns, risk and health. */
export default async function AnalysisPage() {
  const user = await requirePageUser();
  const view = await buildPortfolioView(user, await selectedPortfolioId());
  const switcher = <PortfolioTabs portfolios={view.portfolios.map((p) => ({ id: p.id, name: p.name }))} activeId={view.active?.id ?? null} />;
  const head = (
    <div>
      <h1 className="t-title-1 text-text">Analysis</h1>
      <p className="mt-1 text-sm text-muted">What your portfolio did, why, and what is worth knowing about it. Worked out from stored prices, never a forecast.</p>
    </div>
  );
  if (view.empty)
    return (
      <div className="nz-stagger mx-auto max-w-3xl space-y-5">
        {head}
        {switcher}
        <Card className="p-2">
          <QuietRings title="Nothing to analyse yet" body="Add what you own and the analysis fills in: what moved, why, and how it compares with the market." action={<ButtonLink href="/portfolio?add=1">Add what you own</ButtonLink>} />
        </Card>
      </div>
    );
  const v = view as FullPortfolioView;
  const priced = v.cards.filter((c) => c.pnlPct != null && Math.abs(c.pnl) >= 1);
  const winners = [...priced].sort((a, b) => b.pnl - a.pnl).filter((c) => c.pnl > 0).slice(0, 5);
  const losers = [...priced].sort((a, b) => a.pnl - b.pnl).filter((c) => c.pnl < 0).slice(0, 5);
  const scored = v.cards.filter((c) => c.health != null).sort((a, b) => a.health! - b.health!);
  const conc = v.risk.concentration;
  const div = v.risk.diversification;

  return (
    <div className="nz-stagger mx-auto max-w-3xl space-y-5">
      {head}
      {switcher}
      <Analyzer perf={v.performance} name={v.active!.name} />

      {v.notes.length > 0 && (
        <Card className="p-5 sm:p-6">
          <CardHeader overline="Worth knowing" title="What stands out right now" />
          <ul className="mt-3 divide-y divide-line">
            {v.notes.map((n) => {
              const Icon = NOTE_ICON[n.kind];
              return (
                <li key={n.id}>
                  <Link href={n.href} className="group -mx-2 flex gap-3 rounded-[12px] px-2 py-3.5 hover:bg-surface-2">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-text">{n.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Since you invested" title="Where the gains and losses are" right={<InfoTip k="unrealised" />} />
        <p className="mt-2 text-[15px] leading-6 text-muted">
          You put in <span className="num text-text">{inr(Math.round(v.valuation.invested))}</span> and it is worth <span className="num text-text">{inr(Math.round(v.valuation.value))}</span>: {v.valuation.unrealised >= 0 ? "a gain" : "a loss"} of{" "}
          <span className={`num font-medium ${v.valuation.unrealised >= 0 ? "text-gain" : "text-loss"}`}>{inr(Math.abs(Math.round(v.valuation.unrealised)))} ({absPct(v.valuation.unrealisedPct)})</span>.
          {v.xirr.xirr != null && (
            <>
              {" "}That is <span className="num text-text">{(v.xirr.xirr * 100).toFixed(1)}%</span> a year
              {v.xirr.niftyXirr != null && <>, against <span className="num text-text">{(v.xirr.niftyXirr * 100).toFixed(1)}%</span> for the same money put into the Nifty on the same dates</>}.
            </>
          )}
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <ReturnList title="Gained the most" rows={winners} empty="Nothing is in profit yet." />
          <ReturnList title="Lost the most" rows={losers} empty="Nothing is at a loss." />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Risk" title="What could hurt, and how concentrated you are" right={<InfoTip k="stress" />} />
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="If the Nifty fell 10%" value={`−${inrCompact(Math.abs(v.risk.stress10.loss))}`} sub={signedPct(v.risk.stress10.lossPct)} tone="text-loss" />
          <Fact label="Follows the market" value={`${v.risk.portfolioBeta.toFixed(2)}×`} sub={v.risk.portfolioBeta > 1.05 ? "swings more than the Nifty" : v.risk.portfolioBeta < 0.95 ? "swings less than the Nifty" : "about as much as the Nifty"} />
          <Fact label="Independent bets" value={div ? String(div.effectiveBets) : "—"} sub={div ? `from ${div.holdings} priced holdings` : "needs more history"} />
          <Fact label="Largest holding" value={absPct(conc.topStock?.weight ?? 0, 0)} sub={conc.topStock?.name ?? ""} />
        </dl>
        {conc.flags.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {conc.flags.map((f) => (
              <li key={f.label} className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-text">
                {f.label} is {absPct(f.weight, 0)} of this portfolio, above the {absPct(f.limit, 0)} level where one {f.kind === "sector" ? "sector's" : "company's"} news moves everything.
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No single stock or sector is above the usual concentration levels.</p>
        )}
        <ButtonLink href="/risk" variant="secondary" className="mt-4">
          Try a market fall of your own <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Health" title="How sound your holdings are" right={<InfoTip k="portfolioHealth" />} />
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <RingGauge outer={v.health.score} inner={v.innerRing} size={124} label="health" />
          <div className="min-w-[200px] flex-1">
            <RingLegend outer={v.health.score} inner={v.innerRing} />
            <p className="t-caption mt-3">{v.health.scored} of {v.health.total} holdings have a health score. Funds, gold and deposits are not scored.</p>
          </div>
        </div>
        {scored.length > 1 && (
          <div className="mt-5 grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
            <HealthList title="Weakest" rows={scored.slice(0, 3)} />
            <HealthList title="Strongest" rows={scored.slice(-3).reverse()} />
          </div>
        )}
      </Card>
    </div>
  );
}

type CardRow = FullPortfolioView["cards"][number];

function ReturnList({ title, rows, empty }: { title: string; rows: CardRow[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <div>
      <div className="text-[12px] font-medium text-subtle">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {rows.map((c) => (
            <li key={c.symbol}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                {c.href ? <Link href={c.href} className="min-w-0 truncate text-text hover:underline">{c.name}</Link> : <span className="min-w-0 truncate text-text">{c.name}</span>}
                <Delta amount={c.pnl} pct={c.pnlPct} compact showArrow={false} size="sm" />
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className={`h-full rounded-full ${c.pnl >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.max(3, (Math.abs(c.pnl) / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HealthList({ title, rows }: { title: string; rows: CardRow[] }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-subtle">{title}</div>
      <ul className="mt-2 space-y-2">
        {rows.map((c) => (
          <li key={c.symbol} className="flex items-baseline justify-between gap-2 text-sm">
            <Link href={c.href ?? "/portfolio"} className="min-w-0 truncate text-text hover:underline">{c.name}</Link>
            <span className={`num font-medium ${c.health! >= 70 ? "text-gain" : c.health! >= 45 ? "text-text" : "text-loss"}`}>{c.health}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, value, sub, tone = "text-text" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-line bg-surface-2/60 p-3">
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className={`num mt-0.5 text-[19px] font-semibold tracking-[-0.02em] ${tone}`}>{value}</dd>
      {sub && <dd className="truncate text-[12px] text-subtle">{sub}</dd>}
    </div>
  );
}
