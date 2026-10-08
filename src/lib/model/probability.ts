/**
 * Weight given to the raw model; the rest comes from the de-vigged market.
 * Fitted on 46 finished fixtures (Oct 2026): market log-loss 0.880, raw model
 * 1.440, best blend at ~0.05. The third-party draw probability averaged 45%
 * against a 30% realised rate, so the raw model carries almost no signal.
 * Re-fit as the settled sample grows.
 */
export const MODEL_WEIGHT = 0.05;
/** Edges above this on a single selection are treated as model/data error. */
export const EDGE_CAP_PCT = 40;
/** Tips generated before this instant used raw (unshrunk) model probabilities. */
export const MODEL_V2_CUTOFF = "2026-10-08T21:00:00Z";

export type Confidence = "high" | "medium" | "low";

/** Remove the bookmaker margin: normalise implied probabilities to sum to 1. */
export function noVigProbs(odds: number[]): number[] | null {
  if (odds.length < 2 || odds.some((odd) => !Number.isFinite(odd) || odd <= 1)) return null;
  const implied = odds.map((odd) => 1 / odd);
  const total = implied.reduce((sum, value) => sum + value, 0);
  return implied.map((value) => value / total);
}

/** Blend the model with the market so thin models cannot invent huge edges. */
export function shrinkProb(model: number, market: number, weight = MODEL_WEIGHT): number {
  return weight * model + (1 - weight) * market;
}

export function edgePct(prob: number, odds: number): number {
  return (odds * prob - 1) * 100;
}

/**
 * How much to trust a published edge: needs a meaningful edge and a model
 * that does not wildly disagree with the market it was shrunk towards.
 */
export function confidenceFor(edge: number, modelProb: number, marketProb: number | null): Confidence {
  const gap = marketProb == null ? 0.2 : Math.abs(modelProb - marketProb);
  if (edge >= 10 && gap <= 0.1) return "high";
  if (edge >= 7.5 && gap <= 0.2) return "medium";
  return "low";
}

export function isPlausibleEdge(edge: number): boolean {
  return edge <= EDGE_CAP_PCT;
}
