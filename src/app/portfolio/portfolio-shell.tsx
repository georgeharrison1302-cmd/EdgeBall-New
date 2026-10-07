"use client";

import Link from "next/link";

import { ModelGrading } from "@/components/ModelGrading";
import type { ModelGradingSummary } from "@/app/tracker/model-grading-load";

import { PortfolioView } from "./portfolio-view";
import type { PortfolioSummary } from "./load";

export type PortfolioTab = "bets" | "model";

export function PortfolioShell({
  tab,
  bets,
  model,
}: {
  tab: PortfolioTab;
  bets: PortfolioSummary;
  model: ModelGradingSummary;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Portfolio</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Proof & bankroll</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your slips and EdgeBall&apos;s verified model record — one desk.
        </p>
      </div>

      <div className="mb-8 flex rounded-full border border-[#e2e8f0] bg-white p-1 shadow-sm w-fit">
        <Link
          href="/portfolio?tab=bets"
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            tab === "bets" ? "bg-[#2563eb] text-white" : "text-[#64748b] hover:text-[#0f172a]"
          }`}
        >
          My Bets
        </Link>
        <Link
          href="/portfolio?tab=model"
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            tab === "model" ? "bg-[#2563eb] text-white" : "text-[#64748b] hover:text-[#0f172a]"
          }`}
        >
          Model Accuracy
        </Link>
      </div>

      {tab === "model" ? <ModelGrading data={model} /> : <PortfolioView data={bets} />}
    </main>
  );
}
