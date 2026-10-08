import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { Suspense } from "react";
import { Overview, type OverviewData } from "@/components/portfolio/overview";
import { PortfolioManager } from "@/components/portfolio/portfolio-manager";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";
import { PortfolioTabs } from "@/components/portfolio/portfolio-tabs";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { istDate } from "@/lib/data/provider";
import { getDb, schema } from "@/lib/db";
import { dayLabel } from "@/lib/format";
import { groupOf, isManualSymbol } from "@/lib/instruments/asset-classes";
import { displayName, loadPortfolioDay } from "@/lib/market/portfolio-day";
import { instrumentsFor, latestTradeDate, snapshotsAsOf, sourcesFor } from "@/lib/market/store";
import { valuation } from "@/lib/portfolio/math";
import { MAX_PORTFOLIOS, listPortfolios, listWatching } from "@/lib/repo/portfolios";
import { sipsForPortfolio, type Sip } from "@/lib/repo/sips";
import { portfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Portfolio" };

/** The plan as the screen needs it. */
const sipOf = (s: Sip | undefined) => (s ? { amount: s.amount, dayOfMonth: s.dayOfMonth, endDate: s.endDate, active: s.active, nextDue: s.nextDue, instalments: s.instalments, invested: s.invested } : null);

export default async function PortfolioPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const sources = sourcesFor(user);
  const portfolios = await listPortfolios(user.id);
  const view = await portfolioView(user, await selectedPortfolioId());
  const active = view.active;
  // Before the first checkup there is no market date yet: manual assets still value as of today.
  const date = (await latestTradeDate(db, sources)) ?? istDate(new Date());

  // Every portfolio valued on its own, for the cards on Manage.
  const all = portfolios.length ? await db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, portfolios.map((p) => p.id))) : [];
  const days = new Map(await Promise.all(portfolios.map(async (p) => [p.id, await loadPortfolioDay(db, all.filter((h) => h.portfolioId === p.id), date, sources)] as const)));
  const summaries = portfolios.map((p) => ({ id: p.id, name: p.name, value: valuation(days.get(p.id)!.holdings).value, count: days.get(p.id)!.holdings.length }));

  const holdings = active ? all.filter((h) => h.portfolioId === active.id) : [];
  const day = active ? days.get(active.id)! : null;
  const total = day ? valuation(day.holdings).value : 0;
  const byId = new Map(holdings.map((h) => [h.symbol, h]));
  const sips = active ? await sipsForPortfolio(active.id) : new Map<string, Sip>();
  const rows = (day?.holdings ?? []).map((h) => {
    const row = byId.get(h.symbol)!;
    const manual = isManualSymbol(h.symbol);
    const value = h.quantity * (h.price ?? h.avgPrice);
    const invested = h.quantity * h.avgPrice;
    return {
      id: row.id,
      symbol: h.symbol,
      name: h.name,
      assetClass: h.assetClass,
      category: manual ? null : h.category,
      quantity: row.quantity,
      avgPrice: row.avgPrice,
      buyDate: row.buyDate,
      details: row.details,
      sip: sipOf(sips.get(row.id)),
      price: h.price,
      changePct: manual ? null : h.changePct,
      value,
      invested,
      pnl: h.price != null ? value - invested : null,
      pnlPct: h.price != null && invested ? value / invested - 1 : null,
      weight: total ? value / total : 0,
      source: row.source,
    };
  });

  const watching = await listWatching(user.id);
  const watchSymbols = watching.map((w) => w.symbol);
  const [snaps, inst] = await Promise.all([snapshotsAsOf(db, watchSymbols, date, sources), instrumentsFor(db, watchSymbols)]);

  const overview: OverviewData | null = view.empty
    ? null
    : {
        name: view.active!.name,
        asOf: `${dayLabel(view.tradeDate!, "en")} close`,
        perf: { dates: view.performance.dates, values: view.performance.values, nifty: view.performance.nifty },
        valuation: view.valuation,
        niftyPct: view.niftyPct,
        xirr: view.xirr,
        allocation: view.allocation.map((sl) => ({ ...sl, top: view.cards.filter((c) => groupOf(c.assetClass) === sl.group).slice(0, 3).map((c) => ({ name: c.name, value: c.value })) })),
        sectors: view.sectors,
        health: view.health,
        innerRing: view.innerRing,
        risk: { stressLoss: view.risk.stress10.loss, effectiveBets: view.risk.diversification?.effectiveBets ?? null, clusterCount: view.risk.diversification?.clusters[0]?.symbols.length ?? null, clusterWeight: view.risk.diversification?.clusters[0]?.weight ?? null },
        cards: view.cards.map((c) => ({ symbol: c.symbol, name: c.name, assetClass: c.assetClass, href: c.href, value: c.value, weight: c.weight, pnl: c.pnl, pnlPct: c.pnlPct, changePct: c.href == null ? null : c.changePct, dayImpact: c.href == null ? null : c.dayImpact, health: c.health, sparkline: c.sparkline })),
      };

  return (
    <Suspense>
      <PortfolioScreen
        startOnManage={!overview}
        switcher={<PortfolioTabs portfolios={portfolios.map((p) => ({ id: p.id, name: p.name }))} activeId={active?.id ?? null} />}
        overview={overview ? <Overview d={overview} /> : null}
        manage={
          <PortfolioManager
            portfolios={summaries}
            activeId={active?.id ?? null}
            rows={rows}
            totals={{ value: total }}
            watching={watching.map((w) => ({ symbol: w.symbol, name: displayName(w.symbol, inst.get(w.symbol)), price: snaps.get(w.symbol)?.price ?? null, changePct: snaps.get(w.symbol)?.tradeDate === date ? (snaps.get(w.symbol)?.changePct ?? null) : null }))}
            isDemo={user.isTestAccount}
            max={MAX_PORTFOLIOS}
          />
        }
      />
    </Suspense>
  );
}
