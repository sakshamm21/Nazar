import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, ChevronRight, FileText, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeroValue } from "@/components/home/hero-value";
import { PortfolioSwitcher } from "@/components/home/portfolio-switcher";
import { SimulateCard } from "@/components/home/simulate-card";
import { Tour } from "@/components/home/tour";
import { Sparkline } from "@/components/charts/sparkline";
import { QuietRings } from "@/components/rings/quiet-rings";
import { RingGauge, RingLegend } from "@/components/rings/ring-gauge";
import { WatchingStatus } from "@/components/rings/watching";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { SeverityIcon } from "@/components/ui/severity";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { getDb, schema } from "@/lib/db";
import { absPct, dayLabel, inr, inrCompact, istTime, signedPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { buildPortfolioView, type AttentionItem, type FullPortfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Home" };

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default async function HomePage() {
  const user = await requirePageUser();
  const view = await buildPortfolioView(user, await selectedPortfolioId());
  const first = user.name.split(" ")[0];
  const switcher = view.portfolios.map((p) => ({ id: p.id, name: p.name, ownerLabel: p.ownerLabel, language: p.language }));

  if (view.empty) {
    return (
      <div className="space-y-6">
        <h1 className="t-title-1 text-text">
          {greeting()}, {first}
        </h1>
        <PortfolioSwitcher portfolios={switcher} activeId={view.active?.id ?? null} />
        <Card className="p-2">
          <QuietRings
            title={view.active ? "Add your holdings and Nazar starts watching" : "Let's set up your first portfolio"}
            body={
              <>
                Import your holdings file from Zerodha, Groww or Upstox, or add stocks by hand. Nazar checks them every evening and only messages you when something important happens.
                <span className="mt-3 block text-subtle">We watch and explain; you decide. Nazar never tells you what to do with your money.</span>
              </>
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/portfolio/import">
                  <Upload className="h-4 w-4" /> Import holdings
                </ButtonLink>
                <ButtonLink href="/portfolio?add=1" variant="secondary">
                  Add a stock
                </ButtonLink>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const v = view as FullPortfolioView;
  const db = await getDb();
  const family = view.portfolios.filter((p) => p.ownerLabel);
  const reports = family.length
    ? await db
        .select({ id: schema.reports.id, portfolioId: schema.reports.portfolioId, weekEnd: schema.reports.weekEnd })
        .from(schema.reports)
        .where(and(eq(schema.reports.userId, user.id), inArray(schema.reports.portfolioId, family.map((p) => p.id))))
        .orderBy(desc(schema.reports.weekEnd))
    : [];
  const recipients = family.length ? await db.select().from(schema.recipients).where(inArray(schema.recipients.portfolioId, family.map((p) => p.id))) : [];
  const symbols = new Set(v.cards.map((c) => c.symbol));
  const lastCheck = v.asOf ? istTime(new Date(new Date(v.asOf).getTime() + 47 * 60_000)) : null;
  const hindi = v.active?.language === "hi";

  return (
    <div className="space-y-5 lg:space-y-6">
      <Suspense>
        <Tour autoStart={user.isDemo && !user.tourCompletedAt && !user.simState} />
      </Suspense>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title-1 text-text">
            {greeting()}, {first}
          </h1>
          <WatchingStatus className="mt-1.5" stocks={symbols.size + (v.watchingCount ?? 0)} lastCheck={lastCheck} stale={v.staleCount > 0} />
        </div>
      </div>
      <PortfolioSwitcher portfolios={switcher} activeId={v.active!.id} />

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:gap-6">
        {/* Left column */}
        <div className="contents lg:col-span-8 lg:block lg:space-y-6">
          <div className="order-1"><HeroCard v={v} /></div>
          <div className="order-2"><AttentionCard items={v.attention} hindi={hindi} /></div>
          <div className="order-6"><HoldingsCard v={v} /></div>
        </div>

        {/* Right column */}
        <div className="contents lg:col-span-4 lg:block lg:space-y-6">
          <div className="order-3"><HealthCard v={v} /></div>
          {user.isDemo && <div className="order-4"><SimulateCard active={Boolean(user.simState)} /></div>}
          <div className="order-5"><FamilyCard family={family.map((p) => ({ id: p.id, label: p.ownerLabel!, language: p.language, report: reports.find((r) => r.portfolioId === p.id) ?? null, recipient: recipients.find((r) => r.portfolioId === p.id) ?? null }))} /></div>
          <div className="order-7"><SectorsCard v={v} /></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HeroCard({ v }: { v: FullPortfolioView }) {
  const a = v.attribution;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="t-overline">
          {v.active!.ownerLabel ? `${v.active!.ownerLabel}'s portfolio` : v.active!.name} · {v.simulated ? "simulated session" : `as of ${dayLabel(v.tradeDate!, "en")} close`}
        </div>
        <InfoTip k="value" />
      </div>
      <div className="mt-2">
        <HeroValue value={v.valuation.value} />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <Delta amount={v.valuation.dayChange} pct={v.valuation.dayChangePct} />
        <span className="text-sm text-subtle">today</span>
        {v.niftyPct != null && <span className="text-sm text-subtle">· Nifty {signedPct(v.niftyPct)}</span>}
      </div>

      <Link href="/home/today" data-tour="h2" className="group mt-4 flex items-start gap-3 rounded-[14px] border border-line bg-surface-2 p-3.5 transition-colors hover:bg-surface-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.kind === "down" ? "bg-loss" : a.kind === "up" ? "bg-gain" : "bg-subtle")} aria-hidden />
        <span className="flex-1 text-[15px] leading-6 text-text">{v.h2.line.en}</span>
        <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-label="See the breakdown" />
      </Link>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Stat label="Unrealised P&L" tip="unrealised">
          <Delta amount={v.valuation.unrealised} compact showArrow={false} size="sm" />
          <div className="num text-[12px] text-subtle">{signedPct(v.valuation.unrealisedPct)}</div>
        </Stat>
        <Stat label="XIRR" tip="xirr">
          <div className="num text-[15px] font-medium text-text">{v.xirr.xirr != null ? `${(v.xirr.xirr * 100).toFixed(1)}%` : "—"}</div>
          <div className="num text-[12px] text-subtle">{v.xirr.niftyXirr != null ? `Nifty ${(v.xirr.niftyXirr * 100).toFixed(1)}%` : v.xirr.dated ? "" : "add purchase dates"}</div>
        </Stat>
        <Stat label="Invested">
          <div className="num text-[15px] font-medium text-text">{inrCompact(v.valuation.invested)}</div>
          <div className="num text-[12px] text-subtle">{v.cards.length} stocks</div>
        </Stat>
      </dl>
    </Card>
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

const KIND_TOUR: Partial<Record<AttentionItem["kind"], string>> = { results: "h4", learned: "h5" };

function AttentionCard({ items, hindi }: { items: AttentionItem[]; hindi: boolean }) {
  const firstAlert = items.findIndex((i) => i.kind === "alert" || i.kind === "simulated");
  return (
    <Card className="p-5 sm:p-6" data-tour={firstAlert === -1 && items.length ? "h1" : undefined}>
      <CardHeader overline="Today" title="What needs your attention" right={<Link href="/alerts" className="text-sm font-medium text-accent">All alerts</Link>} />
      {items.length === 0 ? (
        <div data-tour="h1">
          <QuietRings compact title="All quiet today." body="Nothing needs your attention. Nazar will message you if that changes." />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((it, i) => (
            <li key={it.id} data-tour={i === firstAlert ? "h1" : KIND_TOUR[it.kind]}>
              <Link href={it.href} className="group -mx-2 flex gap-3 rounded-[12px] px-2 py-3.5 hover:bg-surface-2">
                <SeverityIcon severity={it.severity} className="mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text">{it.title}</span>
                    {it.kind === "simulated" && <Chip tone="warn">Simulation</Chip>}
                    {it.kind === "results" && <Chip tone="accent">Results</Chip>}
                    {it.kind === "learned" && <Chip tone="accent">Learned</Chip>}
                    {it.kind === "cluster" && <Chip>Hidden risk</Chip>}
                    {hindi && (it.kind === "alert" || it.kind === "simulated") && (
                      <Chip title="This alert also has a Hindi version for the family member"><span lang="hi">हिंदी</span></Chip>
                    )}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{it.body}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HealthCard({ v }: { v: FullPortfolioView }) {
  const cl = v.risk.diversification?.clusters[0];
  return (
    <Card className="p-5 sm:p-6" data-tour="h3">
      <CardHeader overline="Portfolio health" title="Health and hidden risk" right={<InfoTip k="portfolioHealth" />} />
      <div className="mt-4 flex items-center gap-5">
        <RingGauge outer={v.health.score} inner={v.innerRing} size={132} label="health" />
        <div className="min-w-0 flex-1">
          <RingLegend outer={v.health.score} inner={v.innerRing} />
          <p className="t-caption mt-3">
            {v.health.scored} of {v.health.total} holdings scored
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">If the Nifty fell 10%</span>
          <span className="num font-medium text-loss">−{inrCompact(Math.abs(v.risk.stress10.loss))}</span>
        </div>
        {v.risk.diversification && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Behaves like</span>
            <span className="num font-medium text-text">
              {v.risk.diversification.effectiveBets} independent bets
            </span>
          </div>
        )}
        {cl && cl.symbols.length >= 2 && (
          <p className="text-muted">
            <span className="font-medium text-text">{cl.symbols.length} holdings</span> ({absPct(cl.weight, 0)} of your money) tend to move together.
          </p>
        )}
      </div>
      <ButtonLink href="/risk" variant="secondary" className="mt-4 w-full">
        See hidden risks
      </ButtonLink>
    </Card>
  );
}

function FamilyCard({ family }: { family: { id: string; label: string; language: "en" | "hi"; report: { id: string; weekEnd: string } | null; recipient: { email: string; confirmedAt: Date | null } | null }[] }) {
  if (!family.length)
    return (
      <Card className="p-5 sm:p-6" data-tour="h6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-muted">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="t-title-2 text-text">Watching a parent&apos;s stocks too?</h2>
            <p className="mt-1 text-sm text-muted">Add their portfolio separately. Nazar can send them a weekly report and major alerts in simple Hindi.</p>
            <ButtonLink href="/portfolio?new=family" variant="secondary" size="sm" className="mt-3">
              Add a family portfolio
            </ButtonLink>
          </div>
        </div>
      </Card>
    );
  return (
    <Card className="p-5 sm:p-6" data-tour="h6">
      <CardHeader overline="Family" title="Shared with family" />
      <ul className="mt-3 space-y-3">
        {family.map((f) => (
          <li key={f.id} className="rounded-[14px] border border-line bg-surface-2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-text">{f.label}&apos;s portfolio</span>
              <Chip tone={f.language === "hi" ? "accent" : "neutral"}>{f.language === "hi" ? "Hindi · हिंदी" : "English"}</Chip>
            </div>
            <p className="mt-1 text-sm text-muted">
              {f.recipient ? (
                <>
                  Weekly report and major alerts go to <span className="text-text">{f.recipient.email}</span>
                  {f.recipient.confirmedAt ? "" : " (waiting for them to confirm)"}.
                </>
              ) : (
                "No one receives these yet."
              )}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {f.report && (
                <Link href={`/reports/${f.report.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                  <FileText className="h-4 w-4" /> {f.language === "hi" ? "हिंदी रिपोर्ट देखें" : "See the weekly report"}
                </Link>
              )}
              <Link href={`/portfolio/${f.id}/settings`} className="text-sm font-medium text-muted hover:text-text">
                Settings
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SectorsCard({ v }: { v: FullPortfolioView }) {
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Allocation" title="Where your money is" right={<InfoTip k="sector" />} />
      <ul className="mt-4 space-y-3">
        {v.sectors.slice(0, 7).map((s) => (
          <li key={s.sector}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-text">{s.sector}</span>
              <span className="num text-muted">{absPct(s.weight, 0)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, s.weight * 100)}%`, opacity: 0.35 + Math.min(0.65, s.weight * 1.6) }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const trendWord = { uptrend: "Uptrend", downtrend: "Downtrend", sideways: "Sideways", unknown: "Trend n/a" } as const;
const valWord = { cheaper: "Cheaper than peers", similar: "In line with peers", pricier: "Pricier than peers", unknown: null } as const;

function HoldingsCard({ v }: { v: FullPortfolioView }) {
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Holdings" title={`${v.cards.length} stocks`} right={<Link href="/portfolio" className="text-sm font-medium text-accent">Manage</Link>} />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {v.cards.map((c) => (
          <li key={c.symbol}>
            <Link href={`/stock/${encodeURIComponent(c.symbol)}`} className="block rounded-[16px] border border-line bg-surface-2/60 p-4 transition-colors hover:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-text">{c.name}</div>
                  <div className="font-mono text-[12px] text-subtle">
                    {c.symbol.replace(/\.NS$/, "")} · {absPct(c.weight, 0)}
                  </div>
                </div>
                <Sparkline values={c.sparkline} width={72} height={28} />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="num text-[15px] font-medium text-text">{inr(c.value)}</span>
                {c.dayImpact != null ? <Delta amount={c.dayImpact} pct={c.changePct} size="sm" compact /> : <span className="t-caption">no price today</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.health != null && <Chip tone={c.health >= 70 ? "gain" : c.health >= 45 ? "neutral" : "loss"}>Health {c.health}</Chip>}
                {c.beta != null && <Chip title="Beta vs Nifty, 1 year">β {c.beta.toFixed(2)}</Chip>}
                {valWord[c.valuation.label] && <Chip>{valWord[c.valuation.label]}</Chip>}
                {c.trend.label !== "unknown" && <Chip>{trendWord[c.trend.label]}</Chip>}
                {c.stale && <Chip tone="warn">Old price</Chip>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

