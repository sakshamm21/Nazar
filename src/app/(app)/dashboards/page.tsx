import type { Metadata } from "next";
import { DashboardBoard, type BoardCard } from "@/components/dashboards/board";
import { requirePageUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { BENCHMARKS, DASH_PERIODS, MARKET_GROUPS, benchmarkLabel, compare, partLabel } from "@/lib/dashboards/compare";
import { GROUP_ORDER } from "@/lib/instruments/asset-classes";
import { latestTradeDate, priceHistory, shiftDate } from "@/lib/market/store";
import { listDashboards } from "@/lib/repo/dashboards";
import { listPortfolios } from "@/lib/repo/portfolios";
import { ALL, portfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Dashboards" };

/** Your own comparisons: what you own, or a part of it, against an index, on as many dashboards as you like. */
export default async function DashboardsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requirePageUser();
  const db = await getDb();
  const [dashboards, portfolios] = await Promise.all([listDashboards(user.id), listPortfolios(user.id)]);
  const { d } = await searchParams;
  const active = dashboards.find((x) => x.id === d) ?? dashboards[0];

  // One view per portfolio the dashboard uses ("all" included), built once each.
  const scopes = [...new Set(active.widgets.map((w) => w.portfolio))];
  const views = new Map(await Promise.all(scopes.map(async (p) => [p, await portfolioView(user, p === ALL ? ALL : p)] as const)));
  const all = await portfolioView(user, ALL);
  const sources = all.sources;
  const date = all.tradeDate ?? (await latestTradeDate(db, sources));
  const bench = date ? await priceHistory(db, BENCHMARKS.map((b) => b.id), sources, shiftDate(date, -400), date) : new Map<string, Map<string, number>>();

  const names = new Map(all.empty ? [] : all.cards.map((c) => [c.symbol, c.name] as const));
  const cards: BoardCard[] = active.widgets.map((w) => {
    const view = views.get(w.portfolio);
    const scopeName = w.portfolio === ALL ? (portfolios.length > 1 ? "All portfolios" : (portfolios[0]?.name ?? "Your portfolio")) : (portfolios.find((p) => p.id === w.portfolio)?.name ?? null);
    const base = { widget: w, title: partLabel(w.part, names), scope: scopeName ?? "A deleted portfolio", benchmark: benchmarkLabel(w.benchmark), period: DASH_PERIODS.find((p) => p.id === w.period)!.label };
    if (!scopeName || !view || view.empty || (w.portfolio !== ALL && view.active?.id !== w.portfolio)) return { ...base, result: null, reason: scopeName ? "Nothing priced in this portfolio yet." : "That portfolio was deleted. Pick another." };
    const r = compare(view.perf.holdings, view.perf.dates, w.part, bench.get(w.benchmark) ?? new Map(), w.period);
    return { ...base, result: r, reason: r ? null : "Nothing in this portfolio matches this any more." };
  });

  const groups = all.empty ? [] : GROUP_ORDER.filter((g) => all.perf.holdings.some((h) => h.group === g));
  const options = {
    portfolios: [...(portfolios.length > 1 ? [{ id: ALL, name: "All portfolios" }] : [{ id: ALL, name: portfolios[0]?.name ?? "Your portfolio" }]), ...(portfolios.length > 1 ? portfolios.map((p) => ({ id: p.id, name: p.name })) : [])],
    parts: [
      { id: "whole", name: "Everything" },
      ...(groups.some((g) => !MARKET_GROUPS.includes(g)) ? [{ id: "market", name: partLabel("market") }] : []),
      ...groups.map((g) => ({ id: g, name: g })),
      ...(all.empty ? [] : all.cards.filter((c) => c.href).map((c) => ({ id: `symbol:${c.symbol}`, name: c.name }))),
    ],
    benchmarks: BENCHMARKS.map((b) => ({ id: b.id as string, name: b.label })),
    periods: DASH_PERIODS.map((p) => ({ id: p.id, name: p.label })),
  };

  return <DashboardBoard dashboards={dashboards.map((x) => ({ id: x.id, name: x.name }))} active={{ id: active.id, name: active.name, widgets: active.widgets }} cards={cards} options={options} />;
}
