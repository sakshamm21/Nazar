import type { AlertType, Sensitivity } from "@/lib/db/schema";

/** Sensitivity presets (docs/FEATURES.md, H1). Moves and weights are in percent. */
export const PRESETS: Record<Sensitivity, { stock_move: number; materiality: number; portfolio_move: number; concentration: number; sectorConcentration: number; fScoreDelta: number | null; upcoming: boolean }> = {
  major: { stock_move: 6, materiality: 0.005, portfolio_move: 3, concentration: 30, sectorConcentration: 50, fScoreDelta: null, upcoming: false },
  balanced: { stock_move: 4, materiality: 0.0025, portfolio_move: 2, concentration: 25, sectorConcentration: 40, fScoreDelta: 2, upcoming: true },
  everything: { stock_move: 2.5, materiality: 0, portfolio_move: 1, concentration: 20, sectorConcentration: 35, fScoreDelta: 1, upcoming: true },
};

/** H5 ladders: the steps a learned threshold can move up through. */
export const LADDERS: Partial<Record<AlertType, number[]>> = {
  stock_move: [2.5, 4, 5, 7, 10],
  portfolio_move: [1, 2, 3, 4, 5],
  concentration: [20, 25, 30, 35, 40],
};

export const MAGNITUDE_TYPES = new Set<AlertType>(["stock_move", "portfolio_move", "concentration"]);
export const MUTABLE_TYPES = new Set<AlertType>(["results_upcoming"]);

export type UserThresholds = Partial<Record<AlertType, { value: number | null; muted: boolean }>>;

export type EffectiveSettings = ReturnType<typeof effectiveSettings>;

/** Preset for the chosen sensitivity, raised by any learned (H5) thresholds; never lowered. */
export function effectiveSettings(sensitivity: Sensitivity, tuned: UserThresholds = {}) {
  const p = PRESETS[sensitivity];
  const up = (type: "stock_move" | "portfolio_move" | "concentration", preset: number) => Math.max(preset, tuned[type]?.value ?? 0);
  return {
    sensitivity,
    stockMove: up("stock_move", p.stock_move),
    materiality: p.materiality,
    portfolioMove: up("portfolio_move", p.portfolio_move),
    concentration: up("concentration", p.concentration),
    sectorConcentration: p.sectorConcentration,
    fScoreDelta: p.fScoreDelta,
    upcoming: p.upcoming && !tuned.results_upcoming?.muted,
    muted: new Set<AlertType>(Object.entries(tuned).filter(([, v]) => v?.muted).map(([k]) => k as AlertType)),
  };
}
