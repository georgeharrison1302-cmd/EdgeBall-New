"use client";

import { PropCard } from "@/components/PropCard";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { PropBoardRow } from "@/app/fixtures/[id]/hub-load";

/**
 * Radar strip — top +Edge% props across every market for a 30-second scan.
 */
export function TopValueAngles({
  rows,
  fixtureId,
  unlocked,
}: {
  rows: PropBoardRow[];
  fixtureId: number;
  unlocked: boolean;
}) {
  const top = [...rows]
    .filter((row) => row.edgePct != null && row.edgePct > 0 && row.odd != null && row.odd > 1)
    .sort((left, right) => (right.edgePct ?? 0) - (left.edgePct ?? 0))
    .slice(0, 3);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
            Top Value Angles
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">Highest +Edge% on this board</h2>
          <p className="mt-1 text-sm text-muted">
            Sorted by stored model edge vs Bet365 — the first thing you see.
          </p>
        </div>
        {top.length > 0 ? (
          <p className="text-xs font-semibold text-muted">
            {top.length} pick{top.length === 1 ? "" : "s"} · swipe →
          </p>
        ) : null}
      </div>

      {top.length === 0 ? (
        <EmptyReason
          detail="No positive +Edge% props stored for this fixture yet"
          source="prematch_odds + model"
        />
      ) : (
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
          {top.map((row, index) => (
            <div
              key={`angle:${row.playerId}:${row.marketKey}:${row.market}:${row.odd ?? "null"}-${index}`}
              className="w-[min(100%,280px)] shrink-0 snap-start"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cobalt text-[11px] font-black text-white">
                  {index + 1}
                </span>
                <span className="rounded-full bg-[#ecfeff] px-2.5 py-0.5 text-[11px] font-extrabold text-[#0e7490]">
                  +{(row.edgePct ?? 0).toFixed(1)}% edge
                </span>
              </div>
              <ul>
                <PropCard row={row} fixtureId={fixtureId} unlocked={unlocked} />
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
