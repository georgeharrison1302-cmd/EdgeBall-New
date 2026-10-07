import type { FormOutcome } from "@/lib/stats/last-five";

/**
 * Compact last-5 hit/miss strip (oldest → newest).
 * Light-mode only — emerald hits, muted slate misses.
 */
export function FormStrip({
  outcomes,
  label = "Over",
  className = "",
}: {
  outcomes: FormOutcome[];
  /** Noun for the summary, e.g. "Over" → "Over in 4 of last 5". */
  label?: string;
  className?: string;
}) {
  if (outcomes.length === 0) {
    return (
      <p className={`text-xs text-[var(--muted)] ${className}`.trim()}>No match logs stored</p>
    );
  }

  const hits = outcomes.filter((outcome) => outcome === "hit").length;
  const n = outcomes.length;
  const summary = `${label} in ${hits} of last ${n}`;
  const aria = outcomes.join(", ");

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`.trim()}
      aria-label={`Oldest first: ${aria}. ${summary}`}
    >
      <div className="flex gap-1">
        {outcomes.map((outcome, index) => (
          <span
            key={`${index}-${outcome}`}
            title={outcome}
            className="grid h-4 w-4 place-items-center rounded-md text-[10px] font-extrabold leading-none text-white"
            style={{
              backgroundColor: outcome === "hit" ? "#10b981" : "#cbd5e1",
            }}
          >
            {outcome === "hit" ? "✓" : "×"}
          </span>
        ))}
      </div>
      <span className="text-xs font-semibold text-[var(--ink)]">{summary}</span>
    </div>
  );
}
