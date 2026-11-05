import { ArrowRight, ChevronRight, LayoutDashboard, LineChart, MessageCircle, Plus, Upload, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Heatmap } from "@/components/charts/heatmap";
import { Sparkline } from "@/components/charts/sparkline";
import { HomeValue } from "@/components/home/home-value";
import { PortfolioTabs } from "@/components/portfolio/portfolio-tabs";
import { QuietRings } from "@/components/rings/quiet-rings";
import { WatchingStatus } from "@/components/rings/watching";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db";
import { dayLabel, inr, inrCompact, istTime, signedPct } from "@/lib/format";
import { displayName } from "@/lib/market/portfolio-day";
import { instrumentsFor, shiftDate, snapshotsAsOf } from "@/lib/market/store";
import { listWatching } from "@/lib/repo/portfolios";
import { portfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Home" };

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const NEXT = [
  { href: "/portfolio", icon: Wallet, title: "Portfolio", body: "Value over time, allocation and every holding compared." },
  { href: "/analysis", icon: LineChart, title: "Analysis", body: "What moved, why, and how it compares with the market." },
  { href: "/dashboards", icon: LayoutDashboard, title: "Dashboards", body: "Your own comparisons: funds, stocks or everything against an index." },
  { href: "/ask", icon: MessageCircle, title: "Ask", body: "Ask anything about your money, answered from live data." },
];

/** Home is the glance: what you have, how today went, and the map of what is up and down. */
export default async function HomePage() {
  const user = await requirePageUser();
  const v = await portfolioView(user, await selectedPortfolioId());
  const first = user.name.split(" ")[0];
  const switcher = <PortfolioTabs portfolios={v.portfolios.map((p) => ({ id: p.id, name: p.name }))} activeId={v.active?.id ?? null} />;

  if (v.empty) {
    return (
      <div className="nz-stagger space-y-6">
        <h1 className="t-title-1 text-text">
          {greeting()}, {first}
        </h1>
        {switcher}
        <Card className="p-2">
          <QuietRings
            title={v.active ? "Add what you own and Nazar starts watching" : "Let's set up your first portfolio"}
            body="Search any stock, fund, ETF, gold, US stock or coin and add it in seconds, or import a broker file. Nazar then keeps the prices fresh and shows you what moved and why."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/portfolio?add=1">
                  <Plus className="h-4 w-4" /> Add what you own
                </ButtonLink>
                <ButtonLink href="/portfolio/import" variant="secondary">
                  <Upload className="h-4 w-4" /> Import a file
                </ButtonLink>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  // The Watching list, as the day left it: price, today's move, results coming up.
  const watchSymbols = (await listWatching(user.id)).map((w) => w.symbol);
  const db = await getDb();
  const [wSnaps, wInst] = watchSymbols.length && v.tradeDate ? await Promise.all([snapshotsAsOf(db, watchSymbols, v.tradeDate, v.sources), instrumentsFor(db, watchSymbols)]) : [new Map(), new Map()];
  const watched = watchSymbols.map((s) => {
    const snap = wSnaps.get(s);
    return { symbol: s, name: displayName(s, wInst.get(s)), price: snap?.price ?? null, changePct: snap?.tradeDate === v.tradeDate ? (snap?.changePct ?? null) : null, results: snap?.nextResultsDate && snap.nextResultsDate <= shiftDate(v.tradeDate!, 14) ? snap.nextResultsDate : null };
  });
  const a = v.attribution;
  // A check on an earlier day says which day, so yesterday's 4:18 PM never reads as today's.
  const checked = v.checkedAt ? new Date(v.checkedAt) : null;
  const sameDay = checked && checked.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const lastCheck = checked ? `${sameDay ? "" : `${checked.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" })} `}${istTime(checked)}` : null;
  const month = v.performance.values.slice(-22);
  return (
    <div className="nz-stagger space-y-5 lg:space-y-6">
      <div>
        <h1 className="t-title-1 text-text">
          {greeting()}, {first}
        </h1>
        <WatchingStatus className="mt-1.5" stocks={v.cards.length} watching={v.watchingCount ?? 0} lastCheck={lastCheck} stale={v.staleCount > 0} />
      </div>
      {switcher}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="t-overline">
              {v.active!.name} · as of {dayLabel(v.tradeDate!, "en")} close
            </div>
            <div className="mt-2">
              <HomeValue value={v.valuation.value} />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <Delta amount={v.valuation.dayChange} pct={v.valuation.dayChangePct} />
              <span className="text-sm text-subtle">today</span>
              {v.niftyPct != null && <span className="text-sm text-subtle">· Nifty {signedPct(v.niftyPct)}</span>}
            </div>
          </div>
          {month.length > 2 && (
            <Link href="/portfolio" className="group shrink-0 text-right" aria-label="Open the full chart">
              <Sparkline values={month} width={220} height={64} />
              <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-subtle group-hover:text-text">
                Past month <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          )}
        </div>

        <Link href="/analysis" className="group mt-5 flex items-start gap-3 rounded-[14px] border border-line bg-surface-2 p-3.5 transition-colors hover:bg-surface-3">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.kind === "down" ? "bg-loss" : a.kind === "up" ? "bg-gain" : "bg-subtle")} aria-hidden />
          <span className="flex-1 text-[15px] leading-6 text-text">{v.h2.line.en}</span>
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-label="See the full analysis" />
        </Link>

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <div>
            <dt className="text-[12px] text-subtle">Invested</dt>
            <dd className="num mt-0.5 text-[15px] font-medium text-text">{inrCompact(v.valuation.invested)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-subtle">Gain or loss so far</dt>
            <dd className="mt-0.5">
              <Delta amount={v.valuation.unrealised} compact showArrow={false} size="sm" />
              <span className="num block text-[12px] text-subtle">{signedPct(v.valuation.unrealisedPct)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-subtle">Holdings</dt>
            <dd className="num mt-0.5 text-[15px] font-medium text-text">
              {v.cards.length} <span className="text-[12px] font-normal text-subtle">in {v.allocation.length} asset {v.allocation.length === 1 ? "type" : "types"}</span>
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Your money, at a glance" title="What is up, what is down" />
        <div className="mt-4">
          <Heatmap tiles={v.cards.map((c) => ({ symbol: c.symbol, name: c.name, value: c.value, today: c.href == null ? null : c.changePct, total: c.pnlPct, href: c.href, pending: c.pending, daily: c.href != null }))} />
        </div>
      </Card>

      {watched.length > 0 && (
        <Card className="p-5 sm:p-6">
          <CardHeader overline="Watching" title="What you are keeping an eye on" right={<Link href="/portfolio?tab=manage#watching" className="text-[13px] font-medium text-accent hover:underline">Change</Link>} />
          <ul className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {watched.slice(0, 8).map((w) => (
              <li key={w.symbol} className="min-w-0 border-b border-line last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0">
                <Link href={`/stock/${encodeURIComponent(w.symbol)}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-text">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{w.name}</span>
                    {w.results && <span className="block text-[12px] text-subtle">Results on {dayLabel(w.results, "en")}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm text-text">{w.price != null ? inr(w.price, { decimals: 2 }) : "—"}</span>
                    {w.changePct != null && <Delta pct={w.changePct} size="sm" />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {NEXT.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <Link href={href} className="group flex h-full items-start gap-3 rounded-[18px] border border-line bg-surface-1 p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium text-text">
                  {title} <ArrowRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-[13px] leading-5 text-muted">{body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
