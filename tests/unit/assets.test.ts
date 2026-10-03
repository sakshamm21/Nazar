import { describe, expect, it } from "vitest";
import { parseAmfi } from "@/lib/data/amfi-parse";
import { resolveLocal } from "@/lib/importers/resolve";
import { manualValue } from "@/lib/instruments/asset-classes";
import { classOfSymbol, getCatalog, searchCatalog } from "@/lib/instruments/catalog";
import { getMaster } from "@/lib/instruments/master";
import { assetAllocation, betaOf, concentration, stressTest, type HoldingState } from "@/lib/portfolio/math";
import { mergeLot } from "@/lib/repo/portfolios";

const h = (o: Partial<HoldingState> & { symbol: string }): HoldingState => ({ name: o.symbol, sector: "IT", quantity: 10, avgPrice: 100, buyDate: null, price: 100, prevClose: 100, beta: 1, health: null, ...o });

describe("AMFI NAV file", () => {
  const NEW = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

PPFAS Mutual Fund

122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth Option;88.2569;01-Oct-2026
153964;-;INF879O01308;Parag Parikh Flexi Cap Fund;Direct Plan;Monthly IDCW Payout;N.A.;01-Oct-2026
`;
  const OLD = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Debt Scheme - Liquid Fund)

HDFC Mutual Fund

119091;INF179KB1HK0;-;HDFC Liquid Fund - Growth Option - Direct Plan;5012.3456;30-Sep-2026
`;
  it("reads code, ISINs, category, fund house, NAV and date under the right headings", () => {
    const [f, ...rest] = parseAmfi(NEW);
    expect(rest).toEqual([]); // a scheme without a NAV ("N.A.") is skipped
    expect(f).toEqual({ code: "122639", isin: "INF879O01027", isin2: null, name: "Parag Parikh Flexi Cap Fund - Direct - Growth", category: "Equity Scheme - Flexi Cap Fund", amc: "PPFAS Mutual Fund", nav: 88.2569, date: "2026-10-01" });
  });
  it("also reads the older layout without Plan and Option columns", () => {
    const [f] = parseAmfi(OLD);
    expect(f).toMatchObject({ code: "119091", name: "HDFC Liquid Fund - Growth Option - Direct Plan", nav: 5012.3456, date: "2026-09-30", category: "Debt Scheme - Liquid Fund" });
  });
});

describe("the catalogue: one search across every asset class", () => {
  it("holds stocks, ETFs, mutual funds, trusts and gold", () => {
    const classes = new Set(getCatalog().items.map((i) => i.assetClass));
    expect([...classes].sort()).toEqual(["etf", "gold", "mf", "reit", "stock"]);
    expect(getCatalog().items.length).toBeGreaterThan(8000);
  });
  it("finds a stock by symbol, a fund by name and by ISIN, and gold by the word", () => {
    expect(searchCatalog("INFY")[0]).toMatchObject({ symbol: "INFY.NS", assetClass: "stock" });
    const fund = searchCatalog("parag parikh flexi cap")[0];
    expect(fund.assetClass).toBe("mf");
    expect(fund.name).toMatch(/Direct - Growth/); // the variant most people own comes first
    expect(searchCatalog(fund.isin!)[0].symbol).toBe(fund.symbol);
    expect(searchCatalog("gold")[0]).toMatchObject({ assetClass: "gold" });
    expect(searchCatalog("nifty bees").some((r) => r.symbol === "NIFTYBEES.NS" && r.assetClass === "etf")).toBe(true);
  });
  it("can be narrowed to one class, and mixes classes otherwise", () => {
    expect(searchCatalog("hdfc", { classes: ["mf"] }).every((r) => r.assetClass === "mf")).toBe(true);
    expect(new Set(searchCatalog("hdfc").map((r) => r.assetClass)).size).toBeGreaterThan(1);
    expect(searchCatalog("h")).toEqual([]);
  });
  it("knows a symbol's class, and uses the quote that is live for trusts", () => {
    expect(classOfSymbol("MF:122639")).toBe("mf");
    expect(classOfSymbol("CMD:GOLD24")).toBe("gold");
    expect(classOfSymbol("NIFTYBEES.NS")).toBe("etf");
    expect(classOfSymbol("INFY.NS")).toBe("stock");
    expect(classOfSymbol("MANUAL:ABC")).toBeNull();
    const embassy = searchCatalog("embassy office parks")[0];
    expect(embassy).toMatchObject({ assetClass: "reit", symbol: "EMBASSY.BO" });
    expect(classOfSymbol(embassy.symbol)).toBe("reit");
  });
  it("broker files resolve ETFs and trusts by ISIN, like stocks", () => {
    expect(resolveLocal(getMaster(), { rawName: "NIPPON INDIA ETF NIFTY BEES", isin: "INF204KB14I2" })).toMatchObject({ status: "matched", symbol: "NIFTYBEES.NS", via: "isin" });
    expect(resolveLocal(getMaster(), { rawName: "EMBASSY", symbol: "EMBASSY" })).toMatchObject({ status: "matched", symbol: "EMBASSY.BO" });
  });
});

describe("manual assets grow at the rate the user gave", () => {
  const d = { value: 100_000, valueAsOf: "2025-10-01", ratePct: 8 };
  it("a deposit compounds quarterly, everything else yearly", () => {
    expect(manualValue("fd", d, 100_000, "2026-10-01")).toBeCloseTo(100_000 * 1.02 ** 4, -2); // a year here is 365 of 365.25 days
    expect(manualValue("ppf", d, 100_000, "2026-10-01")).toBeCloseTo(108_000, -2);
  });
  it("stops at maturity, and never moves without a rate", () => {
    expect(manualValue("fd", { ...d, maturityDate: "2026-04-01" }, 100_000, "2030-01-01")).toBeCloseTo(manualValue("fd", d, 100_000, "2026-04-01"), 2);
    expect(manualValue("property", { value: 9_000_000, valueAsOf: "2020-01-01" }, 6_000_000, "2026-10-01")).toBe(9_000_000);
    expect(manualValue("cash", null, 5_000, "2026-10-01")).toBe(5_000);
    expect(manualValue("fd", d, 100_000, "2025-01-01")).toBe(100_000); // before the value date
  });
});

describe("buying more of something already held", () => {
  it("adds the units and weights the average price by units", () => {
    expect(mergeLot({ quantity: 10, avgPrice: 100, buyDate: "2024-05-01" }, { quantity: 30, avgPrice: 200, buyDate: "2025-01-01" })).toEqual({ quantity: 40, avgPrice: 175, buyDate: "2024-05-01" });
    expect(mergeLot({ quantity: 1, avgPrice: 50, buyDate: null }, { quantity: 1, avgPrice: 70 }).buyDate).toBeNull();
  });
});

describe("risk maths across asset classes", () => {
  it("deposits and property don't move with the market; funds use their measured beta", () => {
    expect(betaOf({ beta: null, assetClass: "fd" })).toBe(0);
    expect(betaOf({ beta: 0.05, assetClass: "mf" })).toBe(0.05); // a debt fund is not pulled towards 1
    expect(betaOf({ beta: null, assetClass: "mf" })).toBe(1);
    expect(betaOf({ beta: null, assetClass: "gold" })).toBe(0);
    expect(betaOf({ beta: 1.5 })).toBeCloseTo(0.67 * 1.5 + 0.33); // stocks keep the Blume adjustment
    const s = stressTest([h({ symbol: "A", quantity: 10, price: 100 }), h({ symbol: "MANUAL:1", assetClass: "fd", quantity: 1, price: 9000, prevClose: 9000, beta: null })], -0.1);
    expect(s.loss).toBeCloseTo(-100);
    expect(s.unknownBeta).toEqual([]);
  });
  it("allocation groups by asset type", () => {
    const a = assetAllocation([h({ symbol: "A" }), h({ symbol: "B" }), h({ symbol: "MF:1", assetClass: "mf", quantity: 20 }), h({ symbol: "MANUAL:1", assetClass: "ppf", quantity: 1, price: 1000 }), h({ symbol: "MANUAL:2", assetClass: "epf", quantity: 1, price: 1000 })]);
    expect(a.map((x) => [x.group, x.count, x.value])).toEqual([["Stocks", 2, 2000], ["Mutual funds", 1, 2000], ["Retirement", 2, 2000]]);
    expect(a.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
  });
  it("a large fund, deposit or house is not flagged as single-company concentration", () => {
    const c = concentration([h({ symbol: "A", quantity: 1 }), h({ symbol: "MF:1", assetClass: "mf", sector: "Mutual funds", quantity: 40 }), h({ symbol: "MANUAL:1", assetClass: "property", sector: "Property", quantity: 1, price: 5900 })]);
    expect(c.flags.filter((f) => f.kind !== "top3")).toEqual([]);
    expect(concentration([h({ symbol: "A", quantity: 9 }), h({ symbol: "B", sector: "Banks", quantity: 1 })]).flags.some((f) => f.kind === "stock" && f.label === "A")).toBe(true);
  });
});
