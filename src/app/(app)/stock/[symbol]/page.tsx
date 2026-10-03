import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCard, ResultsLists } from "@/components/alerts/alert-card";
import { Sparkline } from "@/components/charts/sparkline";
import { ExcelDownload } from "@/components/stock/excel-download";
import { StockChart } from "@/components/stock/stock-chart";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { requirePageUser } from "@/lib/current-user";
import { getDb, schema } from "@/lib/db";
import { riskReturn, trendLabel, valuationVsPeers } from "@/lib/analytics/models";
import { healthLine, quarterName, resultsPoints } from "@/lib/alerts/templates";
import { ASSET_META, isManualSymbol } from "@/lib/instruments/asset-classes";
import { catalogItem, classOfSymbol } from "@/lib/instruments/catalog";
import { NIFTY, sectorOf } from "@/lib/instruments/sectors";
import { absPct, dayLabel, inr, inrCompact } from "@/lib/format";
import { displayName } from "@/lib/market/portfolio-day";
import { dateSources, instrumentsFor, latestResults, latestTradeDate, priceHistory, shiftDate, snapshotsAsOf, sourcesFor } from "@/lib/market/store";
import { alertsFor } from "@/lib/views/alerts";
import { GLOSSARY } from "@/lib/glossary";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).symbol).replace(/\.NS$/, "") };
}

const METRIC_ROWS: { key: string; label: string; fmt: "x" | "pct" | "inr"; tip?: keyof typeof GLOSSARY }[] = [
  { key: "trailingPE", label: "P/E", fmt: "x", tip: "pe" },
  { key: "priceToBook", label: "Price / book", fmt: "x" },
  { key: "returnOnEquity", label: "Return on equity", fmt: "pct" },
  { key: "profitMargin", label: "Net margin", fmt: "pct" },
  { key: "revenueGrowth", label: "Revenue growth", fmt: "pct" },
  { key: "earningsGrowth", label: "Profit growth", fmt: "pct" },
  { key: "dividendYield", label: "Dividend yield", fmt: "pct" },
  { key: "marketCap", label: "Market cap", fmt: "inr" },
];

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const user = await requirePageUser();
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  if (isManualSymbol(symbol)) notFound();
  const assetClass = classOfSymbol(symbol) ?? "stock";
  const company = assetClass === "stock";
  const db = await getDb();
  const sources = sourcesFor(user);
  const date = await latestTradeDate(db, dateSources(sources));
  if (!date) notFound();
  const [snaps, inst, hist, results] = await Promise.all([snapshotsAsOf(db, [symbol, NIFTY], date, sources), instrumentsFor(db, [symbol]), priceHistory(db, [symbol, NIFTY], sources, shiftDate(date, -400), date), latestResults(db, [symbol], sources)]);
  const snap = snaps.get(symbol);
  if (!snap) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="t-title-1 text-text">{catalogItem(symbol)?.name ?? symbol.replace(/\.NS$/, "")}</h1>
        <Card className="p-6 text-sm text-muted">Nazar hasn&apos;t checked this yet. Add it to a portfolio or your Watching list and it&apos;ll appear within a minute or two.</Card>
      </div>
    );
  }
  const i = inst.get(symbol) ?? null;
  const name = displayName(symbol, i);
  const sec = sectorOf(i?.sector, i?.industry);
  const closes = hist.get(symbol) ?? new Map<string, number>();
  const nifty = hist.get(NIFTY) ?? new Map<string, number>();
  const points = [...closes.entries()].map(([d, value]) => ({ date: d, value }));
  const health = snap.health;
  const pfs = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, user.id));
  const mine = pfs.length ? await db.select().from(schema.holdings).where(and(eq(schema.holdings.symbol, symbol), inArray(schema.holdings.portfolioId, pfs.map((p) => p.id)))) : [];
  const healthHist = await db
    .select({ d: schema.symbolSnapshots.tradeDate, h: schema.symbolSnapshots.health })
    .from(schema.symbolSnapshots)
    .where(and(eq(schema.symbolSnapshots.symbol, symbol), inArray(schema.symbolSnapshots.source, dateSources(sources))))
    .orderBy(desc(schema.symbolSnapshots.tradeDate))
    .limit(60);
  const healthSeries = healthHist.reverse().map((r) => r.h?.score).filter((x): x is number => typeof x === "number");
  const peers = i?.industry
    ? await db
        .select({ s: schema.symbolSnapshots.symbol, m: schema.symbolSnapshots.metrics })
        .from(schema.symbolSnapshots)
        .innerJoin(schema.instruments, eq(schema.instruments.symbol, schema.symbolSnapshots.symbol))
        .where(and(eq(schema.symbolSnapshots.tradeDate, snap.tradeDate), eq(schema.instruments.industry, i.industry), inArray(schema.symbolSnapshots.source, dateSources(sources))))
    : [];
  const val = valuationVsPeers(snap.metrics?.trailingPE, peers.filter((p) => p.s !== symbol).map((p) => p.m?.trailingPE));
  const trend = trendLabel([...closes.values()]);
  let rr: ReturnType<typeof riskReturn> | null = null;
  try {
    const last = (m: Map<string, number>) => new Map([...m].slice(-253));
    rr = riskReturn(last(closes), last(nifty), { interval: "1d", riskFree: 0.065 });
  } catch {
    rr = null;
  }
  const { alerts } = await alertsFor(user.id, { limit: 200 });
  const myAlerts = alerts.filter((a) => a.symbol === symbol).slice(0, 6);
  const r = results.get(symbol);
  const pts = r ? resultsPoints(r.data.current, r.data.previous, r.data.yearAgo) : [];
  const fmt = (k: (typeof METRIC_ROWS)[number], v: number | null | undefined) => (v == null ? "—" : k.fmt === "x" ? `${v.toFixed(1)}×` : k.fmt === "pct" ? `${(v * 100).toFixed(1)}%` : inrCompact(v));
  const excelParts = rr
    ? [
        { toolName: "getRiskReturn", data: { symbol, benchmark: NIFTY, currency: "INR", range: "1y", interval: "1d", riskFree: rr.riskFree, stats: rr.stats, series: rr.series, prices: rr.dates.map((d, k) => [d, rr!.pa[k], rr!.pb[k]]) } },
        ...(health?.tests?.length ? [{ toolName: "getFinancialHealthScore", data: { symbol, tests: health.tests, fScore: health.fScore, altman: health.altmanZ } }] : []),
      ]
    : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="t-overline">
            {company ? sec.label : (i?.category ?? ASSET_META[assetClass].label)}
            {assetClass !== "mf" && assetClass !== "gold" && (
              <>
                {" "}· <span className="font-mono normal-case tracking-normal">{symbol}</span>
              </>
            )}
          </div>
          <h1 className="t-title-1 mt-1 text-text">{name}</h1>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="num text-[28px] font-semibold text-text">{inr(snap.price, { decimals: 2 })}</span>
            {snap.tradeDate === date && <Delta pct={snap.changePct} />}
            <span className="t-caption">{assetClass === "mf" ? "latest NAV" : assetClass === "gold" ? "indicative price per gram" : `as of ${dayLabel(snap.tradeDate, "en")} close`}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {excelParts.length > 0 && <ExcelDownload parts={excelParts} title={`${name} · Nazar model`} />}
          <ButtonLink href={`/ask?q=${encodeURIComponent(`Explain what's going on with ${name} (${symbol}) in simple words`)}`} variant="secondary">
            <MessageCircle className="h-4 w-4" /> Ask
          </ButtonLink>
        </div>
      </div>

      {mine.length > 0 && (
        <Card className="flex flex-wrap gap-x-8 gap-y-3 p-5">
          {mine.map((h) => {
            const p = pfs.find((x) => x.id === h.portfolioId)!;
            const value = h.quantity * (snap.price ?? h.avgPrice);
            return (
              <div key={h.id} className="text-sm">
                <div className="t-caption">{p.ownerLabel ? `${p.ownerLabel}'s portfolio` : p.name}</div>
                <div className="num text-text">
                  {h.quantity.toLocaleString("en-IN", { maximumFractionDigits: 3 })} {ASSET_META[assetClass].unit} · {inr(value)}
                </div>
                <Delta amount={value - h.quantity * h.avgPrice} pct={(snap.price ?? h.avgPrice) / h.avgPrice - 1} size="sm" compact showArrow={false} />
              </div>
            );
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="min-w-0 space-y-5 lg:col-span-8 lg:space-y-6">
          <Card className="p-5 sm:p-6">
            <StockChart points={points} />
          </Card>

          {r && (
            <Card className="scroll-mt-24 p-5 sm:p-6" id="results">
              <CardHeader overline={r.data.backfilled ? "Latest reported quarter" : `Results · reported ${dayLabel(r.detectedOn, "en")}`} title={`${quarterName(r.quarterEnd).en} results, explained`} right={<InfoTip k="results" />} />
              <ResultsLists improved={pts.filter((p) => p.good)} worse={pts.filter((p) => !p.good)} health={healthLine({ healthBefore: r.healthBefore, healthAfter: r.healthAfter, annualHealthUpdated: r.data.annualHealthUpdated })} />
              <QuarterBars quarters={(snap.quarterly ?? []).slice(-5)} />
            </Card>
          )}

          {myAlerts.length > 0 && (
            <Card className="p-5 sm:p-6">
              <CardHeader overline="History" title="Past alerts for this stock" />
              <div className="mt-3 divide-y divide-line">
                {myAlerts.map((a) => (
                  <div key={a.id} className="py-4">
                    <AlertCard a={a} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-4 lg:space-y-6">
          {company && <Card className="p-5 sm:p-6">
            <CardHeader overline="Financial health" title={health?.score != null ? `${health.score} / 100` : "Not scored"} right={<InfoTip k="health" />} />
            {healthSeries.length > 2 && (
              <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-subtle">
                <span>Last {healthSeries.length} checks</span>
                <Sparkline values={healthSeries} width={120} height={28} />
              </div>
            )}
            <ul className="mt-4 space-y-2 text-sm">
              {(health?.kind === "lender" ? health.lenderTests : health?.tests)?.map((t) => (
                <li key={t.name} className="flex items-start gap-2">
                  <span className={t.pass === null ? "text-subtle" : t.pass ? "text-gain" : "text-loss"} aria-label={t.pass === null ? "Not enough data" : t.pass ? "Pass" : "Fail"}>
                    {t.pass === null ? "–" : t.pass ? "✓" : "✕"}
                  </span>
                  <span className="text-text">
                    {t.name}
                    <span className="block text-[12px] text-subtle">{t.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {health?.kind === "lender" && <p className="t-caption mt-3">Banks and lenders get a simplified lender check; Piotroski and Altman don&apos;t apply to their balance sheets.</p>}
            {health?.altmanZone && <p className="mt-3 text-sm text-muted">Altman Z: <span className="text-text">{health.altmanZ?.toFixed(2)} ({health.altmanZone} zone)</span></p>}
          </Card>}

          <Card className="p-5 sm:p-6">
            <CardHeader overline={company ? "Risk and valuation" : "Risk"} title="At a glance" />
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="Beta vs Nifty" tip="beta" value={snap.beta != null ? snap.beta.toFixed(2) : "—"} />
              <Row label="Volatility (1y)" value={snap.vol1y != null ? absPct(snap.vol1y, 0) : "—"} />
              <Row label="Max fall from peak (1y)" value={rr ? absPct(rr.stats.maxDrawdown, 0) : "—"} />
              <Row label="Trend" tip="trend" value={trend.label === "unknown" ? "—" : trend.label[0].toUpperCase() + trend.label.slice(1)} />
              {company && <Row label="Valuation vs peers" tip="valuation" value={val.label === "unknown" ? "—" : val.label === "similar" ? "In line" : val.label === "cheaper" ? "Cheaper" : "Pricier"} />}
              {snap.nextResultsDate && <Row label="Next results" value={dayLabel(snap.nextResultsDate, "en")} />}
            </dl>
          </Card>

          {!company && (
            <Card className="p-5 sm:p-6">
              <CardHeader overline="About" title={ASSET_META[assetClass].label} />
              <p className="mt-3 text-sm text-muted">
                {assetClass === "mf"
                  ? "The NAV comes from AMFI, which publishes it once a day, usually late in the evening. Today's NAV therefore shows up the next morning."
                  : assetClass === "gold"
                    ? "Valued from the international price and the rupee-dollar rate, plus India's import duty. A jeweller's rate also adds GST and making charges, and a Sovereign Gold Bond can trade a little above or below this."
                    : "Priced like a share on the NSE. It holds a basket of assets, so company checks such as the health score and results don't apply."}
              </p>
            </Card>
          )}
          {company && <Card className="p-5 sm:p-6">
            <CardHeader overline="Numbers" title="Key metrics" />
            <dl className="mt-4 space-y-2.5 text-sm">
              {METRIC_ROWS.map((k) => (
                <Row key={k.key} label={k.label} tip={k.tip} value={fmt(k, snap.metrics?.[k.key] ?? (k.key === "marketCap" ? snap.marketCap : null))} />
              ))}
            </dl>
            <p className="t-caption mt-4">From Yahoo Finance at the last check. <Chip className="ml-1">Not advice</Chip></p>
          </Card>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tip }: { label: string; value: string; tip?: keyof typeof GLOSSARY }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-muted">
        {label}
        {tip && <InfoTip k={tip} />}
      </dt>
      <dd className="num text-right text-text">{value}</dd>
    </div>
  );
}

function QuarterBars({ quarters }: { quarters: { quarterEnd: string; revenue: number | null; earnings: number | null }[] }) {
  const max = Math.max(1, ...quarters.map((q) => q.revenue ?? 0));
  if (quarters.length < 2) return null;
  return (
    <div className="mt-5">
      <div className="t-overline">Revenue and profit by quarter</div>
      <div className="mt-3 flex items-end gap-3" style={{ height: 120 }}>
        {quarters.map((q) => (
          <div key={q.quarterEnd} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: 96 }}>
              <div className="w-1/3 rounded-t-[4px] bg-ice" style={{ height: `${((q.revenue ?? 0) / max) * 100}%` }} title={`Revenue ${inrCompact(q.revenue)}`} />
              <div className="w-1/3 rounded-t-[4px] bg-accent" style={{ height: `${(Math.max(0, q.earnings ?? 0) / max) * 100}%` }} title={`Profit ${inrCompact(q.earnings)}`} />
            </div>
            <span className="text-[11px] text-subtle">{new Date(`${q.quarterEnd}T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[12px] text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ice" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent" /> Profit
        </span>
      </div>
    </div>
  );
}
