import "server-only";
import { z } from "zod";
import { isTransient } from "@/lib/data/resilience";

/** One ticker. 20 characters: NSE symbols with their suffix run past 12 (BAJAJ-AUTO.NS, HINDUNILVR.NS). */
export const symbol = z
  .string()
  .min(1)
  .max(20)
  .describe("Ticker symbol, e.g. RELIANCE.NS, TCS.NS, AAPL, ^NSEI")
  // Mutual funds, gold and assets entered by hand are priced by Nazar from other sources. Asking
  // Yahoo for them only fails, so say why here, before the lookup, in words the model can act on.
  .refine((s) => !/^(MF|CMD|MANUAL):/i.test(s.trim()), { message: "This is a mutual fund, gold or manually entered asset. It has no market ticker, so the market-data tools cannot look it up. Its value, change and history are in getMyPortfolio and getPortfolioPerformance." });

/**
 * Runs a tool's data fetch and turns provider failures into a short, user-safe error object
 * instead of throwing. Raw provider output (HTML pages, stack traces) never reaches the user.
 */
export async function safe<T>(fn: () => Promise<T>, what: "data" | "analysis" = "data"): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.warn(`[ask] ${what} error:`, msg.slice(0, 300));
    if (/Not Found|No fundamentals|Quote not found|delisted|No data/i.test(msg)) return { error: what === "analysis" ? "Symbol not found or not enough data for this analysis." : "Symbol not found or no data available." };
    if (isTransient(e)) return { error: "Yahoo Finance is rate-limiting or temporarily unavailable. Try again in a minute." };
    const lead = what === "analysis" ? "This analysis couldn't be completed" : "The data provider returned an unexpected response";
    return { error: `${lead}${/<|\{/.test(msg) ? "" : `: ${msg.slice(0, 120)}`}.` };
  }
}

/**
 * What the MODEL sees of a tool result. The UI still receives the full output (every chart point),
 * but the model gets a compact summary: bulky arrays re-sent on every agent step were the main
 * driver of input tokens (and therefore cost and latency). Errors pass through unchanged, and so
 * does a result that history compaction has already cut down: it no longer has the tool's shape.
 */
export const forModel = (fn: (o: any) => unknown) => ({ output: o }: { output: any }) => {
  if (o && typeof o === "object" && ("error" in o || o.truncated === true)) return { type: "json" as const, value: o as any };
  const view = fn(o) as any;
  // A result in rupees gets its large amounts in words too, unless the tool has already done that its own way.
  return { type: "json" as const, value: o?.currency === "INR" && view && typeof view === "object" && !("largeFiguresInWords" in view) ? withRupeeWords(view) : view };
};

/** Keys whose large numbers are counts, not money. */
const NOT_MONEY = /volume|shares|float|count|units|quantity|employees|timestamp|date/i;

/**
 * Adds "<key>InWords" beside every rupee amount of a crore or more in a model view.
 *
 * A model asked to turn 33688000000 into crores gets it wrong by a factor of ten often enough to
 * matter: it has written a ₹3.53 lakh crore market cap as ₹35.30 lakh crore, and a quarter's
 * ₹3,369 crore profit as ₹33,688 crore. So the conversion is done here, and the prompt says to
 * quote the words. Bounded, so a long table of figures does not double in size.
 */
export function withRupeeWords<T>(view: T, budget = { left: 60 }): T {
  if (Array.isArray(view)) return view.map((x) => withRupeeWords(x, budget)) as T;
  if (!view || typeof view !== "object") return view;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(view as Record<string, unknown>)) {
    out[k] = v && typeof v === "object" ? withRupeeWords(v, budget) : v;
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 1e7 && budget.left > 0 && !NOT_MONEY.test(k)) {
      out[`${k}InWords`] = rupeesInWords(v);
      budget.left--;
    }
  }
  return out as T;
}

/** A large rupee amount as people in India say it: "₹3.53 lakh crore", "₹41,764 crore", "₹12.5 lakh". */
export function rupeesInWords(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}₹${(a / 1e12).toFixed(2)} lakh crore`;
  if (a >= 1e7) return `${sign}₹${Math.round(a / 1e7).toLocaleString("en-IN")} crore`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} lakh`;
  return `${sign}₹${Math.round(a).toLocaleString("en-IN")}`;
}
