/**
 * Last-N hit-rate strip. Oldest-left.
 * Renders whatever appearances are stored (1–5+); never pads empty misses.
 * Empty only when no logs — copy is "No match logs stored".
 */
export function HitRateStrip({
  values,
  thresholdLabel,
  seasonAverage,
  seasonUnit = "/g",
}: {
  /** Oldest → newest booleans from recent appearances. */
  values?: boolean[];
  thresholdLabel: string;
  /** Season rate fallback when no match logs are stored (player_season_stats). */
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

  const n = values.length;
  const hits = values.filter(Boolean).length;
  const caption = `${hits}/${n} ${thresholdLabel}`;
  const aria = values.map((item) => (item ? "hit" : "miss")).join(", ");

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      aria-label={`Oldest first: ${aria}. ${caption}`}
    >
      <div className="flex gap-1">
        {values.map((item, index) => (
          <span
            key={`${index}-${item ? "hit" : "miss"}`}
            className={`h-3.5 w-3.5 rounded-full ${
              item ? "bg-[var(--neon-edge)]" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-[var(--ink)]">{caption}</span>
    </div>
  );
}
