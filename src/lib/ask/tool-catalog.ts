import { TOOLS, type ToolName } from "./registry";

/**
 * User-facing catalog of what the Ask tab can do (the Research page). Client-safe.
 * Which tools exist, and how each downloads, comes from the registry; this file only groups and describes them.
 */
type Item = { id: string; tools: ToolName[]; name: string; description: string; example: string };
export type CatalogItem = Item & { excel: "model" | "data" | null };
export type CatalogGroup = { id: string; name: string; blurb: string; items: CatalogItem[] };

const GROUPS: { id: string; name: string; blurb: string; items: Item[] }[] = [
  {
    id: "valuation",
    name: "Valuation models",
    blurb: "What is the business worth?",
    items: [
      { id: "dcf", tools: ["runDcfValuation"], name: "DCF valuation", description: "Intrinsic value from projected free cash flow, with a growth × discount-rate sensitivity grid.", example: "Run a DCF on Infosys" },
      { id: "comps", tools: ["runComparableValuation"], name: "Comparable companies (comps)", description: "Values a company on peer-median P/E, EV/EBITDA, P/B and P/S, with implied share prices.", example: "Value HDFC Bank against ICICI Bank, Kotak and Axis Bank using comps" },
      { id: "compare", tools: ["compareStocks"], name: "Side-by-side comparison", description: "Up to 6 stocks on any of 42 metrics, best value highlighted.", example: "Compare TCS, Infosys and HCLTech on margins and valuation" },
    ],
  },
  {
    id: "quality",
    name: "Quality & financial health",
    blurb: "Is the business strong?",
    items: [
      { id: "health", tools: ["getFinancialHealthScore"], name: "Financial health score", description: "Piotroski F-score (9 accounting tests) and Altman Z-score bankruptcy-risk zone.", example: "What is the financial health score of Tata Steel?" },
      { id: "dupont", tools: ["getDupontAnalysis"], name: "DuPont ROE analysis", description: "Splits return on equity into margin × asset turnover × leverage over 5 years.", example: "Do a DuPont analysis of Asian Paints" },
      { id: "statements", tools: ["getFinancialStatements"], name: "Financial statements", description: "Income statement, balance sheet and cash flow, annual or quarterly.", example: "Show Reliance's cash flow statement for the last 4 years" },
      { id: "metrics", tools: ["getKeyMetrics"], name: "42 key metrics", description: "Valuation, profitability, growth, balance sheet, dividends and ownership ratios.", example: "Show all key metrics for Maruti Suzuki" },
    ],
  },
  {
    id: "risk",
    name: "Risk, portfolio & planning",
    blurb: "How risky is it, and how does it fit?",
    items: [
      { id: "risk", tools: ["getRiskReturn"], name: "Risk & return vs index", description: "CAGR, volatility, Sharpe, Sortino, max drawdown, beta and alpha against the Nifty or S&P 500.", example: "How risky is Adani Enterprises compared to the Nifty over 3 years?" },
      { id: "correlation", tools: ["getCorrelationMatrix"], name: "Correlation matrix", description: "How closely 2–8 stocks move together: a diversification check.", example: "Show the correlation between TCS, HDFC Bank, Reliance and ITC" },
      { id: "sip", tools: ["runSipBacktest"], name: "SIP backtest", description: "What a monthly SIP would be worth today: invested, value, XIRR, vs lump sum.", example: "If I had done a ₹10,000 monthly SIP in the Nifty 50 for 5 years, what would it be worth?" },
    ],
  },
  {
    id: "technicals",
    name: "Technicals & price",
    blurb: "What is the price doing?",
    items: [
      { id: "technicals", tools: ["getTechnicalIndicators"], name: "Technical indicators", description: "50/200-day averages, RSI, MACD, golden/death cross and 52-week position.", example: "Give me a technical analysis of Tata Motors" },
      { id: "history", tools: ["getPriceHistory"], name: "Price history", description: "Interactive chart from 5 days to max, with volatility and drawdown.", example: "Show Titan's price over 5 years" },
      { id: "quote", tools: ["getQuote"], name: "Live quotes", description: "Price, day change, 52-week range, market cap and P/E.", example: "What is Bharti Airtel trading at?" },
    ],
  },
  {
    id: "markets",
    name: "Markets & news",
    blurb: "What is happening today?",
    items: [
      { id: "overview", tools: ["getMarketOverview"], name: "Market overview", description: "Nifty, Sensex, sector indices, India VIX and USD/INR; also US and global boards.", example: "How are Indian markets doing today?" },
      { id: "movers", tools: ["getIndianMarketMovers", "getMarketMovers"], name: "Top movers", description: "Nifty 50 gainers, losers, most active; US screeners too.", example: "Top Nifty 50 losers today" },
      { id: "news", tools: ["getNews"], name: "News", description: "Latest headlines for a company or topic.", example: "Latest news on Zomato" },
      { id: "earnings", tools: ["getEarnings"], name: "Earnings", description: "Quarterly revenue and profit, EPS versus estimates, and the next results date.", example: "How did Sun Pharma's last few quarters go?" },
      { id: "company", tools: ["getCompanyProfile", "getOwnership"], name: "Company & ownership", description: "Business description, management, promoter/institutional holdings.", example: "Who owns ITC and what does it do?" },
    ],
  },
  {
    id: "yours",
    name: "Your tools",
    blurb: "Track what matters to you",
    items: [
      { id: "portfolio", tools: ["getMyPortfolio"], name: "Your portfolio", description: "Read-only view of your holdings from last night's checkup: today's move, P&L, risk and health.", example: "Which of my holdings is riskiest, and why?" },
      { id: "performance", tools: ["getPortfolioPerformance"], name: "Your portfolio over a period", description: "What your portfolio did over a week, a month or a year: which holdings caused it, and how much was simply the market.", example: "Why is my portfolio down this month?" },
      { id: "whatif", tools: ["getStressTest"], name: "What if the market moves", description: "What a fall or rise in the Nifty would do to your portfolio, and which of what you own accounts for most of it.", example: "What if the Nifty falls 15%?" },
      { id: "gains", tools: ["getCapitalGains"], name: "Your unsold gains", description: "The gain sitting in each holding, how long you have owned it, and whether it would count as long-term today.", example: "How much of my gain would count as long-term if I sold today?" },
      { id: "sips", tools: ["getSips"], name: "Your SIPs", description: "Each monthly SIP you have set up: the amount, the next due date, what the instalments added so far are worth, and the total going in each month.", example: "How are my SIPs doing?" },
      { id: "goals", tools: ["getGoals"], name: "Your savings goals", description: "Each goal's target and date, what it needs each month from here, and whether today's pace reaches it.", example: "Am I on track for my savings goals?" },
      { id: "watching", tools: ["getWatchlist", "addToWatchlist", "removeFromWatchlist"], name: "Watching list", description: "Stocks you follow without owning; Nazar includes them in its nightly check.", example: "Add Titan to my Watching list" },
    ],
  },
];

/** An item downloads the way its first tool does. */
export const TOOL_CATALOG: CatalogGroup[] = GROUPS.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, excel: TOOLS[i.tools[0]].excel })) }));
