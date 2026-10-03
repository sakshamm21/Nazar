/**
 * H5 — alerts that learn. Rule-based and explainable on purpose (docs/DECISIONS.md D-5):
 *
 * Magnitude types (stock_move, portfolio_move, concentration): look at the user's last 10 rated
 * alerts of that type (90 days, only those rated since the last change). Find ladder steps T above
 * the current threshold where
 *   - alerts BELOW T were rated useful ≤ 40% of the time (at least 3 ratings), and
 *   - alerts AT/ABOVE T were rated useful ≥ 60% (or there are fewer than 2 to judge).
 * Pick the step that best separates useful from not-useful alerts (useful rate above minus useful
 * rate below; ties → the smallest step). Raise to it.
 *
 * Non-magnitude type (results_upcoming): ≥ 4 ratings and ≤ 25% useful → mute (still in the weekly report).
 *
 * Guardrails: only ever raises (never lowers automatically), 14-day cooldown between changes,
 * a frozen period after the user presses Undo.
 */
import type { AlertType, TuningEvidence } from "@/lib/db/schema";
import { LADDERS, MAGNITUDE_TYPES, MUTABLE_TYPES } from "./thresholds";

export type Rated = { magnitude: number | null; useful: boolean; createdAt: Date };

export type TuneInput = {
  type: AlertType;
  current: number;
  ratings: Rated[];
  lastChangeAt: Date | null;
  frozenUntil: Date | null;
  now: Date;
};

export type TuneDecision = { type: AlertType; oldValue: number | null; newValue: number | null; muted: boolean; evidence: TuningEvidence };

const WINDOW = 10;
const COOLDOWN_DAYS = 14;
const LOOKBACK_DAYS = 90;

export function tune(input: TuneInput): TuneDecision | null {
  const { now } = input;
  if (input.frozenUntil && input.frozenUntil > now) return null;
  if (input.lastChangeAt && now.getTime() - input.lastChangeAt.getTime() < COOLDOWN_DAYS * 86400000) return null;
  const since = Math.max(now.getTime() - LOOKBACK_DAYS * 86400000, input.lastChangeAt?.getTime() ?? 0);
  const recent = input.ratings
    .filter((r) => r.createdAt.getTime() >= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, WINDOW);

  if (MUTABLE_TYPES.has(input.type)) {
    const useful = recent.filter((r) => r.useful).length;
    if (recent.length >= 4 && useful / recent.length <= 0.25)
      return { type: input.type, oldValue: null, newValue: null, muted: true, evidence: { below: { useful, total: recent.length }, above: { useful: 0, total: 0 }, window: recent.length } };
    return null;
  }

  if (!MAGNITUDE_TYPES.has(input.type)) return null;
  const ladder = LADDERS[input.type] ?? [];
  const rated = recent.filter((r) => r.magnitude != null);
  let best: { t: number; score: number; evidence: TuningEvidence } | null = null;
  for (const t of ladder) {
    if (t <= input.current) continue;
    const below = rated.filter((r) => r.magnitude! < t);
    const above = rated.filter((r) => r.magnitude! >= t);
    const bu = below.filter((r) => r.useful).length, au = above.filter((r) => r.useful).length;
    if (below.length < 3 || bu / below.length > 0.4) continue;
    if (above.length >= 2 && au / above.length < 0.6) continue;
    // Separation: how much more useful alerts above the step are than those below it
    // (with too few alerts above to judge, assume a neutral 50%).
    const score = (above.length >= 2 ? au / above.length : 0.5) - bu / below.length;
    if (!best || score > best.score + 1e-9) best = { t, score, evidence: { below: { useful: bu, total: below.length }, above: { useful: au, total: above.length }, window: rated.length } };
  }
  if (!best) return null;
  return { type: input.type, oldValue: input.current, newValue: best.t, muted: false, evidence: best.evidence };
}
