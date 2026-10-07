"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useState, type ComponentType } from "react";
import { ErrorNote, Skeleton } from "./ui";
import { CompareView, DcfView, EarningsView, FinancialsView, MetricsView, PriceView, QuoteView } from "./views";
import { IndicesView, MoversView, NewsView, OwnershipView, PortfolioToolView, ProfileView, SearchView, WatchlistView } from "./lists";
import { CompsView, CorrelationView, DupontView, HealthView, RiskReturnView, SipView, TechnicalsView } from "./analysis-views";
import { toolMeta, type ToolName } from "@/lib/ask/registry";
import { trackClient } from "@/lib/events-client";

type ViewProps = { data: any; onPick?: (s: string) => void };

/** The card each tool's result renders as. Typed by tool name, so a tool without a card does not compile. */
const VIEWS: Record<ToolName, ComponentType<ViewProps>> = {
  searchTicker: SearchView,
  getQuote: QuoteView,
  getPriceHistory: PriceView,
  getKeyMetrics: MetricsView,
  getFinancialStatements: FinancialsView,
  compareStocks: CompareView,
  getEarnings: EarningsView,
  getCompanyProfile: ProfileView,
  getNews: NewsView,
  getMarketMovers: MoversView,
  getOwnership: OwnershipView,
  runDcfValuation: DcfView,
  getIndianMarketMovers: MoversView,
  getMarketOverview: IndicesView,
  getRiskReturn: RiskReturnView,
  getCorrelationMatrix: CorrelationView,
  runComparableValuation: CompsView,
  getDupontAnalysis: DupontView,
  getFinancialHealthScore: HealthView,
  runSipBacktest: SipView,
  getTechnicalIndicators: TechnicalsView,
  getMyPortfolio: PortfolioToolView,
  getWatchlist: WatchlistView,
  addToWatchlist: WatchlistView,
  removeFromWatchlist: WatchlistView,
};

function ExcelButton({ tool, data }: { tool: string; data: any }) {
  const [busy, setBusy] = useState(false);
  const model = toolMeta(tool)?.excel === "model";
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
  const meta = toolMeta(name);
  if (!meta) return null;
  const View = VIEWS[name as ToolName];
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <Skeleton label={meta.busy(part.input)} />;
    case "output-error":
      return <ErrorNote tool={name} message={part.errorText ?? "failed"} />;
    case "output-available": {
      const out = part.output;
      if (out && typeof out === "object" && "error" in out) return <ErrorNote tool={name} message={String(out.error)} />;
      return (
        <>
          <View data={out} onPick={onPick} />
          {meta.excel && <ExcelButton tool={name} data={out} />}
        </>
      );
    }
    default:
      return null;
  }
}
