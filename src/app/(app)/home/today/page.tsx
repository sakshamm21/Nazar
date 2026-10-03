import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { absPct, dayLabel, inr, signedPct } from "@/lib/format";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { buildPortfolioView, type FullPortfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Why did my portfolio move today?" };

/** H2 tap-through: every holding's contribution today, split into the market's part and the stock's own. */
export default async function TodayPage() {
  const user = await requirePageUser();
  const view = await buildPortfolioView(user, await selectedPortfolioId());
  if (view.empty) redirect("/home");
  const v = view as FullPortfolioView;
  const a = v.attribution;
  const max = Math.max(1, ...a.breakdown.map((r) => Math.abs(r.amount)));
  return (
    <div className="nz-stagger mx-auto max-w-3xl space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <div>
        <div className="t-overline">{dayLabel(v.tradeDate!, "en")} · {v.active!.ownerLabel ? `${v.active!.ownerLabel}'s portfolio` : v.active!.name}</div>
        <h1 className="t-title-1 mt-1 text-text">Why did my portfolio move today?</h1>
      </div>

      <Card className="p-5 sm:p-6">
        <p className="text-[17px] leading-7 text-text">{v.h2.line.en}</p>
        {v.h2.split && <p className="mt-3 text-[15px] leading-6 text-muted">{v.h2.split.en}</p>}
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <div className="text-subtle">Your portfolio</div>
            <Delta pct={a.totalPct} size="sm" />
          </div>
          <div>
            <div className="text-subtle">Nifty 50</div>
            <Delta pct={a.niftyPct} size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-subtle">
              Market part <InfoTip k="beta" />
            </div>
            <div className="num font-medium text-text">{inr(Math.round(a.marketPart), { sign: true, decimals: 0 })}</div>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Holding by holding" title="What moved it" />
        <p className="mt-1 text-sm text-muted">Each bar is a holding&apos;s ₹ change today. The lighter part is what the market move alone would explain (its beta × the Nifty); the rest is specific to the stock.</p>
        <ul className="mt-5 space-y-4">
          {a.breakdown.map((r) => {
            const w = (Math.abs(r.amount) / max) * 100;
            const mkt = r.amount !== 0 ? Math.min(1, Math.max(0, r.marketPart / r.amount)) : 0;
            const tone = r.amount >= 0 ? "var(--gain)" : "var(--loss)";
            return (
              <li key={r.symbol}>
                <div className="flex items-baseline justify-between gap-3">
                  {isManualSymbol(r.symbol) ? (
                    <span className="font-medium text-text">{r.name}</span>
                  ) : (
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="font-medium text-text hover:underline">
                      {r.name}
                    </Link>
                  )}
                  <Delta amount={r.amount} pct={r.pct} size="sm" />
                </div>
                <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-none bg-surface-3" role="img" aria-label={`${r.name}: ${inr(r.amount, { sign: true })}, of which about ${absPct(mkt, 0)} explained by the market`}>
                  <div className="h-full" style={{ width: `${w * mkt}%`, background: tone, opacity: 0.4 }} />
                  <div className="h-full" style={{ width: `${w * (1 - mkt)}%`, background: tone }} />
                </div>
                <div className="t-caption mt-1">
                  {absPct(r.weight, 0)} of portfolio · market part {inr(Math.round(r.marketPart), { sign: true, decimals: 0 })} · stock-specific {inr(Math.round(r.specificPart), { sign: true, decimals: 0 })}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="t-caption mt-6">
          Prices are closing prices from Nazar&apos;s last check ({dayLabel(v.tradeDate!, "en")}). Nifty move {signedPct(a.niftyPct)}.
        </p>
      </Card>
    </div>
  );
}
