import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { loadBuilderBoard } from "@/app/builder/load";
import PlayerPropsBuilder from "@/components/PlayerPropsBuilder";
import { PlayerTrendsBoard } from "@/components/props/PlayerTrendsBoard";
import { PropHunterBoard } from "@/components/props/PropHunterBoard";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import { getSubscriptionAccess } from "@/utils/subscription";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Props · EdgeBall",
  description:
    "Prop Hunter ranks stored book odds by model edge; Prop Screener filters by stat and hit rate; Player Trends tracks active streaks.",
};

type PropsView = "hunter" | "screener" | "trends";

const TABS: Array<{ id: PropsView; label: string; blurb: string }> = [
  {
    id: "hunter",
    label: "Prop Hunter",
    blurb: "Stored Bet365 prices ranked by positive model edge across today's fixtures.",
  },
  {
    id: "screener",
    label: "Prop Screener",
    blurb: "Filter every player prop by stat, clear line and last-5 hit rate.",
  },
  {
    id: "trends",
    label: "Player Trends",
    blurb: "Players on active consecutive-hit streaks from stored match logs.",
  },
];

export default async function PlayerPropsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: PropsView =
    params.view === "hunter" || params.view === "trends" ? params.view : "screener";

  const [board, access] = await Promise.all([
    loadBuilderBoard(),
    getSubscriptionAccess(),
  ]);
  const active = TABS.find((tab) => tab.id === view)!;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide text-cobalt uppercase">
          Player Props
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
          {active.label}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {active.blurb} Data for {board.dateLabel}
          {board.matchCount > 0 ? ` · ${board.matchCount} pre-match` : ""} — hit rates
          are empirical from fixture_player_statistics, edges only from stored prices.
        </p>
      </div>

      <nav
        aria-label="Player props views"
        className="mb-6 flex flex-wrap gap-1.5 rounded-full border border-line bg-white p-1 sm:inline-flex"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === "screener" ? "/props" : `/props?view=${tab.id}`}
            aria-current={view === tab.id ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              view === tab.id
                ? "bg-cobalt text-white shadow-sm shadow-blue-600/20"
                : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "hunter" ? (
        <PremiumPaywall
          unlocked={access.unlocked}
          tease="Prop Hunter ranks every stored book price by live model edge. Unlock +Edge% rankings with Pro."
        >
          <PropHunterBoard props={board.playerProps} />
        </PremiumPaywall>
      ) : view === "trends" ? (
        <PlayerTrendsBoard props={board.playerProps} />
      ) : (
        <Suspense
          fallback={
            <div className="rounded-2xl border border-line bg-white px-4 py-10 text-sm text-muted">
              Loading prop desk…
            </div>
          }
        >
          <PlayerPropsBuilder props={board.playerProps} oddsPayload={board.oddsPayload} />
        </Suspense>
      )}
    </main>
  );
}
