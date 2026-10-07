/**
 * Shared betting DTOs for the stats kit.
 * Prefer generated Database table Rows when the relation exists in src/types.ts.
 * player_season_stats / prematch_odds are live PYTH tables not yet in generated types —
 * SeasonProof and PricedLeg mirror the loader shapes used by Match Hub + Prop Engine.
 */

import type { Database } from "@/types";

export type FixturePlayerStatRow =
  Database["public"]["Tables"]["fixture_player_statistics"]["Row"];
export type PlayerSeasonStatRow =
  Database["public"]["Tables"]["player_season_stats"]["Row"];
export type PrematchOddsRow = Database["public"]["Tables"]["prematch_odds"]["Row"];
export type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

/** Decimal odds from Bet365 (prematch_odds). Null / ≤1 = unpriced. */
export type DecimalOdds = number | null | undefined;

/** Model probability in 0–1 space from stored edge calc / odds payload. */
export type ModelProb = number | null | undefined;

/** Edge in percentage points (e.g. 12.4 → +12.4%). */
export type EdgePct = number | null | undefined;

/**
 * Season proof joined from player_season_stats (+ nested stats_data).
 * Primary proof until fixture_player_statistics is backfilled.
 */
export type SeasonProof = {
  appearances?: number | null;
  yellows?: number | null;
  goals?: number | null;
  foulsPer90?: number | null;
  tacklesPer90?: number | null;
  sotPer90?: number | null;
  foulsDrawnPer90?: number | null;
};

/** Priced selection inputs shared by OddsPill / AddToSlip / PoissonVsBook. */
export type PricedLeg = {
  selectionId: string | number;
  marketName: string;
  decimalOdds: DecimalOdds;
  label?: string;
  match?: string;
  player?: string;
  modelProb?: ModelProb;
  edgePct?: EdgePct;
};

export type ClashProof = {
  playerRate: number;
  opponentRate: number;
  label?: string;
} | null;

export type StrictRefProof = {
  name: string;
  avg: number;
  vsLeaguePct?: number | null;
  matches?: number;
} | null;

export function isPriced(odds: DecimalOdds): odds is number {
  return odds != null && Number.isFinite(odds) && odds > 1;
}

export function resolveEdgePct(
  modelProb: ModelProb,
  decimalOdds: DecimalOdds,
  edgePct?: EdgePct,
): number | null {
  if (!isPriced(decimalOdds) || modelProb == null || !Number.isFinite(modelProb)) {
    return null;
  }
  if (edgePct != null && Number.isFinite(edgePct)) return edgePct;
  return (decimalOdds * modelProb - 1) * 100;
}
