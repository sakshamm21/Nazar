/**
 * Capital gains: which rules each holding follows, short against long by each purchase's own age,
 * the equity exemption, set-off of losses, and crypto standing apart. The rates are statutory, so
 * these tests are a statement of the rules rather than a tolerance check.
 */
import { describe, expect, it } from "vitest";
import {
  CESS,
  LTCG_EXEMPTION,
  byHolding,
  financialYear,
  holdingDays,
  isLongTerm,
  realisedParts,
  remainingExemption,
  summariseGains,
  taxKindOf,
  unrealisedParts,
  type GainPart,
  type TaxKind,
} from "@/lib/portfolio/capital-gains";

const part = (kind: TaxKind, gain: number, longTerm: boolean, o: Partial<GainPart> = {}): GainPart => ({ symbol: "X", name: "X", kind, units: 1, cost: 1000, value: 1000 + gain, gain, daysHeld: longTerm ? 800 : 30, longTerm, ...o });
const withCess = (x: number) => x * (1 + CESS);

describe("which rules a holding follows", () => {
  it("shares, REITs and equity funds follow the equity rules", () => {
    expect(taxKindOf({ assetClass: "stock" })).toBe("equity");
    expect(taxKindOf({ assetClass: "reit" })).toBe("equity");
    expect(taxKindOf({ assetClass: "etf", category: "ETF · Nifty 50", name: "Nippon India ETF Nifty 50 BeES" })).toBe("equity");
    expect(taxKindOf({ assetClass: "mf", category: "Equity Scheme - Flexi Cap Fund" })).toBe("equity");
    expect(taxKindOf({ assetClass: "mf", category: "Equity Schemes - ELSS- Tax Saver Fund" })).toBe("equity");
    expect(taxKindOf({ assetClass: "mf", category: "Hybrid Schemes - Aggressive Hybrid Fund" })).toBe("equity");
    expect(taxKindOf({ assetClass: "mf", category: "Hybrid Scheme - Arbitrage Fund" })).toBe("equity");
    expect(taxKindOf({ assetClass: "mf", category: "Other Scheme - Index Funds", name: "UTI Nifty 50 Index Fund - Direct - Growth" })).toBe("equity");
  });
  it("gold and silver ETFs and Sovereign Gold Bonds are listed but not equity", () => {
    expect(taxKindOf({ assetClass: "etf", category: "Gold or silver ETF", name: "Nippon India ETF Gold BeES" })).toBe("listed");
    expect(taxKindOf({ assetClass: "gold", symbol: "CMD:SGB" })).toBe("listed");
  });
  it("US stocks, physical gold and funds of funds follow the two-year rules", () => {
    expect(taxKindOf({ assetClass: "us" })).toBe("other");
    expect(taxKindOf({ assetClass: "gold", symbol: "CMD:GOLD24" })).toBe("other");
    expect(taxKindOf({ assetClass: "mf", category: "Other Scheme - FoF Overseas", name: "Motilal Oswal Nasdaq 100 FoF" })).toBe("other");
    expect(taxKindOf({ assetClass: "mf", category: "Hybrid Scheme - Multi Asset Allocation" })).toBe("other");
  });
  it("debt funds bought since April 2023 are always at the slab; earlier ones keep the two-year rules", () => {
    expect(taxKindOf({ assetClass: "mf", category: "Debt Scheme - Liquid Fund", bought: "2024-01-01" })).toBe("debt");
    expect(taxKindOf({ assetClass: "mf", category: "Income/Debt Oriented Schemes - Short Term Fund", bought: "2022-01-01" })).toBe("other");
    expect(taxKindOf({ assetClass: "mf", category: "Other Scheme - Index Funds", name: "Bharat Bond Index Fund April 2030", bought: "2024-01-01" })).toBe("debt");
    expect(taxKindOf({ assetClass: "mf", category: "Hybrid Scheme - Conservative Hybrid Fund", bought: "2025-01-01" })).toBe("debt");
  });
  it("crypto is crypto", () => {
    expect(taxKindOf({ assetClass: "crypto" })).toBe("crypto");
  });
});

describe("how long is long", () => {
  it("equity and listed: more than 12 months", () => {
    expect(isLongTerm("equity", 365)).toBe(false);
    expect(isLongTerm("equity", 366)).toBe(true);
    expect(isLongTerm("listed", 366)).toBe(true);
  });
  it("US stocks and physical gold: more than 24 months", () => {
    expect(isLongTerm("other", 400)).toBe(false);
    expect(isLongTerm("other", 731)).toBe(true);
  });
  it("debt funds and crypto never become long-term", () => {
    expect(isLongTerm("debt", 5000)).toBe(false);
    expect(isLongTerm("crypto", 5000)).toBe(false);
  });
  it("counts days between two dates and never goes negative", () => {
    expect(holdingDays("2024-01-01", "2025-01-01")).toBe(366);
    expect(holdingDays("2025-01-01", "2024-01-01")).toBe(0);
  });
});

describe("the tax on a set of gains", () => {
  it("short-term equity at 20%, with cess", () => {
    const s = summariseGains([part("equity", 10_000, false)], null);
    expect(s.tax).toBeCloseTo(withCess(2000), 6);
  });
  it("long-term equity is exempt up to ₹1.25 lakh, then 12.5%", () => {
    const s = summariseGains([part("equity", 300_000, true)], null);
    expect(s.buckets[0].exempt).toBe(LTCG_EXEMPTION);
    expect(s.tax).toBeCloseTo(withCess(175_000 * 0.125), 6);
  });
  it("slab-rate gains have no rupee figure until a slab is given", () => {
    const parts = [part("other", 50_000, false), part("listed", 20_000, true)];
    const none = summariseGains(parts, null);
    expect(none.untaxedSlabGain).toBe(50_000);
    expect(none.tax).toBeCloseTo(withCess(20_000 * 0.125), 6);
    const at30 = summariseGains(parts, 30);
    expect(at30.untaxedSlabGain).toBe(0);
    expect(at30.tax).toBeCloseTo(withCess(50_000 * 0.3 + 20_000 * 0.125), 6);
  });
  it("crypto is 30% on gains, and its losses offset nothing", () => {
    const s = summariseGains([part("crypto", 10_000, false), part("crypto", -4000, false), part("equity", 5000, false)], null);
    expect(s.cryptoLoss).toBe(4000);
    expect(s.tax).toBeCloseTo(withCess(10_000 * 0.3 + 5000 * 0.2), 6);
  });
  it("a short-term loss offsets other gains; a long-term loss only long-term gains", () => {
    const s = summariseGains([part("equity", -10_000, false), part("equity", 30_000, false)], null);
    expect(s.tax).toBeCloseTo(withCess(20_000 * 0.2), 6);
    const l = summariseGains([part("listed", -10_000, true), part("equity", 30_000, false)], null);
    expect(l.tax).toBeCloseTo(withCess(30_000 * 0.2), 6);
  });
  it("nothing to sum is nothing owed", () => {
    expect(summariseGains([], 30)).toMatchObject({ buckets: [], tax: 0, totalGain: 0 });
  });
});

describe("gains still sitting in the portfolio", () => {
  it("each purchase is counted from its own date, so one holding can be part long and part short", () => {
    const parts = unrealisedParts([{ symbol: "INFY.NS", name: "Infosys", assetClass: "stock", category: null, price: 200, lots: [{ units: 10, price: 100, date: "2023-01-01" }, { units: 10, price: 150, date: "2025-10-01" }] }], "2025-11-05");
    expect(parts.map((p) => p.longTerm)).toEqual([true, false]);
    const [h] = byHolding(parts);
    expect(h.long).toBe(1000);
    expect(h.short).toBe(500);
    expect(h.gain).toBe(1500);
  });
  it("an unpriced position is left out rather than shown as a loss", () => {
    expect(unrealisedParts([{ symbol: "NEW.NS", name: "New", assetClass: "stock", category: null, price: null, lots: [{ units: 1, price: 100, date: "2024-01-01" }] }], "2025-01-01")).toEqual([]);
  });
});

describe("a sale's gains", () => {
  it("each part keeps the age of the purchase it came out of", () => {
    const parts = realisedParts({ symbol: "AAPL", name: "Apple", assetClass: "us", category: null, price: 300, date: "2025-06-01", parts: [{ date: "2022-01-01", units: 1, price: 100 }, { date: "2025-01-01", units: 1, price: 250 }] });
    expect(parts.map((p) => [p.kind, p.longTerm, p.gain])).toEqual([["other", true, 200], ["other", false, 50]]);
  });
});

describe("the financial year and the exemption", () => {
  it("April to March", () => {
    expect(financialYear("2025-03-31")).toMatchObject({ label: "2024-25", from: "2024-04-01", to: "2025-03-31" });
    expect(financialYear("2025-04-01").label).toBe("2025-26");
  });
  it("what is left of the exemption shrinks with the year's gains and never goes below zero", () => {
    expect(remainingExemption(0)).toBe(125_000);
    expect(remainingExemption(100_000)).toBe(25_000);
    expect(remainingExemption(500_000)).toBe(0);
  });
});
