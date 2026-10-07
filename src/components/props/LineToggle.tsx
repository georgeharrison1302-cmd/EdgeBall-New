"use client";

import type { DeskHalfLine } from "@/lib/stats/prop-desk";
import { halfLineToThreshold } from "@/lib/stats/prop-desk";

export function LineToggle({
  value,
  onChange,
  lines,
  pricedThresholds,
}: {
  value: DeskHalfLine;
  onChange: (line: DeskHalfLine) => void;
  lines: DeskHalfLine[];
  /** Integer thresholds that have at least one stored book price. */
  pricedThresholds?: number[];
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-0.5"
      role="group"
      aria-label="Line"
    >
      {lines.map((line) => {
        const threshold = halfLineToThreshold(line);
        const priced = pricedThresholds?.includes(threshold) ?? false;
        const on = value === line;
        return (
          <button
            key={line}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChange(line);
            }}
            title={priced ? "Book price stored" : "No book price for this line"}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
              on
                ? "bg-[#2563eb] text-white"
                : priced
                  ? "text-[#0f172a] hover:bg-white"
                  : "text-[#94a3b8] hover:bg-white"
            }`}
          >
            {line}+
          </button>
        );
      })}
    </div>
  );
}
