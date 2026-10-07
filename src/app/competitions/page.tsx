import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listCompetitions, type Competition } from "./data";
import CompetitionsBrowser, { type CountryGroup } from "./CompetitionsBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Competitions · EdgeBall",
  description: "Leagues, standings and the players in them.",
};

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  const id = Number(league);
  if (Number.isInteger(id) && id > 0) redirect(`/competitions/${id}`);

  const competitions = await listCompetitions();
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Competitions</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">All leagues</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        {competitions.length} stored competitions. Tables and fixtures come from API-Football.
      </p>
      <CompetitionsBrowser groups={groupCompetitions(competitions)} />
    </div>
  );
}

function groupCompetitions(competitions: Competition[]): CountryGroup[] {
  const byCountry = new Map<string, CountryGroup>();
  for (const league of competitions) {
    const existing = byCountry.get(league.country);
    if (existing) {
      existing.leagues.push(league);
      continue;
    }
    byCountry.set(league.country, {
      country: league.country,
      flagUrl: league.flagUrl,
      leagues: [league],
    });
  }
  return [...byCountry.values()];
}
