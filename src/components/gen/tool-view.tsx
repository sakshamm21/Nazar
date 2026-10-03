"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useState, type ComponentType } from "react";
import { ErrorNote, Skeleton } from "./ui";
import { CompareView, DcfView, EarningsView, FinancialsView, MetricsView, PriceView, QuoteView } from "./views";
import { IndicesView, MoversView, NewsView, OwnershipView, PortfolioToolView, ProfileView, SearchView, WatchlistView } from "./lists";
import { CompsView, CorrelationView, DupontView, HealthView, RiskReturnView, SipView, TechnicalsView } from "./analysis-views";
import { EXCEL_MODEL_TOOLS } from "@/lib/ask/tool-catalog";
import { PRIVATE_TOOLS } from "@/lib/ask/tool-names";
import { trackClient } from "@/lib/events-client";

type ViewProps = { data: any; onPick?: (s: string) => void };

const REGISTRY: Record<string, { label: (input: any) => string; View: ComponentType<ViewProps> }> = {
  searchTicker: { label: (i) => `Searching tickers for “${i?.query ?? "…"}”`, View: SearchView },
  getQuote: { label: (i) => `Fetching quote ${i?.symbols?.join(", ") ?? ""}`, View: QuoteView },
  getPriceHistory: { label: (i) => `Loading ${i?.symbol ?? ""} price history (${i?.range ?? "1y"})`, View: PriceView },
  getKeyMetrics: { label: (i) => `Pulling key metrics for ${i?.symbol ?? ""}`, View: MetricsView },
  getFinancialStatements: { label: (i) => `Loading ${i?.symbol ?? ""} ${i?.statement ?? ""} statement`, View: FinancialsView },
  compareStocks: { label: (i) => `Comparing ${i?.symbols?.join(" vs ") ?? ""}`, View: CompareView },
  getEarnings: { label: (i) => `Loading earnings for ${i?.symbol ?? ""}`, View: EarningsView },
  getCompanyProfile: { label: (i) => `Loading profile for ${i?.symbol ?? ""}`, View: ProfileView },
  getNews: { label: (i) => `Fetching news on ${i?.query ?? ""}`, View: NewsView },
  getMarketMovers: { label: (i) => `Running screener ${i?.screen ?? ""}`, View: MoversView },
  getOwnership: { label: (i) => `Loading ownership for ${i?.symbol ?? ""}`, View: OwnershipView },
  runDcfValuation: { label: (i) => `Running DCF model for ${i?.symbol ?? ""}`, View: DcfView },
  getIndianMarketMovers: { label: (i) => `Scanning Nifty 50 for ${String(i?.screen ?? "movers").replace(/_/g, " ")}`, View: MoversView },
  getMarketOverview: { label: (i) => `Loading ${i?.region === "US" ? "US" : i?.region === "GLOBAL" ? "global" : "Indian"} market overview`, View: IndicesView },
  getRiskReturn: { label: (i) => `Measuring risk & return for ${i?.symbol ?? ""}`, View: RiskReturnView },
  getCorrelationMatrix: { label: (i) => `Computing correlations for ${i?.symbols?.join(", ") ?? ""}`, View: CorrelationView },
  runComparableValuation: { label: (i) => `Valuing ${i?.symbol ?? ""} against ${i?.peers?.length ?? ""} peers`, View: CompsView },
  getDupontAnalysis: { label: (i) => `Running DuPont analysis for ${i?.symbol ?? ""}`, View: DupontView },
  getFinancialHealthScore: { label: (i) => `Scoring financial health of ${i?.symbol ?? ""}`, View: HealthView },
  runSipBacktest: { label: (i) => `Backtesting a monthly SIP in ${i?.symbol ?? ""}`, View: SipView },
  getTechnicalIndicators: { label: (i) => `Computing technical indicators for ${i?.symbol ?? ""}`, View: TechnicalsView },
  getMyPortfolio: { label: () => "Reading your portfolio from Nazar's latest checkup", View: PortfolioToolView },
  getWatchlist: { label: () => "Loading your Watching list", View: WatchlistView },
  addToWatchlist: { label: (i) => `Adding ${i?.symbols?.join(", ") ?? ""} to your watchlist`, View: WatchlistView },
  removeFromWatchlist: { label: (i) => `Removing ${i?.symbols?.join(", ") ?? ""} from your watchlist`, View: WatchlistView },
};

/** Tools with nothing worth exporting to a spreadsheet. */
const NO_EXCEL = new Set(["searchTicker", ...PRIVATE_TOOLS]);

function ExcelButton({ tool, data }: { tool: string; data: any }) {
  const [busy, setBusy] = useState(false);
  const model = EXCEL_MODEL_TOOLS.has(tool);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        trackClient("excel_download", { tool, scope: "card" });
        try {
          const { downloadToolExcel } = await import("@/lib/excel");
          await downloadToolExcel(tool, data);
        } finally {
          setBusy(false);
        }
      }}
      className="no-print -mt-1.5 mb-3 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-subtle hover:bg-surface-2 hover:text-accent"
      title={model ? "Live Excel model: blue cells are inputs, formulas recalculate" : "Download this data as an Excel sheet"}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
      {model ? "Download Excel model (live formulas)" : "Download as Excel"}
    </button>
  );
}

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
      return (
        <>
          <View data={out} onPick={onPick} />
          {!NO_EXCEL.has(name) && <ExcelButton tool={name} data={out} />}
        </>
      );
    }
    default:
      return null;
  }
}
