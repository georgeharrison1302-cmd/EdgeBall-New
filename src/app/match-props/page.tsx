import type { Metadata } from "next";

import { loadBuilderBoard } from "@/app/builder/load";
import MatchPropsBuilder from "@/components/MatchPropsBuilder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Match Props · EdgeBall",
  description: "Pick match-level markets from today's pre-match fixtures.",
};

export default async function MatchPropsPage() {
  const board = await loadBuilderBoard();
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-cobalt">
          Match Props
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
          Match Props
        </h1>
        <p className="mt-1 text-sm text-muted">
          1X2, BTTS and Over/Under from stored pre-match odds for {board.dateLabel}
          {board.matchCount > 0 ? ` · ${board.matchCount} pre-match` : ""}.
        </p>
      </div>
      <MatchPropsBuilder props={board.matchProps} />
    </main>
  );
}
