"use client";

import type { DeskSplit } from "@/lib/stats/prop-desk";

const SPLITS: DeskSplit[] = ["L5", "L10", "L20", "Season", "H2H"];

export function SplitSwitcher({
  value,
  onChange,
}: {
  value: DeskSplit;
  onChange: (split: DeskSplit) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-full border border-[#e2e8f0] bg-white p-1"
      role="tablist"
      aria-label="Form split"
    >
      {SPLITS.map((split) => {
        const on = value === split;
        return (
          <button
            key={split}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(split)}
            className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors ${
              on ? "bg-[#2563eb] text-white" : "text-[#64748b] hover:bg-[#f8fafc]"
            }`}
          >
            {split}
          </button>
        );
      })}
    </div>
  );
}
