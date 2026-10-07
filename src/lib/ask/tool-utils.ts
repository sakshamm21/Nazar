import "server-only";
import { z } from "zod";
import { isTransient } from "@/lib/data/resilience";

/** One ticker. 20 characters: NSE symbols with their suffix run past 12 (BAJAJ-AUTO.NS, HINDUNILVR.NS). */
export const symbol = z.string().min(1).max(20).describe("Ticker symbol, e.g. RELIANCE.NS, TCS.NS, AAPL, ^NSEI");

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
 * driver of input tokens (and therefore cost and latency). Errors pass through unchanged.
 */
export const forModel = (fn: (o: any) => unknown) => (o: any) => ({ type: "json" as const, value: (o && typeof o === "object" && "error" in o ? o : fn(o)) as any });
