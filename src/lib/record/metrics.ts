export type SettledTip = {
  at: string;
  odds: number;
  modelProb: number;
  won: boolean;
  profit: number;
};

export type CurvePoint = { at: string; cumulative: number; n: number };

export type CalibrationBin = {
  label: string;
  n: number;
  predicted: number;
  actual: number;
};

const BIN_EDGES = [0, 0.2, 0.35, 0.5, 0.65, 1.0001];

/** Cumulative flat-stake profit in settlement order. */
export function cumulativeCurve(tips: SettledTip[]): CurvePoint[] {
  const ordered = [...tips].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let total = 0;
  return ordered.map((tip, index) => {
    total += tip.profit;
    return { at: tip.at, cumulative: Number(total.toFixed(4)), n: index + 1 };
  });
}

/** Group by model probability and compare stated vs realised win rate. */
export function calibrationBins(tips: SettledTip[]): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < BIN_EDGES.length - 1; i += 1) {
    const lo = BIN_EDGES[i];
    const hi = BIN_EDGES[i + 1];
    const inBin = tips.filter((tip) => tip.modelProb >= lo && tip.modelProb < hi);
    if (inBin.length === 0) continue;
    const wins = inBin.filter((tip) => tip.won).length;
    bins.push({
      label: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`,
      n: inBin.length,
      predicted: inBin.reduce((sum, tip) => sum + tip.modelProb, 0) / inBin.length,
      actual: wins / inBin.length,
    });
  }
  return bins;
}

/** Longest losing run and maximum peak-to-trough drawdown, in units. */
export function drawdown(curve: CurvePoint[]) {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - point.cumulative);
  }
  return Number(maxDrawdown.toFixed(2));
}

/** Mean implied probability of the taken price vs realised hit rate. */
export function priceVsResult(tips: SettledTip[]) {
  if (tips.length === 0) return null;
  const implied = tips.reduce((sum, tip) => sum + 1 / tip.odds, 0) / tips.length;
  const actual = tips.filter((tip) => tip.won).length / tips.length;
  return { implied, actual };
}
