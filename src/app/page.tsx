import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { featuredCompetitions } from "@/app/competitions/data";
import { fixtureDateOptions, hasFixtureOdds } from "@/app/fixtures/board-utils";
import { loadFixtureDay } from "@/app/fixtures/load";
import type { FixtureMatch } from "@/app/fixtures/types";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { MatchHubHomeDesk } from "@/app/match-hub/home-desk";
import { fetchArbitrageBets, type ArbitrageOpportunity } from "@/lib/odds/arbitrage";
import { isTargetLeagueId } from "@/utils/api-football/competitions";
import { getSubscriptionAccess } from "@/utils/subscription";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fixtures · EdgeBall",
  description: "Football fixtures by date and competition, with stored bookmaker prices.",
};

type Search = {
  date?: string;
  league?: string;
  status?: string;
  priced?: string;
  view?: string;
};

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;

  // Legacy Match Hub lenses → dedicated routes.
  if (params.view === "props") redirect("/props");
  if (params.view === "collisions") redirect("/factors");
  if (params.view === "match-props") redirect("/match-props");

  const today = londonToday();
  const date = validDate(params.date) ?? today;
  const league = Number(params.league);
  const leagueId = isTargetLeagueId(league) ? league : null;
  const status = validStatus(params.status);
  const pricedOnly = params.priced === "1";
  const view = params.view === "surebets" ? "surebets" : "fixtures";

  const [day, rail, access, arbResult] = await Promise.all([
    loadFixtureDay(date, leagueId),
    featuredCompetitions(),
    getSubscriptionAccess(),
    loadArbitrage(),
  ]);

  const counts = countBuckets(day.matches);
  const shown = day.matches.filter((match) => {
    if (status !== "all" && match.bucket !== status) return false;
    if (pricedOnly && !hasFixtureOdds(match)) return false;
    return true;
  });
  const days = fixtureDateOptions(today);

  return (
    <MatchHubHomeDesk
      date={date}
      today={today}
      leagueId={leagueId}
      status={status}
      pricedOnly={pricedOnly}
      view={view}
      day={day}
      shown={shown}
      counts={counts}
      days={days}
      rail={rail}
      arbitrage={arbResult.opportunities}
      arbitrageError={arbResult.error}
      unlocked={access.unlocked}
      freshness={<DataFreshness jobs={["odds", "results", "lineups"]} />}
    />
  );
}

async function loadArbitrage(): Promise<{
  opportunities: ArbitrageOpportunity[];
  error: string | null;
}> {
  try {
    const opportunities = await fetchArbitrageBets();
    return { opportunities, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "fetch failed";
    return { opportunities: [], error: message };
  }
}

function countBuckets(matches: FixtureMatch[]) {
  return {
    all: matches.length,
    upcoming: matches.filter((match) => match.bucket === "upcoming").length,
    finished: matches.filter((match) => match.bucket === "finished").length,
    live: matches.filter((match) => match.bucket === "live").length,
    priced: matches.filter(hasFixtureOdds).length,
  };
}

function validStatus(value: string | undefined) {
  if (value === "upcoming" || value === "finished" || value === "live") return value;
  return "all";
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function londonToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
