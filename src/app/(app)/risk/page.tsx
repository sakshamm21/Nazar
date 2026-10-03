import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StressSlider } from "@/components/risk/stress-slider";
import { RingGauge, RingLegend } from "@/components/rings/ring-gauge";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { InfoTip } from "@/components/ui/info-tip";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { correlationMatrix } from "@/lib/analytics/models";
import { absPct } from "@/lib/format";
import { priceHistory, shiftDate } from "@/lib/market/store";
import { buildPortfolioView, type FullPortfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Hidden risks" };

export default async function RiskPage() {
  const user = await requirePageUser();
  const view = await buildPortfolioView(user, await selectedPortfolioId());
  if (view.empty) redirect("/home");
  const v = view as FullPortfolioView;
  const db = await getDb();
  const symbols = v.cards.map((c) => c.symbol);
  const hist = await priceHistory(db, symbols, v.sources, shiftDate(v.tradeDate!, -400), v.tradeDate!);
  const withHist = symbols.filter((s) => (hist.get(s)?.size ?? 0) > 60);
  let matrix: (number | null)[][] = [];
  try {
    matrix = withHist.length >= 2 ? correlationMatrix(withHist.map((s) => new Map([...hist.get(s)!].slice(-253)))).matrix : [];
  } catch {
    matrix = [];
  }
  const name = (s: string) => v.cards.find((c) => c.symbol === s)?.name ?? s;
  const div = v.risk.diversification;
  const conc = v.risk.concentration;
  return (
    <div className="space-y-5 lg:space-y-6">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <div>
        <div className="t-overline">{v.active!.ownerLabel ? `${v.active!.ownerLabel}'s portfolio` : v.active!.name}</div>
        <h1 className="t-title-1 mt-1 text-text">Hidden risks</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Three checks most investors never run: what a market fall would cost you, which holdings secretly move together, and how concentrated your money is.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        <Card className="min-w-0 p-5 sm:p-6 lg:col-span-7">
          <CardHeader overline="Stress test" title="What a market fall could cost you" right={<InfoTip k="stress" />} />
          <div className="mt-5">
            <StressSlider holdings={v.cards.map((c) => ({ symbol: c.symbol, name: c.name, value: c.value, beta: c.beta, assetClass: c.assetClass }))} />
          </div>
        </Card>

        <div className="min-w-0 space-y-5 lg:col-span-5 lg:space-y-6">
          <Card className="p-5 sm:p-6">
            <CardHeader overline="The two rings" title="Health and diversification" />
            <div className="mt-4 flex items-center gap-5">
              <RingGauge outer={v.health.score} inner={v.innerRing} size={128} label="health" />
              <div className="flex-1">
                <RingLegend outer={v.health.score} inner={v.innerRing} />
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              <b className="font-medium text-text">Outer:</b> financial health of your holdings, weighted by value. <b className="font-medium text-text">Inner:</b> independent bets, your largest position and how strongly you swing with the market.
            </p>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader overline="Concentration" title="Where your eggs are" right={<InfoTip k="concentration" />} />
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Largest holding</dt>
                <dd className="num text-text">
                  {conc.topStock?.name} · {absPct(conc.topStock?.weight ?? 0, 0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Top 3 holdings</dt>
                <dd className="num text-text">{absPct(conc.top3, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Largest sector</dt>
                <dd className="num text-text">
                  {conc.sectors[0]?.sector} · {absPct(conc.sectors[0]?.weight ?? 0, 0)}
                </dd>
              </div>
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
          </Card>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Correlation" title="Less diversified than it looks" right={<InfoTip k="effectiveBets" />} />
        {div ? (
          <>
            <p className="mt-2 text-[15px] leading-6 text-text">
              You own <b className="num">{div.holdings}</b> market-priced holdings, but over the last year they behaved like about <b className="num">{div.effectiveBets}</b> independent bets.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {div.clusters.length ? (
                div.clusters.map((c, i) => (
                  <div key={i} className="rounded-[16px] border border-line bg-surface-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-text">Moves together</span>
                      <Chip tone="accent">{absPct(c.weight, 0)} of your money</Chip>
                    </div>
                    <p className="mt-1.5 text-sm text-muted">{c.symbols.map(name).join(", ")}</p>
                    <p className="t-caption mt-2">Average correlation {c.avgCorrelation.toFixed(2)}: when one falls, the others usually fall too.</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No groups of holdings move closely together. Nicely spread.</p>
              )}
            </div>
            {matrix.length > 1 && <Heatmap symbols={withHist.map(name)} matrix={matrix} />}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">Nazar needs about three months of prices for at least two holdings to check this.</p>
        )}
      </Card>
    </div>
  );
}

function Heatmap({ symbols, matrix }: { symbols: string[]; matrix: (number | null)[][] }) {
  const short = (s: string) => (s.length > 10 ? `${s.slice(0, 9)}…` : s);
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="text-[11px]" aria-label="Correlation between your holdings">
        <thead>
          <tr>
            <th />
            {symbols.map((s) => (
              <th key={s} scope="col" className="h-24 align-bottom font-normal text-subtle">
                <span className="inline-block w-6 -rotate-60 origin-bottom-left whitespace-nowrap">{short(s)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th scope="row" className="whitespace-nowrap pr-2 text-right font-normal text-subtle">
                {short(symbols[i])}
              </th>
              {row.map((x, j) => (
                <td key={j} title={`${symbols[i]} × ${symbols[j]}: ${x?.toFixed(2) ?? "n/a"}`} className="h-6 w-6 border border-bg" style={{ background: i === j ? "var(--surface-3)" : `color-mix(in srgb, var(--accent) ${Math.max(0, Math.round((x ?? 0) * 100))}%, var(--surface-2))` }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-caption mt-2">Darker blue = moves more closely together (correlation of daily returns over the last year).</p>
    </div>
  );
}
