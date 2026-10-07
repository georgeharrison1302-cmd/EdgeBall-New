import type { Metadata } from "next";

import { loadBuilderBoard } from "@/app/builder/load";
import AdvancedGenerator from "@/components/AdvancedGenerator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Generator · EdgeBall",
  description: "Auto-build an Edge Slip from today's pre-match fixtures.",
};

export default async function GeneratorPage() {
  const board = await loadBuilderBoard();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Bet Builder</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">The Generator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tick competitions and fixtures, set markets, then generate an Edge Slip. Board for{" "}
          {board.dateLabel}.
        </p>
      </div>
      <AdvancedGenerator props={board.generatorProps} oddsPayload={board.oddsPayload} />
    </main>
  );
}
