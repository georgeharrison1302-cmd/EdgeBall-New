/**
 * Compact hit-rate % + progress bar for the Prop Desk table.
 */
export function HitRateBar({
  hitPct,
  className = "",
}: {
  hitPct: number | null;
  className?: string;
}) {
  if (hitPct == null || !Number.isFinite(hitPct)) {
    return (
      <p className={`text-[11px] font-semibold text-[#94a3b8] ${className}`.trim()}>
        —
      </p>
    );
  }

  const clamped = Math.max(0, Math.min(100, hitPct));
  return (
    <div className={`min-w-[92px] ${className}`.trim()}>
      <p className="text-sm font-extrabold tabular-nums text-[#0f172a]">{clamped}%</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
