/**
 * The one list of Ask tools: what each is called on screen, what it says while it runs, where its
 * data comes from, how it downloads, and whether its result is the user's private data.
 * Client-safe (metadata only). The server-side tools in tools.ts must match these names exactly.
 */
type Meta = {
  /** Name in "How this answer was built" and in Excel sheets. */
  label: string;
  /** What the card says while the tool runs. */
  busy: (input: any) => string;
  source: "yahoo" | "nazar";
  /** "model" downloads as a live Excel model with formulas, "data" as a data sheet, null not at all. */
  excel: "model" | "data" | null;
  /** The result is the user's own data: hidden on shared links. */
  private?: true;
  /** Changes something for the user. */
  writes?: true;
};

const SOURCE_TEXT: Record<Meta["source"], string> = {
  yahoo: "Yahoo Finance (quotes can be delayed up to ~15 min)",
  nazar: "Nazar's latest checkup",
};

export const TOOLS = {
  searchTicker: { label: "Ticker search", busy: (i) => `Searching tickers for “${i?.query ?? "…"}”`, source: "yahoo", excel: null },
  getQuote: { label: "Live quote", busy: (i) => `Fetching quote ${i?.symbols?.join(", ") ?? ""}`, source: "yahoo", excel: "data" },
  getPriceHistory: { label: "Price history", busy: (i) => `Loading ${i?.symbol ?? ""} price history (${i?.range ?? "1y"})`, source: "yahoo", excel: "data" },
  getKeyMetrics: { label: "Key metrics", busy: (i) => `Pulling key metrics for ${i?.symbol ?? ""}`, source: "yahoo", excel: "data" },
  getFinancialStatements: { label: "Financial statements", busy: (i) => `Loading ${i?.symbol ?? ""} ${i?.statement ?? ""} statement`, source: "yahoo", excel: "data" },
  compareStocks: { label: "Peer comparison", busy: (i) => `Comparing ${i?.symbols?.join(" vs ") ?? ""}`, source: "yahoo", excel: "data" },
  getEarnings: { label: "Earnings", busy: (i) => `Loading earnings for ${i?.symbol ?? ""}`, source: "yahoo", excel: "data" },
  getCompanyProfile: { label: "Company profile", busy: (i) => `Loading profile for ${i?.symbol ?? ""}`, source: "yahoo", excel: "data" },
  getNews: { label: "News", busy: (i) => `Fetching news on ${i?.query ?? ""}`, source: "yahoo", excel: "data" },
  getMarketMovers: { label: "US screener", busy: (i) => `Running screener ${i?.screen ?? ""}`, source: "yahoo", excel: "data" },
  getIndianMarketMovers: { label: "Nifty 50 movers", busy: (i) => `Scanning Nifty 50 for ${String(i?.screen ?? "movers").replace(/_/g, " ")}`, source: "yahoo", excel: "data" },
  getMarketOverview: { label: "Index board", busy: (i) => `Loading ${i?.region === "US" ? "US" : i?.region === "GLOBAL" ? "global" : "Indian"} market overview`, source: "yahoo", excel: "data" },
  getOwnership: { label: "Ownership", busy: (i) => `Loading ownership for ${i?.symbol ?? ""}`, source: "yahoo", excel: "data" },
  runDcfValuation: { label: "DCF model", busy: (i) => `Running DCF model for ${i?.symbol ?? ""}`, source: "yahoo", excel: "model" },
  getRiskReturn: { label: "Risk & return", busy: (i) => `Measuring risk & return for ${i?.symbol ?? ""}`, source: "yahoo", excel: "model" },
  getCorrelationMatrix: { label: "Correlation matrix", busy: (i) => `Computing correlations for ${i?.symbols?.join(", ") ?? ""}`, source: "yahoo", excel: "model" },
  runComparableValuation: { label: "Comps valuation", busy: (i) => `Valuing ${i?.symbol ?? ""} against ${i?.peers?.length ?? ""} peers`, source: "yahoo", excel: "model" },
  getDupontAnalysis: { label: "DuPont analysis", busy: (i) => `Running DuPont analysis for ${i?.symbol ?? ""}`, source: "yahoo", excel: "model" },
  getFinancialHealthScore: { label: "Health score", busy: (i) => `Scoring financial health of ${i?.symbol ?? ""}`, source: "yahoo", excel: "data" },
  runSipBacktest: { label: "SIP backtest", busy: (i) => `Backtesting a monthly SIP in ${i?.symbol ?? ""}`, source: "yahoo", excel: "model" },
  getTechnicalIndicators: { label: "Technicals", busy: (i) => `Computing technical indicators for ${i?.symbol ?? ""}`, source: "yahoo", excel: "data" },
  getPortfolioPerformance: { label: "Your portfolio over a period", busy: (i) => `Working out how your portfolio did (${i?.period ?? "period"})`, source: "nazar", excel: null, private: true },
  getStressTest: { label: "A market move, applied to your portfolio", busy: (i) => `Working out a ${Math.abs(Number(i?.niftyMovePct ?? 10))}% Nifty ${Number(i?.niftyMovePct ?? -10) < 0 ? "fall" : "rise"} on your portfolio`, source: "nazar", excel: null, private: true },
  getCapitalGains: { label: "Your unsold gains", busy: () => "Reading the gains in your portfolio", source: "nazar", excel: null, private: true },
  getGoals: { label: "Your savings goals", busy: () => "Reading your savings goals", source: "nazar", excel: null, private: true },
  getMyPortfolio: { label: "Your portfolio", busy: () => "Reading your portfolio from Nazar's latest checkup", source: "nazar", excel: null, private: true },
  getWatchlist: { label: "Your Watching list", busy: () => "Loading your Watching list", source: "nazar", excel: null, private: true },
  addToWatchlist: { label: "Watching list update", busy: (i) => `Adding ${i?.symbols?.join(", ") ?? ""} to your watchlist`, source: "nazar", excel: null, private: true, writes: true },
  removeFromWatchlist: { label: "Watching list update", busy: (i) => `Removing ${i?.symbols?.join(", ") ?? ""} from your watchlist`, source: "nazar", excel: null, private: true, writes: true },
} satisfies Record<string, Meta>;

export type ToolName = keyof typeof TOOLS;
export const TOOL_COUNT = Object.keys(TOOLS).length;

/** Looks a tool up by a name that came from stored data, so it may be one that no longer exists. */
export const toolMeta = (name: string): Meta | undefined => (Object.hasOwn(TOOLS, name) ? (TOOLS as Record<string, Meta>)[name] : undefined);
export const toolLabel = (name: string) => toolMeta(name)?.label ?? name;
export const isPrivateTool = (name: string) => toolMeta(name)?.private === true;

/** Where the data behind an answer came from, one line per distinct source. */
export const sourcesOf = (names: string[]) => [...new Set(names.map((n) => SOURCE_TEXT[toolMeta(n)?.source ?? "yahoo"]))];
