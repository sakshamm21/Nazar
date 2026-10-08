/**
 * Nazar's own symbols are not all market tickers. A price lookup on a mutual fund used to go to
 * Yahoo and come back "symbol may be delisted"; it is now refused before the lookup, with a reason.
 */
import { describe, expect, it } from "vitest";
import { askAbout } from "@/components/analysis/analyzer";
import { planPrefetch } from "@/lib/ask/prefetch";
import { symbol } from "@/lib/ask/tool-utils";
import { clean } from "@/lib/data/yahoo";

describe("a ticker as the market-data source knows it", () => {
  it.each([["tcs.ns", "TCS.NS"], [" AAPL ", "AAPL"], ["US:AAPL", "AAPL"], ["us:msft", "MSFT"], ["CRYPTO:BTC", "BTC-USD"], ["^NSEI", "^NSEI"], ["BTC-USD", "BTC-USD"]])("%s → %s", (given, want) => expect(clean(given)).toBe(want));
});

describe("a symbol the market-data tools cannot look up", () => {
  it.each(["MF:122639", "CMD:GOLD24", "MANUAL:abc123", "mf:100"])("%s is refused with a reason the model can act on", (s) => {
    const r = symbol.safeParse(s);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toMatch(/no market ticker.*getPortfolioPerformance/);
  });
  it.each(["TCS.NS", "US:AAPL", "CRYPTO:BTC", "^NSEI", "NIFTYBEES.NS"])("%s is accepted", (s) => expect(symbol.safeParse(s).success).toBe(true));
});

describe("the question the Analysis screen opens Ask with", () => {
  it.each([
    [{ period: "1M", change: -25000, changePct: -0.02 }, "Why is my portfolio down over the last month?", "1M"],
    [{ period: "1W", change: 900, changePct: 0.004 }, "Why is my portfolio up over the last week?", "1W"],
    [{ period: "3M", change: -1, changePct: -0.01 }, "Why is my portfolio down over the last 3 months?", "3M"],
    [{ period: "6M", change: 5, changePct: 0.01 }, "Why is my portfolio up over the last 6 months?", "6M"],
    [{ period: "1Y", change: 5, changePct: 0.01 }, "Why is my portfolio up over the last year?", "1Y"],
    [{ period: "1M", change: 0.2, changePct: 0.00001 }, "What did my portfolio do over the last month?", "1M"],
  ] as const)("%o", (a, question, period) => {
    expect(askAbout(a)).toBe(question);
    // And Ask reads that same period ahead, so the answer is the screen's own analysis.
    expect(planPrefetch(question)).toEqual({ tool: "getPortfolioPerformance", input: { period } });
  });
  it("today's move opens on today's snapshot", () => {
    expect(askAbout({ period: "1D", change: -400, changePct: -0.003 })).toBe("Why am I down today?");
    expect(planPrefetch("Why am I down today?")).toEqual({ tool: "getMyPortfolio", input: {} });
  });
});
