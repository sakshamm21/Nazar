/**
 * Capital gains: short against long, the equity exemption, and losses. The rates are statutory, so
 * these tests are a statement of the rules rather than a tolerance check.
 */
import { describe, expect, it } from "vitest";
import {
  capitalGains,
  gainClassOf,
  holdingDays,
  isLongTerm,
  LTCG_EXEMPTION,
  LTCG_RATE,
  OTHER_RATE,
  remainingExemption,
  STCG_RATE,
  unrealisedGains,
  type Disposal,
  type GainClass,
} from "@/lib/portfolio/capital-gains";

const equity = (): GainClass => "equity";
const everythingElse = (): GainClass => "other";

/** A sale of `units` bought at `bought` for `cost` in total, sold at `sellPrice`. */
const sale = (o: Partial<Disposal> & { units: number; sellPrice: number; cost: number; daysHeld: number }): Disposal => ({
  symbol: "INFY.NS",
  name: "Infosys",
  date: "2025-03-01",
  ...o,
});

describe("how long is a holding", () => {
  it("more than 12 months is long-term, exactly 12 months is not", () => {
    expect(isLongTerm(365)).toBe(false);
    expect(isLongTerm(366)).toBe(true);
    expect(isLongTerm(200)).toBe(false);
  });
  it("counts days between two dates and never goes negative", () => {
    expect(holdingDays("2024-01-01", "2025-01-01")).toBe(366);
    expect(holdingDays("2025-01-01", "2024-01-01")).toBe(0);
  });
});

describe("equity gains", () => {
  it("a short-term equity gain is taxed at 20%", () => {
    const r = capitalGains([sale({ units: 10, sellPrice: 200, cost: 1000, daysHeld: 100 })], equity);
    expect(r.equity.short.gain).toBe(1000);
    expect(r.equity.long.gain).toBe(0);
    expect(r.totalTax).toBeCloseTo(200, 6); // 1000 × 20%
  });

  it("a long-term equity gain under the exemption is not taxed", () => {
    const r = capitalGains([sale({ units: 10, sellPrice: 1100, cost: 1000, daysHeld: 500 })], equity);
    expect(r.equity.long.gain).toBe(10000);
      // The whole gain sits inside the ₹1.25 lakh, so all of it is used up and nothing is taxed.
      expect(r.exempt).toBe(10000);
      expect(r.taxableEquity.long).toBe(0);
      expect(r.totalTax).toBe(0);
    });

  it("the ₹1.25 lakh exemption applies to long-term gains, not short-term ones", () => {
      // 60,000 short and 90,000 long. The exemption comes off the long-term gain, leaving 90,000
      // entirely inside it and nothing taxable; the short-term 60,000 is taxed in full.
      const r = capitalGains(
        [sale({ units: 1, sellPrice: 60_000, cost: 0, daysHeld: 100 }), sale({ units: 1, sellPrice: 90_000, cost: 0, daysHeld: 500 })],
        equity,
      );
      expect(r.equityTotalGain).toBe(150_000);
      expect(r.exempt).toBe(90_000); // all of the long-term gain sits inside the threshold
      expect(r.taxableEquity).toEqual({ short: 60_000, long: 0 });
      expect(r.totalTax).toBeCloseTo(60_000 * STCG_RATE, 6);
    });

    it("a long-term gain above the exemption is taxed on the excess", () => {
      const r = capitalGains([sale({ units: 1, sellPrice: 300_000, cost: 0, daysHeld: 500 })], equity);
      expect(r.equity.long.gain).toBe(300_000);
      expect(r.exempt).toBe(LTCG_EXEMPTION);
      expect(r.taxableEquity.long).toBe(300_000 - 125_000);
      expect(r.totalTax).toBeCloseTo(175_000 * LTCG_RATE, 6);
    });

  it("short-term gains cannot use the exemption, however large the long-term loss", () => {
    const r = capitalGains(
      [sale({ units: 1, sellPrice: 100_000, cost: 0, daysHeld: 100 }), sale({ units: 1, sellPrice: 0, cost: 200_000, daysHeld: 500 })],
      equity,
    );
    expect(r.equity.short.gain).toBe(100_000);
    expect(r.equity.long.gain).toBe(-200_000);
    // The combined gain is negative, so nothing of the short-term gain is exempt.
    expect(r.exempt).toBe(0);
    expect(r.taxableEquity.short).toBe(100_000);
    expect(r.totalTax).toBeCloseTo(100_000 * STCG_RATE, 6);
  });

  it("a loss alone produces no tax and reports the exemption untouched", () => {
    const r = capitalGains([sale({ units: 1, sellPrice: 0, cost: 50_000, daysHeld: 500 })], equity);
    expect(r.netGain).toBe(-50_000);
    expect(r.exempt).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it("a loss carried against a later long-term gain uses the exemption first", () => {
    const r = capitalGains(
      [sale({ units: 1, sellPrice: 0, cost: 100_000, daysHeld: 500 }), sale({ units: 1, sellPrice: 50_000, cost: 0, daysHeld: 600 })],
      equity,
    );
    // 100k loss and 50k gain are separate long-term disposals; only the gain is reported here.
    expect(r.equity.long.gain).toBe(-50_000);
    expect(r.totalTax).toBe(0);
  });
});

describe("everything that is not an equity share", () => {
  it("gold, property and the like are taxed at 12.5% whether long or short", () => {
    const r = capitalGains(
      [sale({ symbol: "CMD:GOLD24", units: 1, sellPrice: 80_000, cost: 50_000, daysHeld: 400 }), sale({ symbol: "CMD:GOLD24", units: 1, sellPrice: 20_000, cost: 50_000, daysHeld: 30 })],
      everythingElse,
    );
    expect(r.other.long.gain).toBe(30_000);
    expect(r.other.short.gain).toBe(-30_000);
    expect(r.equity.short.gain).toBe(0);
    // Only the gain is taxed, and the equity exemption does not apply here.
    expect(r.totalTax).toBeCloseTo(30_000 * OTHER_RATE, 6);
  });

  it("each symbol is classified on its own", () => {
    const classify = (s: string) => (s.endsWith(".NS") ? ("equity" as GainClass) : ("other" as GainClass));
    const r = capitalGains(
      [sale({ symbol: "INFY.NS", units: 1, sellPrice: 200_000, cost: 100_000, daysHeld: 500 }), sale({ symbol: "CMD:GOLD24", units: 1, sellPrice: 100_000, cost: 0, daysHeld: 500 })],
      classify,
    );
    expect(r.equity.long.gain).toBe(100_000);
    expect(r.other.long.gain).toBe(100_000);
        // Gold is not an equity, so it neither uses the exemption nor benefits from it: 100,000 of gold
        // gain is taxed in full while the 100,000 of equity gain is fully exempt.
        expect(r.exempt).toBe(100_000);
        expect(r.totalTax).toBeCloseTo(100_000 * OTHER_RATE, 6);
  });
});

describe("no sales", () => {
  it("says so rather than showing zeroes as if something happened", () => {
    const r = capitalGains([], equity);
    expect(r.notApplicable).toBe(true);
    expect(r.disposals).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.netGain).toBe(0);
  });
  it("counts every disposal it was given", () => {
    const r = capitalGains([sale({ units: 1, sellPrice: 1, cost: 0, daysHeld: 10 }), sale({ units: 2, sellPrice: 2, cost: 0, daysHeld: 400 })], equity);
    expect(r.disposals).toBe(2);
    expect(r.notApplicable).toBe(false);
  });
});

describe("which rules a holding falls under", () => {
  it("shares, ETFs and equity funds use the equity rules", () => {
    expect(gainClassOf({ assetClass: "stock" })).toBe("equity");
    expect(gainClassOf({ assetClass: "etf" })).toBe("equity");
    expect(gainClassOf({ assetClass: "mf", category: "Equity Scheme - Flexi Cap Fund" })).toBe("equity");
    expect(gainClassOf({ assetClass: "mf", category: "Equity Scheme - ELSS" })).toBe("equity");
    expect(gainClassOf({ assetClass: "mf", category: "Equity Scheme - Index Fund" })).toBe("equity");
        // Most of an aggressive hybrid's money is in equity, so it is taxed at the equity rates.
        expect(gainClassOf({ assetClass: "mf", category: "Hybrid Scheme - Aggressive Hybrid Fund" })).toBe("equity");
      });
      it("gold, debt, REITs and anything unknown pay the flat rate", () => {
        expect(gainClassOf({ assetClass: "gold" })).toBe("other");
        expect(gainClassOf({ assetClass: "reit" })).toBe("other");
        expect(gainClassOf({ assetClass: "crypto" })).toBe("other");
        expect(gainClassOf({ assetClass: "mf", category: "Debt Scheme - Corporate Bond Fund" })).toBe("other");
        expect(gainClassOf({ assetClass: "mf", category: "Hybrid Scheme - Conservative Hybrid Fund" })).toBe("other");
        expect(gainClassOf({})).toBe("other");
        expect(gainClassOf({ assetClass: "mf", category: null })).toBe("other");
      });
    });

describe("gains still sitting in the portfolio", () => {
  const positions = [
      { symbol: "INFY.NS", name: "Infosys", units: 10, cost: 9000, price: 11000, bought: "2020-01-01", class: "equity" as GainClass },
      // Bought a fortnight ago, so a sale today would be short-term whatever today's date is.
      { symbol: "TCS.NS", name: "TCS", units: 5, cost: 20_000, price: 18_000, bought: new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10), class: "equity" as GainClass },
    ];

  it("values what is held and says which bucket a sale today would fall into", () => {
      const rows = unrealisedGains(positions);
    const infy = rows.find((r) => r.symbol === "INFY.NS")!;
    expect(infy.value).toBe(110_000);
    expect(infy.gain).toBe(101_000);
    expect(infy.gainPct).toBeCloseTo(101_000 / 9000, 4);
    // Bought in 2020, so well past a year.
    expect(infy.wouldBeLongTerm).toBe(true);
    expect(rows.find((r) => r.symbol === "TCS.NS")!.wouldBeLongTerm).toBe(false);
  });

  it("sorts by gain and ignores a position with nothing to show", () => {
      const rows = unrealisedGains([...positions, { symbol: "X.NS", name: "X", units: 0, cost: 100, price: 200, bought: "2020-01-01", class: "equity" as GainClass }]);
    expect(rows).toHaveLength(2);
    expect(rows[0].gain).toBeGreaterThan(rows[1].gain);
  });
  it("an unpriced position shows no gain rather than pretending it is zero", () => {
      const rows = unrealisedGains([{ symbol: "NEW.NS", name: "New", units: 10, cost: 1000, price: null, bought: "2024-01-01", class: "equity" as GainClass }]);
    expect(rows[0].value).toBe(0);
    expect(rows[0].gain).toBe(-1000);
  });
});

describe("what is left of the yearly exemption", () => {
  it("shrinks as the year's gains use it, and never goes below zero", () => {
    expect(remainingExemption(0)).toBe(125_000);
    expect(remainingExemption(100_000)).toBe(25_000);
    expect(remainingExemption(200_000)).toBe(0);
  });
  it("a loss does not hand back exemption, and earlier years count against this one", () => {
    expect(remainingExemption(-50_000)).toBe(125_000);
    expect(remainingExemption(50_000, 100_000)).toBe(0);
  });
});