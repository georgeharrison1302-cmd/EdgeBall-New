"use client";

import { DESK_STAT_CHIPS, type DeskStat } from "@/lib/stats/prop-desk";

export function StatChipSelector({
  value,
  onChange,
}: {
  value: DeskStat;
  onChange: (stat: DeskStat) => void;
}) {
  return (
    <div
      className="mt-1.5 flex flex-wrap gap-1"
      role="tablist"
      aria-label="Player micro-stat"
      onClick={(event) => event.stopPropagation()}
    >
      {DESK_STAT_CHIPS.map((chip) => {
        const on = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(chip.id)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              on
                ? "bg-[#2563eb] text-white"
                : "border border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#2563eb] hover:text-[#2563eb]"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
