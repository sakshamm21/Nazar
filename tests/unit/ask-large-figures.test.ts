/**
 * Large rupee amounts reach the model in words. Left to convert a thirteen-digit figure itself, the
 * model wrote a ₹3.53 lakh crore market cap as ₹35.30 lakh crore in eight eval runs out of nine.
 */
import { describe, expect, it } from "vitest";
import { rupeesInWords } from "@/lib/ask/tool-utils";
import { makeTools } from "@/lib/ask/tools";

describe("a rupee amount in words", () => {
  it.each([
    [3530111844352, "₹3.53 lakh crore"],
    [417640000000, "₹41,764 crore"],
    [-25956000000, "−₹2,596 crore"],
    [1250000, "₹12.50 lakh"],
    [8412, "₹8,412"],
  ])("%d → %s", (n, want) => expect(rupeesInWords(n)).toBe(want));
});

describe("what the model is shown of key metrics", () => {
  const view = (output: unknown) => (makeTools("u").getKeyMetrics as unknown as { toModelOutput: (o: { output: unknown }) => { value: any } }).toModelOutput({ output }).value;
  const metrics = [
    { key: "marketCap", label: "Market cap", value: 3530111844352, format: "large" },
    { key: "averageVolume", label: "Avg volume (3M)", value: 123456789, format: "large" },
    { key: "trailingPE", label: "P/E", value: 24.1, format: "ratio" },
    { key: "revenue", label: "Revenue (TTM)", value: null, format: "large" },
  ];

  it("has each large rupee amount in words beside the raw figure, and leaves counts alone", () => {
    const v = view({ symbol: "RELIANCE.NS", name: "Reliance Industries", currency: "INR", fxNote: null, metrics });
    expect(v.metrics.marketCap).toBe(3530111844352);
    expect(v.largeFiguresInWords).toEqual({ marketCap: "₹3.53 lakh crore" });
    expect(v.note).toMatch(/as written/);
  });

  it("says nothing in rupees about a company priced in dollars", () => {
    const v = view({ symbol: "AAPL", name: "Apple", currency: "USD", fxNote: null, metrics });
    expect(v.largeFiguresInWords).toBeUndefined();
    expect(v.metrics.trailingPE).toBe(24.1);
  });
});
