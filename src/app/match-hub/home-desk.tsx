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
  leagueId: number | null;
  status: string;
  view: "fixtures" | "surebets";
  day: DayLoad;
  shown: FixtureMatch[];
  counts: { all: number; upcoming: number; finished: number; live: number };
  days: string[];
  rail: RailCompetition[];
  arbitrage: ArbitrageOpportunity[];
  arbitrageError: string | null;
  unlocked: boolean;
};

/**
 * Match Hub home — fixtures board + SureBets tab.
 * Player Props → /props · Match Props → /match-props · Bet Builder → /generator
 */
export function MatchHubHomeDesk(props: DeskProps) {
  const surebets = props.view === "surebets";

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
          Match Hub
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0f172a]">
          {surebets ? "SureBets" : "Today's fixtures"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#64748b]">
          {surebets
            ? "Guaranteed-profit arbs across your Odds-API bookmakers (currently Bet365 + Paddy Power on this plan)."
            : "Kick-offs, status, and competition filters. Player and match props live in their own sections in the header."}
        </p>
      </header>

      <MatchGrid
        date={props.date}
        leagueId={props.leagueId}
        status={props.status}
        view={props.view}
        day={props.day}
        shown={props.shown}
        counts={props.counts}
        days={props.days}
        rail={props.rail}
        arbitrage={props.arbitrage}
        arbitrageError={props.arbitrageError}
        unlocked={props.unlocked}
      />
    </main>
  );
}
