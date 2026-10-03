import type { Metadata } from "next";
import { Suspense } from "react";
import { PortfolioManager } from "@/components/portfolio/portfolio-manager";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { istDate } from "@/lib/data/provider";
import { getDb } from "@/lib/db";
import { isManualSymbol } from "@/lib/instruments/asset-classes";
import { displayName, loadPortfolioDay } from "@/lib/market/portfolio-day";
import { dateSources, instrumentsFor, latestTradeDate, snapshotsAsOf, sourcesFor } from "@/lib/market/store";
import { assetAllocation, valuation } from "@/lib/portfolio/math";
import { listHoldings, listPortfolios, listWatching } from "@/lib/repo/portfolios";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await requirePageUser();
  const portfolios = await listPortfolios(user.id);
  const sel = await selectedPortfolioId();
  const active = portfolios.find((p) => p.id === sel) ?? portfolios.find((p) => p.isDefault) ?? portfolios[0] ?? null;
  const holdings = active ? await listHoldings(user.id, active.id) : [];
  const watching = await listWatching(user.id);
  const db = await getDb();
  const sources = sourcesFor(user);
  // Before the first checkup there is no market date yet: manual assets still value as of today.
  const date = (await latestTradeDate(db, dateSources(sources))) ?? istDate(new Date());
  const day = await loadPortfolioDay(db, holdings, date, sources);
  const v = valuation(day.holdings);
  const byId = new Map(holdings.map((h) => [h.symbol, h]));
  const rows = day.holdings.map((h) => {
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
      price: h.price,
      changePct: manual ? null : h.changePct,
      value,
      invested,
      pnl: h.price != null ? value - invested : null,
      pnlPct: h.price != null && invested ? value / invested - 1 : null,
      weight: v.value ? value / v.value : 0,
      source: row.source,
    };
  });
  const watchSymbols = watching.map((w) => w.symbol);
  const [snaps, inst] = await Promise.all([snapshotsAsOf(db, watchSymbols, date, sources), instrumentsFor(db, watchSymbols)]);
  return (
    <Suspense>
      <PortfolioManager
        portfolios={portfolios.map((p) => ({ id: p.id, name: p.name, ownerLabel: p.ownerLabel, language: p.language }))}
        activeId={active?.id ?? null}
        rows={rows}
        totals={{ value: v.value, invested: v.invested, dayChange: v.priced ? v.dayChange : null, dayChangePct: v.priced ? v.dayChangePct : null }}
        allocation={assetAllocation(day.holdings)}
        watching={watching.map((w) => ({ symbol: w.symbol, name: displayName(w.symbol, inst.get(w.symbol)), price: snaps.get(w.symbol)?.price ?? null, changePct: snaps.get(w.symbol)?.tradeDate === date ? (snaps.get(w.symbol)?.changePct ?? null) : null }))}
        isDemo={user.isTestAccount}
      />
    </Suspense>
  );
}
