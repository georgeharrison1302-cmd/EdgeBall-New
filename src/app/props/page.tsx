import type { Metadata } from "next";
import { Suspense } from "react";

import { loadBuilderBoard } from "@/app/builder/load";
import PlayerPropsBuilder from "@/components/PlayerPropsBuilder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Props · EdgeBall",
  description: "Filter player props by stat with empirical last-5 proof from stored match logs.",
};

export default async function PlayerPropsPage() {
  const board = await loadBuilderBoard();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide text-[#2563eb] uppercase">
          Player Props
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a]">
          Filter by stat · last-5 proof
        </h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Fouls, SOT, shots, cards and more from stored pre-match odds for {board.dateLabel}
          {board.matchCount > 0 ? ` · ${board.matchCount} pre-match` : ""}. Hit rate is empirical
          last-5 from fixture_player_statistics — never padded.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-10 text-sm text-[#64748b]">
            Loading prop desk…
          </div>
        }
      >
        <PlayerPropsBuilder props={board.playerProps} oddsPayload={board.oddsPayload} />
      </Suspense>
    </main>
  );
}
