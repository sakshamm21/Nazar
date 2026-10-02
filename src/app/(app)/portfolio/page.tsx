import type { Metadata } from "next";
import { Suspense } from "react";
import { PortfolioManager } from "@/components/portfolio/portfolio-manager";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { displayName } from "@/lib/market/portfolio-day";
import { dateSources, instrumentsFor, latestTradeDate, snapshotsAsOf, sourcesFor } from "@/lib/market/store";
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
  const date = await latestTradeDate(db, dateSources(sources));
  const symbols = [...holdings.map((h) => h.symbol), ...watching.map((w) => w.symbol)];
  const [snaps, inst] = await Promise.all([date ? snapshotsAsOf(db, symbols, date, sources) : new Map(), instrumentsFor(db, symbols)]);
  const rows = holdings.map((h) => {
    const price = snaps.get(h.symbol)?.price ?? null;
    const value = h.quantity * (price ?? h.avgPrice);
    return { id: h.id, symbol: h.symbol, name: displayName(h.symbol, inst.get(h.symbol)), quantity: h.quantity, avgPrice: h.avgPrice, buyDate: h.buyDate, price, value, pnl: price != null ? value - h.quantity * h.avgPrice : null, pnlPct: price != null ? price / h.avgPrice - 1 : null, source: h.source };
  });
  rows.sort((a, b) => b.value - a.value);
  return (
    <Suspense>
      <PortfolioManager
        portfolios={portfolios.map((p) => ({ id: p.id, name: p.name, ownerLabel: p.ownerLabel, language: p.language }))}
        activeId={active?.id ?? null}
        rows={rows}
        watching={watching.map((w) => ({ symbol: w.symbol, name: displayName(w.symbol, inst.get(w.symbol)), price: snaps.get(w.symbol)?.price ?? null, changePct: snaps.get(w.symbol)?.tradeDate === date ? (snaps.get(w.symbol)?.changePct ?? null) : null }))}
        isDemo={user.isDemo}
      />
    </Suspense>
  );
}
