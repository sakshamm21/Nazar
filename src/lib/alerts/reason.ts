import type { AssetClass } from "@/lib/instruments/asset-classes";
import { betaOf } from "@/lib/portfolio/math";

/**
 * H1 "likely reason" for a big move: deterministic and explainable:
 * 1. market:  the Nifty moved ≥1% the same way and beta × Nifty explains at least ~2/3 of the stock's
 *             move (what is left over is under 35% of it)
 * 2. sector:  its Nifty sector index moved the same way by ≥60% of the stock's move
 * 3. results: quarterly results came out in the last 2 trading days
 * 4. company: otherwise — the move is mostly about the company itself
 * Anything that isn't a company (a fund, an ETF, gold, a US stock, crypto) has no sector index or
 * results here: it is either "market" by the same test, or "asset" (its own market moved).
 * All returns are fractions (−0.072 = −7.2%).
 */
/** Largest leftover (as a share of the move) for a move to still count as "the whole market". */
const MARKET_RESIDUAL = 0.35;

export type ReasonKind = "market" | "sector" | "results" | "company" | "asset";

export function classifyReason(input: { stockPct: number; niftyPct: number | null; sectorPct: number | null; beta: number | null; recentResults: boolean; assetClass?: AssetClass }): ReasonKind {
  const { stockPct: r, niftyPct: m, sectorPct: s } = input;
  const b = betaOf({ beta: input.beta, assetClass: input.assetClass });
  if (m != null && Math.abs(m) >= 0.01 && Math.sign(m) === Math.sign(r) && Math.abs(r - b * m) < MARKET_RESIDUAL * Math.abs(r)) return "market";
  if ((input.assetClass ?? "stock") !== "stock") return "asset";
  if (s != null && Math.sign(s) === Math.sign(r) && Math.abs(s) >= 0.6 * Math.abs(r)) return "sector";
  if (input.recentResults) return "results";
  return "company";
}
