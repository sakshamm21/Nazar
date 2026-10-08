import type { UIMessage } from "ai";

/**
 * Suggested next questions, derived from what the last answer already covered.
 * Rules-based on purpose: zero latency, zero cost, and always grounded in the tickers
 * actually discussed (an LLM-generated version would add ~1s and a model call per answer).
 */
export function followUps(message: UIMessage, askedBefore: string[]): string[] {
  const tools = new Map<string, any>();
  for (const p of message.parts as any[]) {
    if (typeof p.type === "string" && p.type.startsWith("tool-") && p.state === "output-available" && !(p.output && "error" in p.output)) {
      tools.set(p.type.slice(5), p.input ?? {});
    }
  }
  if (!tools.size) return [];
  const symbols: string[] = [];
  for (const input of tools.values()) {
    if (typeof input.symbol === "string") symbols.push(input.symbol.toUpperCase());
    if (Array.isArray(input.symbols)) symbols.push(...input.symbols.map((s: string) => String(s).toUpperCase()));
  }
  const tickers = [...new Set(symbols)].filter((s) => !s.startsWith("^"));
  const t = tickers[0];
  const has = (name: string) => tools.has(name);
  const out: string[] = [];

  if (has("compareStocks") && tickers.length >= 2) {
    out.push(`Which of ${tickers.slice(0, 3).join(", ")} has the strongest balance sheet?`);
    if (!has("getCorrelationMatrix")) out.push(`How correlated are ${tickers.slice(0, 4).join(", ")}?`);
    if (!has("runComparableValuation")) out.push(`Value ${tickers[0]} against ${tickers.slice(1, 4).join(", ")} using comps`);
  } else if (t) {
    if (!has("getPriceHistory")) out.push(`Show ${t}'s price chart for the last year`);
    if (!has("getKeyMetrics") && !has("runDcfValuation")) out.push(`Is ${t} expensive? Show its key valuation metrics`);
    if (!has("runDcfValuation") && has("getKeyMetrics")) out.push(`Run a DCF on ${t}`);
    if (has("runDcfValuation") && !has("runComparableValuation")) out.push(`Cross-check ${t} with a comps valuation against its peers`);
    if (!has("getFinancialHealthScore") && (has("getKeyMetrics") || has("runDcfValuation"))) out.push(`What is ${t}'s financial health score?`);
    if (!has("getRiskReturn") && has("getPriceHistory")) out.push(`How risky is ${t} compared to the index?`);
    if (has("runSipBacktest")) out.push(`Compare that with a monthly SIP in the Nifty 50`);
    if (has("getTechnicalIndicators") && !has("getRiskReturn")) out.push(`How volatile is ${t} vs the index over 3 years?`);
    if (!has("getNews")) out.push(`Latest news on ${t}`);
    if (!has("getFinancialStatements")) out.push(`Show ${t}'s revenue and profit over the last 4 years`);
    out.push(`Compare ${t} with its closest peers`);
  }
  if (has("getMarketOverview")) {
    const region = tools.get("getMarketOverview")?.region;
    if (region === "US") out.push("What are today's top US gainers?", "How has the S&P 500 done this year?");
    else out.push("Top Nifty 50 gainers today", "Which Nifty sectors are strongest this year?");
  }
  if (has("getIndianMarketMovers")) out.push("How are Indian markets doing overall today?", "Which Nifty 50 stocks are near their 52-week low?");
  if (has("getMarketMovers")) out.push("How are US markets doing today?");
  if (has("getMyPortfolio") && !has("getPortfolioPerformance")) out.push("How did my portfolio do this month, and why?");
  if (has("getMyPortfolio") && !has("getStressTest")) out.push("What if the Nifty falls 15%?");
  if (has("getPortfolioPerformance")) out.push("How much of that was just the market?", "And over the last year?");
  if (has("getMyPortfolio") || has("getPortfolioPerformance")) out.push("Which of my holdings is riskiest?", "How diversified am I really?");
  if (has("getWatchlist") || has("addToWatchlist")) out.push("Give me a quick update on the stocks I'm watching");
  if (t && !has("addToWatchlist")) out.push(`Add ${t} to my Watching list`);

  const seen = new Set(askedBefore.map((q) => q.trim().toLowerCase()));
  return [...new Set(out)].filter((q) => !seen.has(q.toLowerCase())).slice(0, 3);
}
