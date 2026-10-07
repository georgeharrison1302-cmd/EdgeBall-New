"use client";

import { useId, useState } from "react";

import type { DeskGameLog, DeskStat } from "@/lib/stats/prop-desk";

import { FormBoxTooltip } from "./FormBoxTooltip";

export function FormStripInteractive({
  games,
  counts,
  threshold,
  stat,
}: {
  games: DeskGameLog[];
  counts: number[];
  threshold: number;
  stat: DeskStat;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const uid = useId();

  if (counts.length === 0) {
    return <p className="text-[11px] font-semibold text-[#94a3b8]">No match logs stored</p>;
  }

  // Display oldest → newest to match HitRateStrip convention.
  const ordered = counts.map((count, index) => ({ count, game: games[index]! })).reverse();

  return (
    <div className="flex gap-1" onMouseLeave={() => setOpen(null)}>
      {ordered.map((item, index) => {
        const hit = item.count >= threshold;
        const sub = item.game.minutes != null && item.game.minutes < 60;
        const isOpen = open === index;
        return (
          <button
            key={`${uid}-${item.game.fixtureId}-${index}`}
            type="button"
            className="relative"
            aria-label={`${item.game.opponent}: ${item.count}`}
            onMouseEnter={() => setOpen(index)}
            onFocus={() => setOpen(index)}
            onBlur={() => setOpen(null)}
            onClick={() => setOpen(isOpen ? null : index)}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold text-white ${
                hit ? "bg-emerald-500" : "bg-red-500"
              }`}
            >
              {item.count}
            </span>
            {sub ? (
              <span
                className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 ring-1 ring-white"
                title="Sub appearance"
              />
            ) : null}
            {isOpen ? (
              <FormBoxTooltip game={item.game} count={item.count} hit={hit} stat={stat} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
