"use client";

import type { DeskGameLog, DeskStat } from "@/lib/stats/prop-desk";
import { statBreakdownLabel } from "@/lib/stats/prop-desk";

/**
 * Micro-tooltip for a single form box: opponent, score, minutes, stat detail.
 */
export function FormBoxTooltip({
  game,
  count,
  hit,
  stat,
}: {
  game: DeskGameLog;
  count: number;
  hit: boolean;
  stat: DeskStat;
}) {
  const sub = game.minutes != null && game.minutes < 60;
  return (
    <div
      role="tooltip"
      className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-52 -translate-x-1/2 rounded-xl border border-[#e2e8f0] bg-white p-3 text-left shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-extrabold text-[#0f172a]">{game.opponent}</p>
        {game.venue ? (
          <span className="shrink-0 rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[10px] font-extrabold text-[#64748b]">
            {game.venue}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] font-semibold text-[#64748b]">
        {game.score ? `FT ${game.score}` : "Score not stored (fixtures)"}
        {game.minutes != null ? ` · ${game.minutes}'` : " · minutes not stored"}
      </p>
      <p className="mt-2 text-[11px] font-bold text-[#0f172a]">{statBreakdownLabel(game, stat)}</p>
      <p className={`mt-1 text-[11px] font-semibold ${hit ? "text-emerald-600" : "text-[#64748b]"}`}>
        Count {count}
        {hit ? " · cleared line" : " · missed line"}
      </p>
      {sub ? (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
          Sub appearance (&lt;60′)
        </p>
      ) : null}
    </div>
  );
}
