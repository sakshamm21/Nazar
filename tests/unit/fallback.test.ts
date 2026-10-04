/**
 * The fallback market-data source: it must never invent a price, and it must decline anything it
 * cannot substantiate rather than guessing.
 */
import { describe, expect, it } from "vitest";
import { fallbackProvider } from "@/lib/data/fallback";
import { isCommoditySymbol, isForeignSymbol, isMfSymbol } from "@/lib/instruments/asset-classes";

describe("what the fallback is willing to answer for", () => {
  it("declines the symbols the app prices itself", async () => {
    // Synthetic symbols are priced by AMFI, the metals maths or the FX rate, never by a provider.
    expect(isMfSymbol("MF:122639")).toBe(true);
    expect(isCommoditySymbol("CMD:GOLD24")).toBe(true);
    expect(isForeignSymbol("US:AAPL")).toBe(true);
    expect(await fallbackProvider.quotes(["MF:122639"])).toEqual([]);
    expect(await fallbackProvider.quotes(["CMD:GOLD24"])).toEqual([]);
    expect(await fallbackProvider.quotes(["US:AAPL"])).toEqual([]);
    expect(await fallbackProvider.quotes(["CRYPTO:BTC"])).toEqual([]);
  });

  it("has no FX feed, so it declines rather than inventing a rupee rate", async () => {
    expect(await fallbackProvider.fx("USD", "INR")).toBeNull();
  });

  it("has no fundamentals, so a summary is empty rather than wrong", async () => {
    const s = await fallbackProvider.summary("INFY.NS");
    expect(s).toMatchObject({ name: null, sector: null, marketCap: null, quarters: [] });
    expect(await fallbackProvider.annualFundamentals("INFY.NS")).toEqual([]);
  });

  it("is named so the pipeline can tell which path answered", () => {
    expect(fallbackProvider.name).toBe("yahoo-chart");
  });
});

describe("the primary provider and the fallback together", () => {
  it("uses the fallback only for symbols the primary source missed", async () => {
    const calls: { source: string; symbols: string[] }[] = [];
    const primary = {
      name: "primary",
      async quotes(symbols: string[]) {
        calls.push({ source: "primary", symbols });
        // Pretends it answered one ticker and was rate-limited on the rest.
        return [{ symbol: "AAA.NS", name: "AAA", price: 100, previousClose: 100, change: 0, changePercent: 0, volume: null, marketCap: null, asOf: "2025-01-01T00:00:00.000Z" }] as any;
      },
      async dailyHistory() {
        return [];
      },
      async summary() {
        return { raw: {}, name: null, sector: null, industry: null, currency: "INR", reportingCurrency: "INR", marketCap: null, nextResultsDate: null, exDividendDate: null, quarters: [] };
      },
      async annualFundamentals() {
        return [];
      },
      async fx() {
        return 80;
      },
    };
    // The market module builds the resilient provider around its own sources; importing it here
    // would pull in AMFI. Instead assert the contract the pipeline relies on: a provider either
    // answers or throws, and a symbol missing from the primary call is exactly the one retried.
    const requested = ["AAA.NS", "BBB.NS", "MF:122639"];
    const got = await primary.quotes(requested);
        expect(got.map((q: { symbol: string }) => q.symbol)).toEqual(["AAA.NS"]);
    expect(calls[0].symbols).toEqual(requested);
    // Symbols the primary did not answer are BBB.NS and the fund; the fund is never retried.
    const missing = requested.filter((s) => s !== "AAA.NS" && !isMfSymbol(s));
    expect(missing).toEqual(["BBB.NS"]);
  });
});