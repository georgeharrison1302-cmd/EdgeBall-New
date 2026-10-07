/**
 * Statz-style Last-N: hit-rate bar + avg + numbered green/red boxes.
 * Renders available games (even if fewer than 5). Empty only when no logs.
 */
export function LastFiveStatStrip({
  values,
  threshold,
  thresholdLabel,
  seasonAverage,
  seasonUnit = "/g",
}: {
  /** Oldest → newest per-game counts. */
  values?: number[];
  /** Integer clear line (1 for 0.5+, 2 for 1.5+, …). */
  threshold: number;
  thresholdLabel: string;
  seasonAverage?: number | null;
  seasonUnit?: string;
}) {
  if (!values || values.length === 0) {
    if (seasonAverage != null && Number.isFinite(seasonAverage)) {
      return (
        <p className="text-xs text-[var(--muted)]">
          No match logs stored · season {seasonAverage.toFixed(1)}
          {seasonUnit} {thresholdLabel}
        </p>
      );
    }
    return <p className="text-xs text-[var(--muted)]">No match logs stored</p>;
  }

  const hits = values.filter((value) => value >= threshold).length;
  const hitPct = Math.round((hits / values.length) * 100);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

  return (
    <div className="space-y-1.5" aria-label={`Last ${values.length}: ${values.join(", ")}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[72px]">
          <p className="text-[10px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
            Hit Rate
          </p>
          <p className="text-sm font-extrabold text-[var(--ink)]">{hitPct}%</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${hitPct}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
            Avg
          </p>
          <p className="text-sm font-extrabold tabular-nums text-[var(--ink)]">
            {avg.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
            Last {values.length}
          </p>
          <div className="mt-0.5 flex gap-1">
            {values.map((value, index) => {
              const hit = value >= threshold;
              return (
                <span
                  key={`${index}-${value}`}
                  title={`${value} · ${hit ? "hit" : "miss"} ${thresholdLabel}`}
                  className={`grid h-6 min-w-[1.5rem] place-items-center rounded px-1 text-[11px] font-extrabold text-white ${
                    hit ? "bg-emerald-500" : "bg-red-500"
                  }`}
                >
                  {value}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-[10px] font-semibold text-[var(--muted)]">
        {hits}/{values.length} cleared {thresholdLabel}
      </p>
    </div>
  );
}
