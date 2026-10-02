import { adjustedBeta } from "@/lib/portfolio/math";

/**
 * H1 "likely reason" for a big move — deterministic and explainable (PLAN.md §5):
 * 1. market:  the Nifty moved ≥1% the same way and the stock moved about as much as its beta implies
 * 2. sector:  its Nifty sector index moved the same way by ≥60% of the stock's move
 * 3. results: quarterly results came out in the last 2 trading days
 * 4. company: otherwise — the move is mostly about the company itself
 * All returns are fractions (−0.072 = −7.2%).
 */
export type ReasonKind = "market" | "sector" | "results" | "company";

export function classifyReason(input: { stockPct: number; niftyPct: number | null; sectorPct: number | null; beta: number | null; recentResults: boolean }): ReasonKind {
  const { stockPct: r, niftyPct: m, sectorPct: s } = input;
  const b = adjustedBeta(input.beta);
  if (m != null && Math.abs(m) >= 0.01 && Math.sign(m) === Math.sign(r) && Math.abs(r - b * m) < 0.5 * Math.abs(r)) return "market";
  if (s != null && Math.sign(s) === Math.sign(r) && Math.abs(s) >= 0.6 * Math.abs(r)) return "sector";
  if (input.recentResults) return "results";
  return "company";
}
