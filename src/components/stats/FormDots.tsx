/**
 * Circular numbered form dots (oldest → newest). Green when count ≥ threshold.
 */
export function FormDots({
  counts,
  threshold,
  className = "",
}: {
  counts: number[];
  threshold: number;
  className?: string;
}) {
  if (counts.length === 0) {
    return (
      <p className={`text-[11px] font-semibold text-[#94a3b8] ${className}`.trim()}>
        No match logs stored
      </p>
    );
  }

  return (
    <div
      className={`flex gap-1 ${className}`.trim()}
      aria-label={`Form oldest first: ${counts.join(", ")}`}
    >
      {counts.map((count, index) => {
        const hit = count >= threshold;
        return (
          <span
            key={`${index}-${count}`}
            title={`${count} · ${hit ? "hit" : "miss"} ${threshold}+`}
            className={`grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-extrabold text-white ${
              hit ? "bg-emerald-500" : "bg-red-500"
            }`}
          >
            {count}
          </span>
        );
      })}
    </div>
  );
}
