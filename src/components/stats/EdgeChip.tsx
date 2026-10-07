import { isPriced, resolveEdgePct, type DecimalOdds, type EdgePct, type ModelProb } from "./types";

/**
 * Neon edge chip — only when model + book price exist and edge > 0.
 * Fill uses --neon-edge on dark ink. Never invents edge from hit-rate alone.
 */
export function EdgeChip({
  modelProb,
  decimalOdds,
  edgePct,
  className = "",
}: {
  modelProb?: ModelProb;
  decimalOdds?: DecimalOdds;
  edgePct?: EdgePct;
  className?: string;
}) {
  if (!isPriced(decimalOdds) || modelProb == null || !Number.isFinite(modelProb)) {
    return null;
  }
  const edge = resolveEdgePct(modelProb, decimalOdds, edgePct);
  if (edge == null || edge <= 0) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] ${className}`.trim()}
      style={{ background: "var(--neon-edge)" }}
    >
      +{edge.toFixed(1)}% Edge
    </span>
  );
}
