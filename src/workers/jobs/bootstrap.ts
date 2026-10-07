import { isEmptyApiResponse } from "@/utils/api-football/client";
import {
  getLeagues,
  getTeams,
  leagueLogoUrl,
  teamLogoUrl,
  type ApiFootballLeague,
  type ApiFootballTeamItem,
} from "@/utils/api-football/endpoints";
import { cadence } from "@/utils/api-football/cadence";
import { isTargetLeagueId } from "@/utils/api-football/competitions";
import {
  currentLeagueSeasons,
  REQUEST_GAP_MS,
  sleep,
  trackedLeagueIds,
  upsertChunks,
} from "@/workers/db";
import { runTsx } from "@/workers/run-tsx";
import type { WorkerJob } from "@/workers/types";

export const bootstrapJobs: WorkerJob[] = [
  {
    id: "leagues",
    lane: "bootstrap",
    endpoints: ["/leagues"],
    intervalMs: cadence.leagues,
    description: "Competition IDs, coverage flags, season metadata. Daily.",
    run: syncLeagues,
  },
  {
    id: "teams",
    lane: "bootstrap",
    endpoints: ["/teams"],
    intervalMs: cadence.teams,
    description: "Team IDs, names, logos, venue info. Daily.",
    run: syncTeams,
  },
  {
    id: "squads",
    lane: "bootstrap",
    endpoints: ["/players/squads"],
    intervalMs: cadence.squads,
    description: "Current registered squad for each tracked team. Daily.",
    run: () => runTsx("scripts/sync-squads.ts"),
  },
];

export async function syncLeagues() {
  const envelope = await getLeagues({ current: true });
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=leagues");
    return { leagues: 0, seasons: 0 };
  }

  const tracked = await trackedLeagueIds();
  const allow = tracked.length > 0 ? new Set(tracked) : null;
  const items = envelope.response.filter((item) => {
    const id = item.league?.id;
    if (!id) return false;
    if (allow) return allow.has(id);
    return isTargetLeagueId(id);
  });

  const leagues = items.map((item) => ({
    id: item.league.id,
    name: item.league.name,
    type: item.league.type,
    logo: item.league.logo ?? leagueLogoUrl(item.league.id),
    country_name: item.country?.name ?? null,
    country_code: item.country?.code ?? null,
    country_flag: item.country?.flag ?? null,
  }));
  await upsertChunks("leagues", leagues, "id");

  const seasons = items.flatMap((item) => mapLeagueSeasons(item));
  await upsertChunks("league_seasons", seasons, "league_id,year");

  console.log(`leagues stored ${leagues.length} seasons ${seasons.length}`);
  return { leagues: leagues.length, seasons: seasons.length };
}

function mapLeagueSeasons(item: ApiFootballLeague) {
  return (item.seasons ?? []).map((season) => ({
    league_id: item.league.id,
    year: season.year,
    start: season.start || null,
    end: season.end || null,
    current: season.current,
    coverage: season.coverage ?? null,
  }));
}

export async function syncTeams() {
  const targets = await currentLeagueSeasons();
  console.log(`current league seasons ${targets.length}`);
  let teams = 0;
  let venues = 0;

  for (const [index, target] of targets.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    const result = await syncTeamsForLeague(target.leagueId, target.season);
    teams += result.teams;
    venues += result.venues;
    console.log(
      `progress ${index + 1}/${targets.length} league ${target.leagueId} ${target.season}: teams ${result.teams}`,
    );
  }

  return { teams, venues, leagues: targets.length };
}

async function syncTeamsForLeague(leagueId: number, season: number) {
  const envelope = await getTeams({ league: leagueId, season });
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=teams league=${leagueId} season=${season}`);
    return { teams: 0, venues: 0 };
  }

  const venueRows = new Map<number, Record<string, unknown>>();
  const teamRows = new Map<number, Record<string, unknown>>();
  const links: Array<{ team_id: number; league_id: number; season: number }> = [];

  for (const item of envelope.response) {
    mapTeamItem(item, leagueId, season, venueRows, teamRows, links);
  }

  await upsertChunks("venues", [...venueRows.values()], "id");
  await upsertChunks("teams", [...teamRows.values()], "id");
  await upsertChunks("team_seasons", links, "team_id,league_id,season");
  return { teams: teamRows.size, venues: venueRows.size };
}

function mapTeamItem(
  item: ApiFootballTeamItem,
  leagueId: number,
  season: number,
  venues: Map<number, Record<string, unknown>>,
  teams: Map<number, Record<string, unknown>>,
  links: Array<{ team_id: number; league_id: number; season: number }>,
) {
  if (!item.team?.id || !item.team.name) return;
  const venueId = item.venue?.id && item.venue.id > 0 ? item.venue.id : null;
  if (venueId && item.venue) {
    venues.set(venueId, {
      id: venueId,
      name: item.venue.name ?? null,
      address: item.venue.address ?? null,
      city: item.venue.city ?? null,
      country: item.venue.country ?? item.team.country ?? null,
      capacity: item.venue.capacity ?? null,
      surface: item.venue.surface ?? null,
      image: item.venue.image ?? null,
    });
  }
  teams.set(item.team.id, {
    id: item.team.id,
    name: item.team.name,
    code: item.team.code,
    country: item.team.country,
    founded: item.team.founded,
    national: item.team.national,
    logo: item.team.logo ?? teamLogoUrl(item.team.id),
    venue_id: venueId,
  });
  links.push({ team_id: item.team.id, league_id: leagueId, season });
}
