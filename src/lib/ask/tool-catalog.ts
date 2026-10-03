/**
 * User-facing catalog of what the Ask tab can do (the Research page). Client-safe.
 * `excel`: "model" = downloads as a live Excel model with formulas; "data" = downloads as a data sheet.
 */
export type CatalogItem = { id: string; tools: string[]; name: string; description: string; example: string; excel: "model" | "data" | null };
export type CatalogGroup = { id: string; name: string; blurb: string; items: CatalogItem[] };

export const TOOL_CATALOG: CatalogGroup[] = [
  {
    id: "valuation",
    name: "Valuation models",
    blurb: "What is the business worth?",
    items: [
      { id: "dcf", tools: ["runDcfValuation"], name: "DCF valuation", description: "Intrinsic value from projected free cash flow, with a growth × discount-rate sensitivity grid.", example: "Run a DCF on Infosys", excel: "model" },
      { id: "comps", tools: ["runComparableValuation"], name: "Comparable companies (comps)", description: "Values a company on peer-median P/E, EV/EBITDA, P/B and P/S, with implied share prices.", example: "Value HDFC Bank against ICICI Bank, Kotak and Axis Bank using comps", excel: "model" },
      { id: "compare", tools: ["compareStocks"], name: "Side-by-side comparison", description: "Up to 6 stocks on any of 42 metrics, best value highlighted.", example: "Compare TCS, Infosys and HCLTech on margins and valuation", excel: "data" },
    ],
  },
  {
    id: "quality",
    name: "Quality & financial health",
    blurb: "Is the business strong?",
    items: [
      { id: "health", tools: ["getFinancialHealthScore"], name: "Financial health score", description: "Piotroski F-score (9 accounting tests) and Altman Z-score bankruptcy-risk zone.", example: "What is the financial health score of Tata Steel?", excel: "data" },
      { id: "dupont", tools: ["getDupontAnalysis"], name: "DuPont ROE analysis", description: "Splits return on equity into margin × asset turnover × leverage over 5 years.", example: "Do a DuPont analysis of Asian Paints", excel: "model" },
      { id: "statements", tools: ["getFinancialStatements"], name: "Financial statements", description: "Income statement, balance sheet and cash flow, annual or quarterly.", example: "Show Reliance's cash flow statement for the last 4 years", excel: "data" },
      { id: "metrics", tools: ["getKeyMetrics"], name: "42 key metrics", description: "Valuation, profitability, growth, balance sheet, dividends and ownership ratios.", example: "Show all key metrics for Maruti Suzuki", excel: "data" },
    ],
  },
  {
    id: "risk",
    name: "Risk, portfolio & planning",
    blurb: "How risky is it, and how does it fit?",
    items: [
      { id: "risk", tools: ["getRiskReturn"], name: "Risk & return vs index", description: "CAGR, volatility, Sharpe, Sortino, max drawdown, beta and alpha against the Nifty or S&P 500.", example: "How risky is Adani Enterprises compared to the Nifty over 3 years?", excel: "model" },
      { id: "correlation", tools: ["getCorrelationMatrix"], name: "Correlation matrix", description: "How closely 2–8 stocks move together: a diversification check.", example: "Show the correlation between TCS, HDFC Bank, Reliance and ITC", excel: "model" },
      { id: "sip", tools: ["runSipBacktest"], name: "SIP backtest", description: "What a monthly SIP would be worth today: invested, value, XIRR, vs lump sum.", example: "If I had done a ₹10,000 monthly SIP in the Nifty 50 for 5 years, what would it be worth?", excel: "model" },
    ],
  },
  {
    id: "technicals",
    name: "Technicals & price",
    blurb: "What is the price doing?",
    items: [
      { id: "technicals", tools: ["getTechnicalIndicators"], name: "Technical indicators", description: "50/200-day averages, RSI, MACD, golden/death cross and 52-week position.", example: "Give me a technical analysis of Tata Motors", excel: "data" },
      { id: "history", tools: ["getPriceHistory"], name: "Price history", description: "Interactive chart from 5 days to max, with volatility and drawdown.", example: "Show Titan's price over 5 years", excel: "data" },
      { id: "quote", tools: ["getQuote"], name: "Live quotes", description: "Price, day change, 52-week range, market cap and P/E.", example: "What is Bharti Airtel trading at?", excel: "data" },
    ],
  },
  {
    id: "markets",
    name: "Markets & news",
    blurb: "What is happening today?",
    items: [
      { id: "overview", tools: ["getMarketOverview"], name: "Market overview", description: "Nifty, Sensex, sector indices, India VIX and USD/INR; also US and global boards.", example: "How are Indian markets doing today?", excel: "data" },
      { id: "movers", tools: ["getIndianMarketMovers", "getMarketMovers"], name: "Top movers", description: "Nifty 50 gainers, losers, most active; US screeners too.", example: "Top Nifty 50 losers today", excel: "data" },
      { id: "news", tools: ["getNews"], name: "News", description: "Latest headlines for a company or topic.", example: "Latest news on Zomato", excel: "data" },
      { id: "earnings", tools: ["getEarnings"], name: "Earnings", description: "Quarterly revenue and profit, EPS versus estimates, and the next results date.", example: "How did Sun Pharma's last few quarters go?", excel: "data" },
      { id: "company", tools: ["getCompanyProfile", "getOwnership"], name: "Company & ownership", description: "Business description, management, promoter/institutional holdings.", example: "Who owns ITC and what does it do?", excel: "data" },
    ],
  },
  {
    id: "yours",
    name: "Your tools",
    blurb: "Track what matters to you",
    items: [
      { id: "portfolio", tools: ["getMyPortfolio"], name: "Your portfolio", description: "Read-only view of your holdings from last night's checkup: today's move, P&L, risk and health.", example: "Why is my portfolio down this month?", excel: null },
      { id: "watching", tools: ["getWatchlist", "addToWatchlist", "removeFromWatchlist"], name: "Watching list", description: "Stocks you follow without owning; Nazar includes them in its nightly check.", example: "Add Titan to my Watching list", excel: null },
      { id: "levels", tools: ["createPriceAlert", "listPriceAlerts", "deletePriceAlerts"], name: "Price levels", description: "Tell me when a stock closes beyond a level you choose.", example: "Tell me if Reliance closes below ₹1,100", excel: null },
    ],
  },
];

export const TOOL_COUNT = new Set(TOOL_CATALOG.flatMap((g) => g.items.flatMap((i) => i.tools))).size + 1; // + searchTicker (internal)
export const EXCEL_MODEL_TOOLS = new Set(TOOL_CATALOG.flatMap((g) => g.items.filter((i) => i.excel === "model").flatMap((i) => i.tools)));
