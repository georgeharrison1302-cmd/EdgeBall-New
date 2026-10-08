"use client";

import { MatchGrid } from "@/components/MatchHub/MatchGrid";
import type { DayLoad, FixtureMatch } from "@/app/fixtures/types";
import type { ArbitrageOpportunity } from "@/lib/odds/arbitrage";

type RailCompetition = {
  id: number;
  name: string;
  logoUrl: string | null;
};

type DeskProps = {
  date: string;
  today: string;
  leagueId: number | null;
  status: string;
  pricedOnly: boolean;
  view: "fixtures" | "surebets";
  day: DayLoad;
  shown: FixtureMatch[];
  counts: { all: number; upcoming: number; finished: number; live: number; priced: number };
  days: string[];
  rail: RailCompetition[];
  arbitrage: ArbitrageOpportunity[];
  arbitrageError: string | null;
  unlocked: boolean;
};

/** Fixture-first home desk — fixtures board + SureBets tab. */
export function MatchHubHomeDesk(props: DeskProps) {
  const surebets = props.view === "surebets";

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
          Fixtures
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink">
          {surebets ? "SureBets" : "Fixture centre"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {surebets
            ? "Guaranteed-price discrepancies across your stored Odds-API bookmakers."
            : "Browse fixtures by date and competition, then open Match Hub for team stats, player props, H2H, and the bet builder."}
        </p>
      </header>

      <MatchGrid {...props} />
    </main>
  );
}
