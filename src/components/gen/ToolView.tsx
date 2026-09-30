"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentType } from "react";
import { ErrorNote, Skeleton } from "./ui";
import { AnalystView, CompareView, DcfView, EarningsView, FinancialsView, MetricsView, PriceView, QuoteView } from "./views";
import { AlertsView, IndicesView, MoversView, NewsView, OwnershipView, ProfileView, SearchView, WatchlistView } from "./lists";

type ViewProps = { data: any; onPick?: (s: string) => void };

const REGISTRY: Record<string, { label: (input: any) => string; View: ComponentType<ViewProps> }> = {
  searchTicker: { label: (i) => `Searching tickers for “${i?.query ?? "…"}”`, View: SearchView },
  getQuote: { label: (i) => `Fetching quote ${i?.symbols?.join(", ") ?? ""}`, View: QuoteView },
  getPriceHistory: { label: (i) => `Loading ${i?.symbol ?? ""} price history (${i?.range ?? "1y"})`, View: PriceView },
  getKeyMetrics: { label: (i) => `Pulling key metrics for ${i?.symbol ?? ""}`, View: MetricsView },
  getFinancialStatements: { label: (i) => `Loading ${i?.symbol ?? ""} ${i?.statement ?? ""} statement`, View: FinancialsView },
  compareStocks: { label: (i) => `Comparing ${i?.symbols?.join(" vs ") ?? ""}`, View: CompareView },
  getAnalystRatings: { label: (i) => `Gathering analyst ratings for ${i?.symbol ?? ""}`, View: AnalystView },
  getEarnings: { label: (i) => `Loading earnings for ${i?.symbol ?? ""}`, View: EarningsView },
  getCompanyProfile: { label: (i) => `Loading profile for ${i?.symbol ?? ""}`, View: ProfileView },
  getNews: { label: (i) => `Fetching news on ${i?.query ?? ""}`, View: NewsView },
  getMarketMovers: { label: (i) => `Running screener ${i?.screen ?? ""}`, View: MoversView },
  getOwnership: { label: (i) => `Loading ownership for ${i?.symbol ?? ""}`, View: OwnershipView },
  runDcfValuation: { label: (i) => `Running DCF model for ${i?.symbol ?? ""}`, View: DcfView },
  getIndianMarketMovers: { label: (i) => `Scanning Nifty 50 for ${String(i?.screen ?? "movers").replace(/_/g, " ")}`, View: MoversView },
  getMarketOverview: { label: (i) => `Loading ${i?.region === "US" ? "US" : i?.region === "GLOBAL" ? "global" : "Indian"} market overview`, View: IndicesView },
  getWatchlist: { label: () => "Loading your watchlist", View: WatchlistView },
  addToWatchlist: { label: (i) => `Adding ${i?.symbols?.join(", ") ?? ""} to your watchlist`, View: WatchlistView },
  removeFromWatchlist: { label: (i) => `Removing ${i?.symbols?.join(", ") ?? ""} from your watchlist`, View: WatchlistView },
  createPriceAlert: { label: (i) => `Setting alert on ${i?.symbol ?? ""}`, View: AlertsView },
  listPriceAlerts: { label: () => "Loading your alerts", View: AlertsView },
  deletePriceAlerts: { label: () => "Deleting alerts", View: AlertsView },
};

export function ToolView({ part, onPick }: { part: any; onPick?: (s: string) => void }) {
  const name = String(part.type).replace(/^tool-/, "");
  const entry = REGISTRY[name];
  if (!entry) return null;
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <Skeleton label={entry.label(part.input)} />;
    case "output-error":
      return <ErrorNote tool={name} message={part.errorText ?? "failed"} />;
    case "output-available": {
      const out = part.output;
      if (out && typeof out === "object" && "error" in out) return <ErrorNote tool={name} message={String(out.error)} />;
      const { View } = entry;
      return <View data={out} onPick={onPick} />;
    }
    default:
      return null;
  }
}
