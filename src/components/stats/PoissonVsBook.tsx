"use client";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";

import { EdgeChip } from "./EdgeChip";
import { isPriced, type DecimalOdds, type EdgePct, type ModelProb } from "./types";

/**
 * Model probability vs Bet365 implied. No synthetic prices.
 * Pairs with OddsPill; EdgeChip only when model + book exist and edge > 0.
 */
export function PoissonVsBook({
  modelProb,
  decimalOdds,
  edgePct,
}: {
  modelProb?: ModelProb;
  decimalOdds?: DecimalOdds;
  edgePct?: EdgePct;
}) {
  const { formatOddsLabel } = useDisplayPrefs();
  const priced = isPriced(decimalOdds);
  const model = modelProb != null && Number.isFinite(modelProb) ? modelProb : null;

  if (!priced && model == null) {
    return <p className="text-xs text-[var(--muted)]">No Book Odds</p>;
  }

  const impliedPct = priced ? (1 / decimalOdds) * 100 : null;
  const modelPct = model == null ? null : model * 100;

  return (
    <div className="min-w-[140px]">
      {priced && modelPct != null && impliedPct != null ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold">
          <span className="text-[var(--cobalt)]">Model: {modelPct.toFixed(0)}%</span>
          <span className="text-[var(--muted)]">Implied Book: {impliedPct.toFixed(0)}%</span>
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-3 text-xs font-semibold">
          <span className="text-[var(--muted)]">
            {priced ? formatOddsLabel(decimalOdds, "@ ") : "No Book Odds"}
          </span>
          <span className="text-[var(--muted)]">
            {modelPct == null ? "No model" : `${modelPct.toFixed(0)}% model`}
          </span>
        </div>
      )}
      <EdgeChip
        modelProb={model}
        decimalOdds={decimalOdds}
        edgePct={edgePct}
        className="mt-2"
      />
    </div>
  );
}
