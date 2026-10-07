/**
 * Stats kit — shared betting primitives (A* sportsbook language).
 *
 * Usage
 * -----
 * OddsPill      — priced CTA (`@2.40`) or "No Book Odds". Pass onClick to add-to-slip.
 * EdgeChip      — only when modelProb + odds > 1 and edge > 0 (fill: --neon-edge).
 * PoissonVsBook — Model % vs Implied Book + EdgeChip sibling.
 * AddToSlipButton — OddsPill wired to BetSlipProvider (or onAdd override).
 * HitRateStrip  — Last-N from fixture_player_statistics; empty → "No match logs stored".
 * LastFiveStatStrip — Statz-style hit% + avg + numbered green/red boxes (partial OK).
 * FormDots / HitRateBar — Prop Desk table form + hit-rate bar.
 * FormStrip     — Emerald/slate last-N outcomes ("Over in 4 of last 5").
 * SeasonProofBadges — fouls/90, yellows, SOT/90 from player_season_stats join.
 * MatchupClashBadge / StrictRefBadge — secondary proof with market CTA copy.
 * MarketAccordion — collapse empty markets; do not render empty sections.
 * AngleFilters  — Hot / Ref trap / SOT overdue / Value Edges (hide empty).
 *
 * Tokens: var(--cobalt), var(--neon), var(--neon-edge), var(--ink), var(--muted), var(--line).
 * Types: see ./types.ts (Database Rows where generated; SeasonProof for live season join).
 */

export { AddToSlipButton } from "./AddToSlipButton";
export {
  LabeledTh,
  SortableTh,
  STAT_GLOSSARY,
  useColumnSort,
} from "./SortableStatHeader";
export {
  ANGLE_FILTERS,
  AngleFilters,
  angleAvailability,
  hasValueEdge,
  hotStreak,
  matchesAngle,
  sotOverdue,
  type AngleFields,
  type AngleFilter,
} from "./AngleFilters";
export { BetSlipProvider, useBetSlip, type BetSlipSelection } from "./BetSlipContext";
export { CardMeter } from "./CardMeter";
export { EdgeChip } from "./EdgeChip";
export { EmptyReason, formatEmptyReason } from "./EmptyReason";
export { GameScriptBadge, type GameScript } from "./GameScriptBadge";
export { FormStrip } from "./FormStrip";
export { FormDots } from "./FormDots";
export { HitRateBar } from "./HitRateBar";
export { HitRateStrip } from "./HitRateStrip";
export { LastFiveStatStrip } from "./LastFiveStatStrip";
export { LensPills } from "./LensPills";
export { MarketAccordion } from "./MarketAccordion";
export {
  MatchupClashBadge,
  MatchupClashBadgeFromClash,
} from "./MatchupClashBadge";
export { OddsPill } from "./OddsPill";
export { PlayerBreakdown } from "./PlayerBreakdown";
export { PoissonVsBook } from "./PoissonVsBook";
export { SeasonProofBadges } from "./SeasonProofBadges";
export { StrictRefBadge, StrictRefBadgeFromProfile } from "./StrictRefBadge";
export {
  isPriced,
  resolveEdgePct,
  type ClashProof,
  type DecimalOdds,
  type EdgePct,
  type FixturePlayerStatRow,
  type ModelProb,
  type PlayerRow,
  type PlayerSeasonStatRow,
  type PrematchOddsRow,
  type PricedLeg,
  type SeasonProof,
  type StrictRefProof,
} from "./types";
