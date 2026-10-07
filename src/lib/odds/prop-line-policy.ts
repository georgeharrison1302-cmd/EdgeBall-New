export type PropLineMarket = "cards" | "sot" | "fouls" | "goals" | "other";

const FOUL_LINES = new Set([1, 2, 3]);
const SHOT_LINES = new Set([1, 2, 3]);
const SOT_LINES = new Set([1, 2]);

/**
 * Bet365's stored player values carry integer clear-lines: 1 => Over 0.5,
 * 2 => Over 1.5, etc. Keep only the lines users can realistically find in
 * the standard player-prop coupon; reject race/outright and exotic ladders.
 */
export function isSupportedPlayerPropLine(
  market: PropLineMarket,
  marketLabel: string,
  clearLine: number | null,
): boolean {
  if (market === "cards" || market === "goals") return clearLine == null;
  if (clearLine == null || !Number.isInteger(clearLine)) return false;
  if (market === "fouls") return FOUL_LINES.has(clearLine);
  if (market === "sot") {
    return /total shots/i.test(marketLabel) ? SHOT_LINES.has(clearLine) : SOT_LINES.has(clearLine);
  }
  return false;
}

export function hasActivePropModel(modelProb: number | null | undefined): modelProb is number {
  return modelProb != null && Number.isFinite(modelProb) && modelProb > 0 && modelProb < 1;
}
