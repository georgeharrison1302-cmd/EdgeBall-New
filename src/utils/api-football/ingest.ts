import "server-only";
import { createIngestClient as createAdminClient } from "@/utils/supabase/admin";
import { ApiFootballError, ApiFootballQuotaError, isEmptyApiResponse } from "./client";
import { cadence, isFresh } from "./cadence";
import { coverageAllows } from "./coverage";
import { findCountries, isKnownSeason } from "./reference";
import {
  getCountries,
  getFixtures,
  getHeadToHead,
  getLeagues,
  getSeasons,
  getStandings,
  getTeams,
  getTeamStatistics,
  getTimezones,
  getTopScorers,
  getTopAssists,
  getTopYellowCards,
  getTopRedCards,
  getPlayersAllPages,
  getPlayerProfiles,
  getVenues,
  leagueLogoUrl,
  teamLogoUrl,
  type ApiFootballFixtureItem,
  type ApiFootballLeague,
  type ApiFootballPlayerItem,
  type ApiFootballPlayerProfile,
  type ApiFootballPlayerStatistic,
  type ApiFootballStandingsItem,
  type ApiFootballVenue,
  type GetFixturesParams,
  type GetLeaguesParams,
  type GetPlayerProfilesParams,
  type GetPlayersParams,
  type GetStandingsParams,
  type GetTeamsParams,
  type GetTeamStatisticsParams,
  type GetTopScorersParams,
  type GetVenuesParams,
} from "./endpoints";
import {
  TARGET_COMPETITIONS,
  TARGET_LEAGUE_IDS,
  TARGET_SEASON_DEPTH,
  TARGET_SEASON_FROM,
  TARGET_SEASON_TO,
  WORLD_COUNTRIES,
  currentSeasonYear,
  isTargetLeagueId,
  matchTargetCompetition,
} from "./competitions";

export async function ingestTimezones() {
  const supabase = createAdminClient();
  const { count, error: countError } = await supabase
    .from("timezones")
    .select("name", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    console.log(`timezones stored ${count}`);
    return { count: count ?? 0, skipped: true };
  }

  const envelope = await getTimezones();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=timezones");
    return { count: 0, skipped: false };
  }

  const rows = envelope.response
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name) => ({ name }));
  if (rows.length === 0) {
    console.log("Data Not Yet Available resource=timezones");
    return { count: 0, skipped: false };
  }

  const { error } = await supabase.from("timezones").upsert(rows, { onConflict: "name" });
  if (error) throw error;
  console.log(`timezones stored ${rows.length}`);
  return { count: rows.length, skipped: false };
}

export async function ingestCountries() {
  const supabase = createAdminClient();
  const { count, error: countError } = await supabase.from("countries").select("name", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    const { data, error } = await supabase.from("ingest_checkpoints").select("last_run_at").eq("id", "countries").maybeSingle();
    if (error) throw error;
    if (!data?.last_run_at || isFresh(String(data.last_run_at), cadence.countries)) {
      if (!data?.last_run_at) {
        await supabase.from("ingest_checkpoints").upsert(
          { id: "countries", resource: "countries", params: {}, last_status: "ok", last_run_at: new Date().toISOString() },
          { onConflict: "id" },
        );
      }
      console.log(`countries stored ${count}`);
      return { count: count ?? 0 };
    }
  }

  const envelope = await getCountries();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=countries");
    return { count: 0 };
  }
  const { response } = envelope;
  const rows = response
    .filter((country) => country.name)
    .map((country) => ({
      name: country.name,
      code: country.code,
      flag_url: country.flag,
    }));

  const { error } = await supabase.from("countries").upsert(rows, {
    onConflict: "name",
  });

  if (error) {
    throw error;
  }

  await supabase.from("ingest_checkpoints").upsert(
    { id: "countries", resource: "countries", params: {}, last_status: `ok:${rows.length}`, last_run_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  return { count: rows.length };
}

export async function ingestLeagues(params?: GetLeaguesParams) {
  if (params?.search != null && params.search.trim().length < 3) {
    console.log("league search needs at least 3 characters");
    return { leagues: 0, seasons: 0 };
  }
  if (params?.type != null && params.type !== "league" && params.type !== "cup") {
    console.log("league type must be league or cup");
    return { leagues: 0, seasons: 0 };
  }
  if (params?.team != null && (!Number.isInteger(params.team) || params.team <= 0)) {
    console.log("league team id must be a number");
    return { leagues: 0, seasons: 0 };
  }
  if (params?.season != null && !(await knownSeason(params.season))) {
    return { leagues: 0, seasons: 0 };
  }
  if (params?.country) {
    const matches = await findCountries({ name: params.country });
    if (matches.length === 0) {
      console.log(`Data Not Yet Available resource=leagues country=${params.country}`);
      return { leagues: 0, seasons: 0 };
    }
    params = { ...params, country: matches[0].name };
  }
  const envelope = await getLeagues(params);
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=leagues");
    return { leagues: 0, seasons: 0 };
  }
  const scoped = envelope.response.filter((item) => isTargetLeagueId(item.league.id));
  return upsertLeagueItems(scoped);
}

export async function ingestSeasons() {
  const envelope = await getSeasons();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=seasons");
    return { count: 0 };
  }
  const years = envelope.response.filter((year) => Number.isInteger(year));
  if (years.length === 0) {
    console.log("Data Not Yet Available resource=seasons");
    return { count: 0 };
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("seasons").upsert(
    years.map((year) => ({ year })),
    { onConflict: "year" },
  );
  if (error) throw error;
  console.log(`seasons stored ${years.length}`);
  return { count: years.length };
}

function hasVenueFilter(params: GetVenuesParams) {
  if ("id" in params) return Number.isInteger(params.id);
  if ("name" in params) return params.name.trim() !== "";
  if ("city" in params) return params.city.trim() !== "";
  if ("country" in params) return params.country.trim() !== "";
  return false;
}

async function storedVenue(id: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, address, capacity")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function hasTeamFilter(params: GetTeamsParams) {
  if ("id" in params) return Number.isInteger(params.id);
  if ("league" in params) return Number.isInteger(params.league) && Number.isInteger(params.season);
  if ("country" in params) return params.country.trim() !== "";
  if ("name" in params) return params.name.trim() !== "";
  if ("code" in params) return params.code.trim() !== "";
  if ("venue" in params) return Number.isInteger(params.venue);
  if ("search" in params) return params.search.trim() !== "";
  return false;
}

async function storedTeam(id: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("teams").select("id, venue_id").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function storedTeamSeasonCount(leagueId: number, season: number) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("team_seasons")
    .select("team_id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) throw error;
  return count ?? 0;
}

const FIXTURE_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function fixtureQueryProblem(params: GetFixturesParams) {
  const ids = params.ids?.split("-").filter(Boolean) ?? [];
  if (params.ids != null && (ids.length === 0 || ids.length > 20 || ids.some((id) => !/^\d+$/.test(id)))) {
    return "fixture ids must be 1 to 20 numbers separated by hyphens";
  }
  if (params.live != null && params.live !== "all") {
    const leagues = params.live.split("-").filter(Boolean);
    if (leagues.length === 0 || leagues.some((id) => !isTargetLeagueId(Number(id)))) {
      return "live must be all or target league ids separated by hyphens";
    }
  }
  for (const key of ["date", "from", "to"] as const) {
    if (params[key] != null && !FIXTURE_DATE.test(params[key])) return `${key} must be YYYY-MM-DD`;
  }
  if ((params.from == null) !== (params.to == null)) return "from and to must be used together";
  if (params.next != null && params.last != null) return "next and last cannot be used together";
  if (params.next != null && (params.next < 1 || params.next > 99)) return "next must be from 1 to 99";
  if (params.last != null && (params.last < 1 || params.last > 99)) return "last must be from 1 to 99";
  if (params.season != null && !(await isKnownSeason(params.season))) {
    return `season ${params.season} is not in /leagues/seasons`;
  }
  const hasFilter =
    params.id != null ||
    ids.length > 0 ||
    params.live != null ||
    params.date != null ||
    params.league != null ||
    params.team != null ||
    (params.from != null && params.to != null);
  if (!hasFilter) return "fixtures request needs a filter";
  if (
    params.league != null &&
    params.season == null &&
    params.date == null &&
    params.live == null &&
    params.from == null &&
    params.team == null
  ) {
    return "league fixtures need a season, date, or range";
  }
  return null;
}

async function knownSeason(year: number) {
  if (await isKnownSeason(year)) return true;
  console.log(`season ${year} is not in /leagues/seasons`);
  return false;
}

export async function ingestTeams(params: GetTeamsParams) {
  if (!hasTeamFilter(params)) {
    console.log("teams request needs at least one parameter");
    return { teams: 0, venues: 0, teamSeasons: 0 };
  }
  if ("search" in params && params.search.trim().length < 3) {
    console.log("team search needs at least 3 characters");
    return { teams: 0, venues: 0, teamSeasons: 0 };
  }
  if ("country" in params) {
    const matches = await findCountries({ name: params.country });
    if (matches.length === 0) {
      console.log(`Data Not Yet Available resource=teams country=${params.country}`);
      return { teams: 0, venues: 0, teamSeasons: 0 };
    }
    params = { country: matches[0].name };
  }
  if ("league" in params && !isTargetLeagueId(params.league)) {
    return { teams: 0, venues: 0, teamSeasons: 0 };
  }
  if ("season" in params && !(await knownSeason(params.season))) {
    return { teams: 0, venues: 0, teamSeasons: 0 };
  }
  if ("id" in params) {
    const existing = await storedTeam(params.id);
    if (existing) {
      console.log(`team ${params.id} already stored`);
      return { teams: 1, venues: existing.venue_id == null ? 0 : 1, teamSeasons: 0 };
    }
  }
  if ("league" in params && "season" in params) {
    const stored = await storedTeamSeasonCount(params.league, params.season);
    if (stored > 0) {
      console.log(`teams league=${params.league} season=${params.season} already stored ${stored}`);
      return { teams: stored, venues: 0, teamSeasons: stored };
    }
  }

  const envelope = await getTeams(params);
  if (isEmptyApiResponse(envelope)) {
    const label = "league" in params ? `league=${params.league} season=${params.season}` : "teams";
    console.log(`Data Not Yet Available resource=teams ${label}`);
    return { teams: 0, venues: 0, teamSeasons: 0 };
  }
  const { response } = envelope;
  const supabase = createAdminClient();

  const venues = response
    .map((item) =>
      item.venue?.id
        ? {
            id: item.venue.id,
            name: item.venue.name,
            address: item.venue.address,
            city: item.venue.city,
            country_name: item.venue.country ?? item.team.country ?? null,
            capacity: item.venue.capacity,
            surface: item.venue.surface,
            image_url: item.venue.image,
          }
        : null,
    )
    .filter((venue): venue is NonNullable<typeof venue> => Boolean(venue));

  if (venues.length > 0) {
    const uniqueVenues = Array.from(
      new Map(venues.map((venue) => [venue.id, venue])).values(),
    );
    const { error } = await supabase.from("venues").upsert(uniqueVenues, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  const teams = response
    .filter((item) => item.team?.id)
    .map((item) => ({
      id: item.team.id,
      name: item.team.name,
      code: item.team.code,
      country_name: item.team.country,
      founded: item.team.founded,
      national: item.team.national,
      logo: item.team.logo ?? teamLogoUrl(item.team.id),
      venue_id: item.venue?.id ?? null,
    }));

  const { error: teamsError } = await supabase
    .from("teams")
    .upsert(teams, { onConflict: "id" });
  if (teamsError) throw teamsError;

  let teamSeasons = 0;
  if ("league" in params && "season" in params) {
    const rows = teams.map((team) => ({
      team_id: team.id,
      league_id: params.league,
      season: params.season,
    }));
    const { error } = await supabase.from("team_seasons").upsert(rows, {
      onConflict: "team_id,league_id,season",
    });
    if (error) throw error;
    teamSeasons = rows.length;
  }

  return { teams: teams.length, venues: venues.length, teamSeasons };
}

const REFERENCE_CHECKPOINT = "reference:bootstrap";

export async function bootstrapReferenceData() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("last_run_at, last_status")
    .eq("id", REFERENCE_CHECKPOINT)
    .maybeSingle();
  if (error) throw error;

  await ingestTimezones();
  await ingestSeasons();

  const today = new Date().toISOString().slice(0, 10);
  const lastRun = data?.last_run_at ? String(data.last_run_at).slice(0, 10) : null;
  if (lastRun === today && String(data?.last_status ?? "").startsWith("ok")) {
    console.log("reference bootstrap already stored today");
    return { skipped: true as const };
  }

  const countries = await ingestCountries();
  const leaguesEnvelope = await getLeagues({ current: true });
  if (isEmptyApiResponse(leaguesEnvelope)) {
    console.log("Data Not Yet Available resource=leagues");
    return { skipped: false as const, countries, leagues: { leagues: 0, seasons: 0 }, teams: [] };
  }

  const leagues = await upsertLeagueItems(leaguesEnvelope.response);
  const targets = leaguesEnvelope.response.flatMap((item) => {
    if (!isTargetLeagueId(item.league.id)) return [];
    const season = item.seasons?.find((entry) => entry.current);
    if (!season) return [];
    return [{ leagueId: item.league.id, name: item.league.name, season: season.year }];
  });

  const teams = [];
  for (const target of targets) {
    const result = await ingestTeams({ league: target.leagueId, season: target.season });
    teams.push({ ...target, ...result });
    console.log(`teams ${target.name} ${target.season}: ${result.teams}`);
  }

  const { error: checkpointError } = await supabase.from("ingest_checkpoints").upsert(
    {
      id: REFERENCE_CHECKPOINT,
      resource: "reference",
      params: { countries: countries.count, leagues: leagues.leagues, teams: teams.length },
      last_status: "ok",
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (checkpointError) throw checkpointError;

  return { skipped: false as const, countries, leagues, teams };
}

export async function ingestTeamStatistics(params: GetTeamStatisticsParams) {
  if (!Number.isInteger(params.league) || !Number.isInteger(params.season) || !Number.isInteger(params.team)) {
    console.log("team statistics need league, season, and team");
    return { teamId: params.team, season: params.season };
  }
  if (!isTargetLeagueId(params.league) || !(await knownSeason(params.season))) {
    return { teamId: params.team, season: params.season };
  }
  if (params.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    console.log(`team statistics date must be YYYY-MM-DD`);
    return { teamId: params.team, season: params.season };
  }
  const existing = createAdminClient()
    .from("team_statistics")
    .select("updated_at")
    .eq("team_id", params.team)
    .eq("league_id", params.league)
    .eq("season", params.season);
  const { data: storedStats, error: storedStatsError } = await (params.date
    ? existing.eq("as_of_date", params.date)
    : existing.is("as_of_date", null)
  ).maybeSingle();
  if (storedStatsError) throw storedStatsError;
  if (storedStats && (params.date || isFresh(String(storedStats.updated_at), cadence.teamStatistics))) {
    console.log(`team statistics fresh team=${params.team} league=${params.league} season=${params.season}`);
    return { teamId: params.team, season: params.season };
  }

  const envelope = await getTeamStatistics(params);
  const payload = envelope.response as { form?: string; fixtures?: unknown } | null;
  if (envelope.results === 0 || !payload?.fixtures) {
    console.log(
      `Data Not Yet Available resource=team-statistics team=${params.team} league=${params.league} season=${params.season}`,
    );
    return { teamId: params.team, season: params.season };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("team_statistics").upsert(
    {
      team_id: params.team,
      league_id: params.league,
      season: params.season,
      as_of_date: params.date ?? null,
      form: payload.form ?? null,
      payload,
    },
    { onConflict: "team_id,league_id,season,as_of_date" },
  );
  if (error) throw error;

  return { teamId: params.team, season: params.season };
}

export const FIXTURE_UPSERT_CHUNK = 500;
export const FIXTURE_REQUEST_GAP_MS = 250;
export const TOP_CARDS_REQUEST_GAP_MS = 1_500;
const RATE_LIMIT_WAIT_MS = 65_000;

export async function ingestFixtures(params: GetFixturesParams) {
  if (params.league != null && !isTargetLeagueId(params.league)) {
    return { fixtures: 0, venues: 0, teams: 0 };
  }
  const problem = await fixtureQueryProblem(params);
  if (problem) {
    console.log(problem);
    return { fixtures: 0, venues: 0, teams: 0 };
  }

  const { page: _ignoredPage, timezone: _timezone, ...query } = params;
  const envelope = await getFixtures(query);
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=fixtures");
    return { fixtures: 0, venues: 0, teams: 0 };
  }
  return persistFixtureResponse(envelope.response);
}

export async function ingestHeadToHead(params: {
  h2h: string;
  league?: number;
  season?: number;
  last?: number;
  from?: string;
  to?: string;
  timezone?: string;
}) {
  const pair = parseHeadToHead(params.h2h);
  if (!pair) {
    console.log("h2h must be two team ids separated by a hyphen");
    return { fixtures: 0 };
  }
  if (params.last != null && (params.last < 1 || params.last > 99)) {
    console.log("last must be from 1 to 99");
    return { fixtures: 0 };
  }
  if (params.league != null && !Number.isInteger(params.league)) return { fixtures: 0 };
  if (params.season != null && !(await isKnownSeason(params.season))) {
    console.log(`season ${params.season} is not in /leagues/seasons`);
    return { fixtures: 0 };
  }
  if ((params.from == null) !== (params.to == null)) {
    console.log("from and to must be used together");
    return { fixtures: 0 };
  }
  if ((params.from != null && !FIXTURE_DATE.test(params.from)) || (params.to != null && !FIXTURE_DATE.test(params.to))) {
    console.log("from and to must be YYYY-MM-DD");
    return { fixtures: 0 };
  }
  const { timezone: _timezone, ...query } = params;
  const envelope = await getHeadToHead({
    ...query,
    h2h: `${pair[0]}-${pair[1]}`,
  });
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=headtohead h2h=${pair[0]}-${pair[1]}`);
    return { fixtures: 0 };
  }
  const saved = await persistFixtureResponse(envelope.response);
  return { fixtures: saved.fixtures };
}

function parseHeadToHead(value: string) {
  const parts = value.split("-");
  if (parts.length !== 2) return null;
  const left = Number(parts[0]);
  const right = Number(parts[1]);
  if (!Number.isInteger(left) || !Number.isInteger(right) || left <= 0 || right <= 0 || left === right) return null;
  return [left, right] as const;
}

export async function persistFixtureResponse(response: ApiFootballFixtureItem[]) {
  const supabase = createAdminClient();
  const leagueIds = [...new Set(response.map((item) => item.league?.id).filter((id): id is number => Number.isInteger(id)))];
  if (leagueIds.length > 0) {
    const { data: existing, error: existingError } = await supabase.from("leagues").select("id").in("id", leagueIds);
    if (existingError) throw existingError;
    const known = new Set((existing ?? []).map((row) => Number(row.id)));
    const leagues = uniqueBy(
      response.flatMap((item) =>
        item.league?.id && !known.has(item.league.id) && item.league.name
          ? [{ id: item.league.id, name: item.league.name, logo: item.league.logo ?? leagueLogoUrl(item.league.id) }]
          : [],
      ),
      (league) => league.id,
    );
    if (leagues.length > 0) {
      const { error } = await supabase.from("leagues").upsert(leagues, { onConflict: "id" });
      if (error) throw error;
    }
  }

  const venues = uniqueBy(
    response
      .map((item) => item.fixture.venue)
      .filter((venue): venue is { id: number; name: string | null; city: string | null } =>
        Boolean(venue?.id),
      )
      .map((venue) => ({
        id: venue.id,
        name: venue.name,
        city: venue.city,
      })),
    (venue) => venue.id,
  );

  if (venues.length > 0) {
    const { error } = await supabase.from("venues").upsert(venues, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  const teams = uniqueBy(
    response.flatMap((item) => [item.teams.home, item.teams.away]).flatMap((team) =>
      team?.id
        ? [
            {
              id: team.id,
              name: team.name ?? `Team ${team.id}`,
              logo: team.logo ?? teamLogoUrl(team.id),
            },
          ]
        : [],
    ),
    (team) => team.id,
  );

  if (teams.length > 0) {
    const { error } = await supabase.from("teams").upsert(teams, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  const fixtures = response
    .filter((item) => item.fixture?.id)
    .map((item) => fixtureRow(item));

  for (const chunk of chunkRows(fixtures, FIXTURE_UPSERT_CHUNK)) {
    const { error } = await supabase.from("fixtures").upsert(chunk, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  return { fixtures: fixtures.length, venues: venues.length, teams: teams.length };
}

export async function ingestTargetFixtures() {
  const targets = await historicalTargetLeagueSeasons();

  const ingested: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    fixtures: number;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    error: string;
  }> = [];

  for (const [index, target] of targets.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() =>
        ingestFixtures({
          league: target.leagueId,
          season: target.season,
        }),
      );
      ingested.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        fixtures: result.fixtures,
      });
    } catch (cause) {
      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        error: formatIngestError(cause),
      });
    }
  }

  return { ingested, failed };
}

export async function ingestVenues(params: GetVenuesParams) {
  if (!hasVenueFilter(params)) {
    console.log("venues request needs id, name, city, or country");
    return { venues: 0 };
  }
  if ("country" in params) {
    const matches = await findCountries({ name: params.country });
    if (matches.length === 0) {
      console.log(`Data Not Yet Available resource=venues country=${params.country}`);
      return { venues: 0 };
    }
    params = { country: matches[0].name };
  }
  if ("id" in params) {
    const existing = await storedVenue(params.id);
    if (existing && (existing.capacity != null || existing.address)) {
      console.log(`venue ${params.id} already stored`);
      return { venues: 1 };
    }
  }

  const envelope = await getVenues(params);
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=venues");
    return { venues: 0 };
  }
  const response = envelope.response;
  const supabase = createAdminClient();
  const venues = uniqueBy(
    response
      .filter((venue): venue is ApiFootballVenue & { id: number } => Boolean(venue.id))
      .map((venue) => ({
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        country_name: venue.country ?? null,
        capacity: venue.capacity,
        surface: venue.surface,
        image_url: venue.image,
      })),
    (venue) => venue.id,
  );

  for (const chunk of chunkRows(venues, FIXTURE_UPSERT_CHUNK)) {
    const { error } = await supabase.from("venues").upsert(chunk, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  return { venues: venues.length };
}

export async function ingestTargetVenues() {
  const countries = await targetVenueCountries();
  const ingested: Array<{ country: string; venues: number }> = [];
  const failed: Array<{ country: string; error: string }> = [];

  for (const [index, country] of countries.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() => ingestVenues({ country }));
      ingested.push({ country, venues: result.venues });
    } catch (cause) {
      failed.push({ country, error: formatIngestError(cause) });
    }
  }

  return { ingested, failed };
}

export async function ingestStandings(params: GetStandingsParams) {
  if (params.league != null && !isTargetLeagueId(params.league)) {
    return { standings: 0, groups: 0 };
  }
  if (!(await knownSeason(params.season))) return { standings: 0, groups: 0 };
  if (params.league == null && params.team == null) {
    console.log("standings need a league or a team");
    return { standings: 0, groups: 0 };
  }
  if (
    params.league != null &&
    !(await coverageAllows(params.league, params.season, "standings"))
  ) {
    return { standings: 0, groups: 0 };
  }
  if (await standingsFresh(params.league, params.season, params.team)) {
    console.log(`standings fresh league=${params.league ?? ""} season=${params.season}`);
    return { standings: await standingsCount(params.league, params.season, params.team), groups: 0 };
  }

  const envelope = await getStandings(params);
  if (envelope.results === 0 || envelope.response.length === 0) {
    console.log(`Data Not Yet Available resource=standings league=${params.league ?? ""} season=${params.season}`);
    return { standings: 0, groups: 0 };
  }
  const response = envelope.response;
  const supabase = createAdminClient();
  const rows = response.flatMap((item) => standingRows(item));

  const teams = uniqueBy(
    rows.flatMap((row) =>
      row.team_id
        ? [
            {
              id: row.team_id,
              name: row.team_name,
              logo: row.team_logo ?? teamLogoUrl(row.team_id),
            },
          ]
        : [],
    ),
    (team) => team.id,
  );

  if (teams.length > 0) {
    const { error } = await supabase.from("teams").upsert(teams, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  const standings = uniqueBy(
    rows.map(({ team_name: _teamName, team_logo: _teamLogo, ...row }) => row),
    (row) => `${row.league_id}:${row.season}:${row.group_name}:${row.team_id}`,
  );

  for (const chunk of chunkRows(standings, FIXTURE_UPSERT_CHUNK)) {
    const { error } = await supabase.from("standings").upsert(chunk, {
      onConflict: "league_id,season,group_name,team_id",
    });
    if (error) throw error;
  }

  const groups = uniqueBy(
    standings.map((row) => row.group_name),
    (group) => group,
  );

  return { standings: standings.length, groups: groups.length };
}

async function standingsFresh(leagueId: number | undefined, season: number, teamId: number | undefined) {
  const supabase = createAdminClient();
  let query = supabase.from("standings").select("updated_at").eq("season", season).order("updated_at", { ascending: false }).limit(1);
  if (leagueId != null) query = query.eq("league_id", leagueId);
  if (teamId != null) query = query.eq("team_id", teamId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.updated_at) return false;
  return isFresh(String(data.updated_at), cadence.standings);
}

async function standingsCount(leagueId: number | undefined, season: number, teamId: number | undefined) {
  const supabase = createAdminClient();
  let query = supabase.from("standings").select("team_id", { count: "exact", head: true }).eq("season", season);
  if (leagueId != null) query = query.eq("league_id", leagueId);
  if (teamId != null) query = query.eq("team_id", teamId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function ingestTargetStandings() {
  const targets = await historicalTargetLeagueSeasons();
  const ingested: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    standings: number;
    groups: number;
  }> = [];
  const skipped: Array<{
    leagueId: number;
    name: string;
    season: number;
    reason: string;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    error: string;
  }> = [];

  for (const [index, target] of targets.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() =>
        ingestStandings({
          league: target.leagueId,
          season: target.season,
        }),
      );

      if (result.standings === 0) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: "no standings table",
        });
        continue;
      }

      ingested.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        standings: result.standings,
        groups: result.groups,
      });
    } catch (cause) {
      if (isUnavailableResource(cause)) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: formatIngestError(cause),
        });
        continue;
      }

      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        error: formatIngestError(cause),
      });
    }
  }

  return { ingested, skipped, failed };
}

type PlayerRankKind = "scorer" | "assist" | "yellow" | "red";

async function persistPlayerCatalog(
  items: ApiFootballPlayerItem[],
  params: { league?: number; season: number },
  rankKind?: PlayerRankKind,
  options?: { allCompetitions?: boolean },
) {
  const rows = items.flatMap((item, index) =>
    topScorerRows(
      item,
      params,
      rankKind ? { kind: rankKind, value: index + 1 } : undefined,
      options,
    ),
  );

  const players = uniqueBy(
    rows.map((row) => row.player),
    (player) => player.id,
  );
  await upsertPlayers(players);

  const teams = uniqueBy(
    rows.flatMap((row) => (row.team ? [row.team] : [])),
    (team) => team.id,
  );
  if (teams.length > 0) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("teams").upsert(teams, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  await ensurePlayerLeagues(rows.flatMap((row) => (row.league ? [row.league] : [])));

  const playerTeams = uniqueBy(
    rows.map((row) => ({
      player_id: row.season.player_id,
      team_id: row.season.team_id,
      season: row.season.season,
    })),
    (row) => `${row.player_id}:${row.team_id}:${row.season}`,
  );
  if (playerTeams.length > 0) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("player_teams").upsert(playerTeams, {
      onConflict: "player_id,team_id,season",
    });
    if (error) throw error;
  }

  const seasons = uniqueBy(
    rows.map((row) => row.season),
    (row) => `${row.player_id}:${row.team_id}:${row.league_id}:${row.season}`,
  );
  await upsertPlayerSeasons(seasons);

  return { players: players.length, rows: seasons.length };
}

export class PlayersNotReady extends Error {
  constructor() {
    super("Players not ready");
  }
}

function playerQueryProblem(params: GetPlayersParams) {
  if (params.search != null && params.search.trim().length < 3) {
    return "player search needs at least 3 characters";
  }
  if (!Number.isInteger(params.season)) return "players need a season";
  const id = params.id == null || (Number.isInteger(params.id) && params.id > 0);
  const team = params.team == null || (Number.isInteger(params.team) && params.team > 0);
  const league = params.league == null || (Number.isInteger(params.league) && params.league > 0);
  if (!id || !team || !league) return "players need a season with an id, a league, or a team";
  if (params.id == null && params.league == null && params.team == null) {
    return "players need a season with an id, a league, or a team";
  }
  return null;
}

export async function ingestPlayers(params: GetPlayersParams) {
  const problem = playerQueryProblem(params);
  if (problem) {
    console.log(problem);
    return { players: 0, rows: 0, pages: 0 };
  }
  const season = params.season as number;
  if (params.league != null && !isTargetLeagueId(params.league)) {
    return { players: 0, rows: 0, pages: 0 };
  }
  if (!(await knownSeason(season))) return { players: 0, rows: 0, pages: 0 };
  if (params.league != null && !(await coverageAllows(params.league, season, "players"))) {
    return { players: 0, rows: 0, pages: 0 };
  }

  const envelope = await getPlayersAllPages({
    id: params.id,
    team: params.team,
    league: params.league,
    season,
    search: params.search?.trim(),
  });
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=players league=${params.league ?? ""} season=${season}`);
    return { players: 0, rows: 0, pages: envelope.pagesFetched.length };
  }

  const result = await persistPlayerCatalog(envelope.response, { league: params.league, season }, undefined, {
    allCompetitions: true,
  });
  return { ...result, pages: envelope.pagesFetched.length };
}

export async function ingestTargetPlayers() {
  const targets = await historicalTargetLeagueSeasons();
  const ingested: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    players: number;
    pages: number;
  }> = [];
  const skipped: Array<{
    leagueId: number;
    name: string;
    season: number;
    reason: string;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    error: string;
  }> = [];

  for (const [index, target] of targets.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() =>
        ingestPlayers({
          league: target.leagueId,
          season: target.season,
        }),
      );

      if (result.rows === 0) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: "no players",
        });
        continue;
      }

      ingested.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        players: result.rows,
        pages: result.pages,
      });
    } catch (cause) {
      if (isUnavailableResource(cause)) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: formatIngestError(cause),
        });
        continue;
      }

      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        error: formatIngestError(cause),
      });
    }
  }

  return { ingested, skipped, failed };
}

function rankedListProblem(params: GetTopScorersParams) {
  if (!Number.isInteger(params.league) || params.league <= 0 || !Number.isInteger(params.season)) {
    return "top players need a league and a season";
  }
  return null;
}

async function ingestRankedList(
  params: GetTopScorersParams,
  kind: PlayerRankKind,
  flag: "topScorers" | "topAssists" | "topCards",
  load: (params: GetTopScorersParams) => Promise<{ results: number; response: ApiFootballPlayerItem[] }>,
) {
  const problem = rankedListProblem(params);
  if (problem) {
    console.log(problem);
    return { players: 0, rows: 0 };
  }
  if (!isTargetLeagueId(params.league)) return { players: 0, rows: 0 };
  if (!(await knownSeason(params.season))) return { players: 0, rows: 0 };
  if (!(await coverageAllows(params.league, params.season, flag))) return { players: 0, rows: 0 };

  const envelope = await load(params);
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=${kind} league=${params.league} season=${params.season}`);
    return { players: 0, rows: 0 };
  }

  const result = await persistPlayerCatalog(envelope.response, params, kind);
  await clearStaleRanks(params, kind, rankKeys(envelope.response, params));
  return result;
}

function rankKeys(items: ApiFootballPlayerItem[], params: GetTopScorersParams) {
  return items.flatMap((item) => {
    const playerId = item.player?.id;
    if (!playerId) return [];
    return (item.statistics ?? []).flatMap((stat) =>
      stat.team?.id && stat.league?.id === params.league && (!stat.league.season || stat.league.season === params.season)
        ? [{ playerId, teamId: stat.team.id }]
        : [],
    );
  });
}

async function clearStaleRanks(
  params: GetTopScorersParams,
  kind: PlayerRankKind,
  kept: Array<{ playerId: number; teamId: number }>,
) {
  if (kept.length === 0) return;
  const column =
    kind === "scorer" ? "scorer_rank" : kind === "assist" ? "assist_rank" : kind === "yellow" ? "yellow_rank" : "red_rank";
  const patch =
    kind === "scorer"
      ? { scorer_rank: null }
      : kind === "assist"
        ? { assist_rank: null }
        : kind === "yellow"
          ? { yellow_rank: null }
          : { red_rank: null };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("player_seasons")
    .select("player_id, team_id")
    .eq("league_id", params.league)
    .eq("season", params.season)
    .not(column, "is", null);
  if (error) throw error;
  const keep = new Set(kept.map((row) => `${row.playerId}:${row.teamId}`));
  const stale = (data ?? []).filter((row) => !keep.has(`${row.player_id}:${row.team_id}`));
  for (const row of stale) {
    const { error: updateError } = await supabase
      .from("player_seasons")
      .update(patch)
      .eq("player_id", row.player_id)
      .eq("team_id", row.team_id)
      .eq("league_id", params.league)
      .eq("season", params.season);
    if (updateError) throw updateError;
  }
}

export async function ingestTopScorers(params: GetTopScorersParams) {
  return ingestRankedList(params, "scorer", "topScorers", getTopScorers);
}

export async function ingestTopAssists(params: GetTopScorersParams) {
  return ingestRankedList(params, "assist", "topAssists", getTopAssists);
}

export async function ingestTopYellowCards(params: GetTopScorersParams) {
  return ingestRankedList(params, "yellow", "topCards", getTopYellowCards);
}

export async function ingestTopRedCards(params: GetTopScorersParams) {
  return ingestRankedList(params, "red", "topCards", getTopRedCards);
}

export async function ingestTargetTopCards() {
  const targets = await historicalTargetLeagueSeasons();
  const ingested: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    yellow: number;
    red: number;
  }> = [];
  const skipped: Array<{
    leagueId: number;
    name: string;
    season: number;
    kind: "yellow" | "red";
    reason: string;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    kind: "yellow" | "red";
    error: string;
  }> = [];

  let firstRequest = true;
  const paced = async <T,>(fn: () => Promise<T>) => {
    if (!firstRequest) {
      await sleep(TOP_CARDS_REQUEST_GAP_MS);
    }
    firstRequest = false;
    return withRateLimitRetry(fn);
  };

  for (const target of targets) {
    let yellow = 0;
    let red = 0;

    try {
      const result = await paced(() =>
        ingestTopYellowCards({
          league: target.leagueId,
          season: target.season,
        }),
      );
      if (result.rows === 0) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          kind: "yellow",
          reason: "no top yellow cards",
        });
      } else {
        yellow = result.rows;
      }
    } catch (cause) {
      if (isUnavailableResource(cause)) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          kind: "yellow",
          reason: formatIngestError(cause),
        });
      } else {
        failed.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          kind: "yellow",
          error: formatIngestError(cause),
        });
      }
    }

    try {
      const result = await paced(() =>
        ingestTopRedCards({
          league: target.leagueId,
          season: target.season,
        }),
      );
      if (result.rows === 0) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          kind: "red",
          reason: "no top red cards",
        });
      } else {
        red = result.rows;
      }
    } catch (cause) {
      if (isUnavailableResource(cause)) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          kind: "red",
          reason: formatIngestError(cause),
        });
      } else {
        failed.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          kind: "red",
          error: formatIngestError(cause),
        });
      }
    }

    if (yellow > 0 || red > 0) {
      ingested.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        yellow,
        red,
      });
    }
  }

  return { ingested, skipped, failed };
}

export async function ingestTargetTopScorers() {
  const targets = await historicalTargetLeagueSeasons();
  const ingested: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    players: number;
  }> = [];
  const skipped: Array<{
    leagueId: number;
    name: string;
    season: number;
    reason: string;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    error: string;
  }> = [];

  for (const [index, target] of targets.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() =>
        ingestTopScorers({
          league: target.leagueId,
          season: target.season,
        }),
      );

      if (result.rows === 0) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: "no top scorers",
        });
        continue;
      }

      ingested.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        players: result.rows,
      });
    } catch (cause) {
      if (isUnavailableResource(cause)) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: formatIngestError(cause),
        });
        continue;
      }

      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        error: formatIngestError(cause),
      });
    }
  }

  return { ingested, skipped, failed };
}

export async function ingestPlayerProfiles(params?: GetPlayerProfilesParams) {
  const { response } = await getPlayerProfiles(params);
  const players = uniqueBy(
    response
      .map((item) => item.player)
      .filter((player): player is ApiFootballPlayerProfile => Boolean(player?.id))
      .map(playerProfileRow),
    (player) => player.id,
  );
  await upsertPlayers(players);
  return { players: players.length };
}

export async function ingestTargetPlayerProfiles() {
  const ids = [...(await collectIds([["players", "id"]]))].sort((left, right) => left - right);
  let updated = 0;
  const failed: Array<{ playerId: number; error: string }> = [];

  for (const [index, playerId] of ids.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() =>
        ingestPlayerProfiles({ player: playerId }),
      );
      updated += result.players;
    } catch (cause) {
      if (isUnavailableResource(cause)) continue;
      failed.push({ playerId, error: formatIngestError(cause) });
    }
  }

  return { requested: ids.length, updated, failed };
}

export async function ingestTargetTeams() {
  const targets = await historicalTargetLeagueSeasons();
  const ingested: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    teams: number;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    error: string;
  }> = [];

  for (const [index, target] of targets.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }

    try {
      const result = await withRateLimitRetry(() =>
        ingestTeams({
          league: target.leagueId,
          season: target.season,
        }),
      );
      ingested.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        teams: result.teams,
      });
    } catch (cause) {
      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        error: formatIngestError(cause),
      });
    }
  }

  return { ingested, failed };
}

export async function ingestTargetHistory(depth = TARGET_SEASON_DEPTH) {
  const targets = await historicalTargetLeagueSeasons(depth);
  const teams: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    teams: number;
  }> = [];
  const fixtures: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    fixtures: number;
  }> = [];
  const standings: Array<{
    leagueId: number;
    name: string;
    country: string | null;
    season: number;
    standings: number;
    groups: number;
  }> = [];
  const skipped: Array<{
    leagueId: number;
    name: string;
    season: number;
    reason: string;
  }> = [];
  const failed: Array<{
    leagueId: number;
    name: string;
    season: number;
    stage: "teams" | "fixtures" | "standings";
    error: string;
  }> = [];

  let firstRequest = true;
  const paced = async <T,>(fn: () => Promise<T>) => {
    if (!firstRequest) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }
    firstRequest = false;
    return withRateLimitRetry(fn);
  };

  for (const target of targets) {
    try {
      const result = await paced(() =>
        ingestTeams({
          league: target.leagueId,
          season: target.season,
        }),
      );
      teams.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        teams: result.teams,
      });
    } catch (cause) {
      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        stage: "teams",
        error: formatIngestError(cause),
      });
    }

    try {
      const result = await paced(() =>
        ingestFixtures({
          league: target.leagueId,
          season: target.season,
        }),
      );
      fixtures.push({
        leagueId: target.leagueId,
        name: target.name,
        country: target.country,
        season: target.season,
        fixtures: result.fixtures,
      });
    } catch (cause) {
      failed.push({
        leagueId: target.leagueId,
        name: target.name,
        season: target.season,
        stage: "fixtures",
        error: formatIngestError(cause),
      });
    }

    try {
      const result = await paced(() =>
        ingestStandings({
          league: target.leagueId,
          season: target.season,
        }),
      );
      if (result.standings === 0) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: "no standings table",
        });
      } else {
        standings.push({
          leagueId: target.leagueId,
          name: target.name,
          country: target.country,
          season: target.season,
          standings: result.standings,
          groups: result.groups,
        });
      }
    } catch (cause) {
      if (isUnavailableResource(cause)) {
        skipped.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          reason: formatIngestError(cause),
        });
      } else {
        failed.push({
          leagueId: target.leagueId,
          name: target.name,
          season: target.season,
          stage: "standings",
          error: formatIngestError(cause),
        });
      }
    }
  }

  return { teams, fixtures, standings, skipped, failed };
}

export async function pruneOutOfScope() {
  const supabase = createAdminClient();
  const extraLeagues: Array<{ id: number; name: string }> = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!isTargetLeagueId(row.id)) {
        extraLeagues.push({ id: row.id, name: row.name });
      }
    }
    if (!data || data.length < 1000) break;
  }

  let fixtures = 0;
  for (const league of extraLeagues) {
    fixtures += await deleteByColumn("fixtures", "league_id", league.id);
    const { error } = await supabase.from("leagues").delete().eq("id", league.id);
    if (error) throw error;
  }

  const keepTeamIds = await collectIds([
    ["team_seasons", "team_id"],
    ["fixtures", "home_team_id"],
    ["fixtures", "away_team_id"],
    ["standings", "team_id"],
  ]);
  const teams = await deleteMissingIds("teams", keepTeamIds);

  const keepVenueIds = await collectIds([
    ["teams", "venue_id"],
    ["fixtures", "venue_id"],
  ]);
  const venues = await deleteMissingIds("venues", keepVenueIds);

  return {
    extraLeagues,
    fixtures,
    teams,
    venues,
    keptLeagues: TARGET_LEAGUE_IDS.length,
  };
}

export async function ingestTargetCompetitions() {
  const { response } = await getLeagues();
  const matched = TARGET_COMPETITIONS.map((target) => {
    const league = matchTargetCompetition(target, response);
    return {
      requested: target.aliases?.[0] ?? target.name,
      country: target.country,
      league,
    };
  });

  const found = matched.filter(
    (item): item is typeof item & { league: NonNullable<typeof item.league> } =>
      Boolean(item.league) && isTargetLeagueId(item.league.league.id),
  );
  const missing = matched.filter((item) => !item.league).map((item) => ({
    requested: item.requested,
    country: item.country,
  }));

  if (found.length > 0) {
    await ingestLeaguesFromItems(found.map((item) => item.league));
  }

  const teams: Array<{
    requested: string;
    leagueId: number;
    season: number;
    teams: number;
  }> = [];

  for (const item of found) {
    const season = currentSeasonYear(item.league);
    if (!season) continue;
    const result = await ingestTeams({
      league: item.league.league.id,
      season,
    });
    teams.push({
      requested: item.requested,
      leagueId: item.league.league.id,
      season,
      teams: result.teams,
    });
  }

  return {
    matched: found.map((item) => ({
      requested: item.requested,
      id: item.league.league.id,
      name: item.league.league.name,
      country: item.league.country.name,
      season: currentSeasonYear(item.league),
    })),
    missing,
    teams,
  };
}

async function ingestLeaguesFromItems(
  items: NonNullable<ReturnType<typeof matchTargetCompetition>>[],
) {
  await upsertLeagueItems(items);
}

async function upsertLeagueItems(items: ApiFootballLeague[], targetOnly = true) {
  const unique = Array.from(
    new Map(
      items
        .filter((item) => item.league?.id && (!targetOnly || isTargetLeagueId(item.league.id)))
        .map((item) => [item.league.id, item]),
    ).values(),
  );
  if (unique.length === 0) {
    return { leagues: 0, seasons: 0 };
  }

  const supabase = createAdminClient();

  const countries = Array.from(
    new Map(
      unique
        .filter((item) => item.country?.name)
        .map((item) => [
          item.country.name as string,
          {
            name: item.country.name as string,
            code: item.country.code,
            flag_url: item.country.flag,
          },
        ]),
    ).values(),
  );

  if (countries.length > 0) {
    const { error } = await supabase.from("countries").upsert(countries, {
      onConflict: "name",
    });
    if (error) throw error;
  }

  const leagues = unique.map((item) => {
    const current = (item.seasons ?? []).find((season) => season.current);
    return {
      id: item.league.id,
      name: item.league.name,
      type: item.league.type,
      logo: item.league.logo ?? leagueLogoUrl(item.league.id),
      country_name: item.country?.name ?? null,
      country_code: item.country.code,
      country_flag_url: item.country.flag,
      coverage: current?.coverage ?? null,
    };
  });

  const { error: leaguesError } = await supabase
    .from("leagues")
    .upsert(leagues, { onConflict: "id" });
  if (leaguesError) {
    const missingFlag = /country_flag_url/i.test(leaguesError.message);
    if (!missingFlag) throw leaguesError;
    const withoutFlag = leagues.map(
      ({ country_flag_url: _flag, ...row }) => row,
    );
    const { error: retryError } = await supabase
      .from("leagues")
      .upsert(withoutFlag, { onConflict: "id" });
    if (retryError) throw retryError;
  }

  const seasons = unique.flatMap((item) =>
    (item.seasons ?? []).map((season) => ({
      league_id: item.league.id,
      season: season.year,
      start_date: season.start || null,
      end_date: season.end || null,
      is_current: season.current,
      coverage_events: season.coverage?.fixtures?.events ?? null,
      coverage_lineups: season.coverage?.fixtures?.lineups ?? null,
      coverage_fixture_statistics:
        season.coverage?.fixtures?.statistics_fixtures ?? null,
      coverage_player_statistics:
        season.coverage?.fixtures?.statistics_players ?? null,
      coverage_standings: season.coverage?.standings ?? null,
      coverage_players: season.coverage?.players ?? null,
      coverage_top_scorers: season.coverage?.top_scorers ?? null,
      coverage_top_assists: season.coverage?.top_assists ?? null,
      coverage_top_cards: season.coverage?.top_cards ?? null,
      coverage_injuries: season.coverage?.injuries ?? null,
      coverage_predictions: season.coverage?.predictions ?? null,
      coverage_odds: season.coverage?.odds ?? null,
      coverage: season.coverage ?? {},
    })),
  );

  if (seasons.length > 0) {
    for (let index = 0; index < seasons.length; index += 500) {
      const chunk = seasons.slice(index, index + 500);
      const { error } = await supabase.from("league_seasons").upsert(chunk, {
        onConflict: "league_id,season",
      });
      if (error) throw error;
      console.log(`league seasons ${Math.min(index + 500, seasons.length)}/${seasons.length}`);
    }
  }

  return { leagues: unique.length, seasons: seasons.length };
}

export async function storeLeagueCatalog(items: ApiFootballLeague[]) {
  return upsertLeagueItems(items, false);
}

function fixtureRow(item: ApiFootballFixtureItem) {
  return {
    id: item.fixture.id,
    referee: item.fixture.referee,
    timezone: item.fixture.timezone,
    date: item.fixture.date,
    timestamp: item.fixture.timestamp,
    venue_id: item.fixture.venue?.id || null,
    status_long: item.fixture.status?.long ?? null,
    status_short: item.fixture.status?.short ?? null,
    elapsed: item.fixture.status?.elapsed ?? null,
    league_id: item.league.id,
    season: item.league.season,
    home_team_id: item.teams.home?.id ?? null,
    away_team_id: item.teams.away?.id ?? null,
    home_goals: item.goals?.home ?? null,
    away_goals: item.goals?.away ?? null,
    score: item.score ?? {},
  };
}

function standingRows(item: ApiFootballStandingsItem) {
  const tables = item.league.standings ?? [];
  return tables.flatMap((table, tableIndex) =>
    table.flatMap((row) => {
      if (!row.team?.id) return [];
      return [
        {
          league_id: item.league.id,
          season: item.league.season,
          group_name: row.group || (tables.length > 1 ? `Table ${tableIndex + 1}` : ""),
          team_id: row.team.id,
          team_name: row.team.name,
          team_logo: row.team.logo,
          rank: row.rank,
          points: row.points,
          goals_diff: row.goalsDiff,
          form: row.form,
          status: row.status,
          description: row.description,
          played: row.all?.played ?? null,
          win: row.all?.win ?? null,
          draw: row.all?.draw ?? null,
          lose: row.all?.lose ?? null,
          goals_for: row.all?.goals?.for ?? null,
          goals_against: row.all?.goals?.against ?? null,
          home_played: row.home?.played ?? null,
          home_win: row.home?.win ?? null,
          home_draw: row.home?.draw ?? null,
          home_lose: row.home?.lose ?? null,
          home_goals_for: row.home?.goals?.for ?? null,
          home_goals_against: row.home?.goals?.against ?? null,
          away_played: row.away?.played ?? null,
          away_win: row.away?.win ?? null,
          away_draw: row.away?.draw ?? null,
          away_lose: row.away?.lose ?? null,
          away_goals_for: row.away?.goals?.for ?? null,
          away_goals_against: row.away?.goals?.against ?? null,
          api_updated_at: row.update,
          home: row.home ?? {},
          away: row.away ?? {},
          payload: row,
        },
      ];
    }),
  );
}

function topScorerRows(
  item: ApiFootballPlayerItem,
  params: { league?: number; season: number },
  rank?: { kind: PlayerRankKind; value: number },
  options?: { allCompetitions?: boolean },
) {
  if (!item.player?.id) return [];

  const stats = (item.statistics ?? []).filter((stat) => {
    if (!stat.team?.id || !stat.league?.id) return false;
    if (stat.league.season && stat.league.season !== params.season) return false;
    if (!options?.allCompetitions && stat.league.id !== params.league) return false;
    return true;
  });

  return stats.map((stat) => ({
    league: {
      id: stat.league.id as number,
      name: stat.league.name ?? `League ${stat.league.id}`,
      logo: stat.league.logo ?? leagueLogoUrl(stat.league.id as number),
    },
    player: {
      id: item.player.id,
      name: item.player.name,
      firstname: item.player.firstname,
      lastname: item.player.lastname,
      age: item.player.age,
      birth_date: item.player.birth?.date || null,
      birth_place: item.player.birth?.place ?? null,
      birth_country: item.player.birth?.country ?? null,
      nationality: item.player.nationality,
      height: item.player.height,
      weight: item.player.weight,
      number: item.player.number ?? null,
      position: item.player.position ?? null,
      photo_url: item.player.photo,
      injured: item.player.injured,
    },
    team: stat.team.id
      ? {
          id: stat.team.id,
          name: stat.team.name ?? `Team ${stat.team.id}`,
          logo: stat.team.logo ?? teamLogoUrl(stat.team.id),
        }
      : null,
    season: playerSeasonRow(item.player.id, stat, params, stat.league.id === params.league ? rank : undefined),
  }));
}

async function ensurePlayerLeagues(leagues: Array<{ id: number; name: string; logo: string | null }>) {
  const unique = uniqueBy(leagues, (league) => league.id);
  if (unique.length === 0) return;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("leagues").select("id").in(
    "id",
    unique.map((league) => league.id),
  );
  if (error) throw error;
  const known = new Set((data ?? []).map((row) => Number(row.id)));
  const missing = unique.filter((league) => !known.has(league.id));
  if (missing.length === 0) return;
  const { error: insertError } = await supabase.from("leagues").upsert(missing, { onConflict: "id" });
  if (insertError) throw insertError;
}

function playerSeasonRow(
  playerId: number,
  stat: ApiFootballPlayerStatistic,
  params: { league?: number; season: number },
  rank?: { kind: PlayerRankKind; value: number },
) {
  const leagueId = stat.league?.id ?? params.league;
  return {
    player_id: playerId,
    team_id: stat.team.id as number,
    league_id: leagueId as number,
    season: stat.league?.season ?? params.season,
    ...(rank?.kind === "scorer" ? { scorer_rank: rank.value } : {}),
    ...(rank?.kind === "assist" ? { assist_rank: rank.value } : {}),
    ...(rank?.kind === "yellow" ? { yellow_rank: rank.value } : {}),
    ...(rank?.kind === "red" ? { red_rank: rank.value } : {}),
    position: stat.games?.position ?? null,
    rating: stat.games?.rating ?? null,
    appearances: stat.games?.appearences ?? null,
    lineups: stat.games?.lineups ?? null,
    minutes: stat.games?.minutes ?? null,
    number: stat.games?.number ?? null,
    captain: stat.games?.captain ?? null,
    goals: stat.goals?.total ?? null,
    assists: stat.goals?.assists ?? null,
    shots_total: stat.shots?.total ?? null,
    shots_on: stat.shots?.on ?? null,
    goals_conceded: stat.goals?.conceded ?? null,
    saves: stat.goals?.saves ?? null,
    passes_total: stat.passes?.total ?? null,
    passes_key: stat.passes?.key ?? null,
    passes_accuracy: stat.passes?.accuracy ?? null,
    tackles: stat.tackles?.total ?? null,
    blocks: stat.tackles?.blocks ?? null,
    interceptions: stat.tackles?.interceptions ?? null,
    duels_total: stat.duels?.total ?? null,
    duels_won: stat.duels?.won ?? null,
    dribbles_attempts: stat.dribbles?.attempts ?? null,
    dribbles_success: stat.dribbles?.success ?? null,
    dribbles_past: stat.dribbles?.past ?? null,
    fouls_drawn: stat.fouls?.drawn ?? null,
    fouls_committed: stat.fouls?.committed ?? null,
    yellow_cards: stat.cards?.yellow ?? null,
    yellowred_cards: stat.cards?.yellowred ?? null,
    red_cards: stat.cards?.red ?? null,
    penalty_scored: stat.penalty?.scored ?? null,
    penalty_missed: stat.penalty?.missed ?? null,
    penalty_won: stat.penalty?.won ?? null,
    penalty_committed: stat.penalty?.commited ?? null,
    penalty_saved: stat.penalty?.saved ?? null,
    substitutes_in: stat.substitutes?.in ?? null,
    substitutes_out: stat.substitutes?.out ?? null,
    bench: stat.substitutes?.bench ?? null,
    payload: stat,
  };
}

function playerProfileRow(player: ApiFootballPlayerProfile) {
  return {
    id: player.id,
    name: player.name,
    firstname: player.firstname,
    lastname: player.lastname,
    age: player.age,
    birth_date: player.birth?.date || null,
    birth_place: player.birth?.place ?? null,
    birth_country: player.birth?.country ?? null,
    nationality: player.nationality,
    height: player.height,
    weight: player.weight,
    number: player.number,
    position: player.position,
    photo_url: player.photo,
  };
}

export async function upsertPlayers(
  players: Array<{
    id: number;
    name: string | null;
    firstname: string | null;
    lastname: string | null;
    age: number | null;
    birth_date: string | null;
    birth_place: string | null;
    birth_country: string | null;
    nationality: string | null;
    height: string | null;
    weight: string | null;
    number?: number | null;
    position?: string | null;
    photo_url: string | null;
    injured?: boolean | null;
  }>,
) {
  if (players.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase.from("players").upsert(players, {
    onConflict: "id",
  });
  if (!error) return;
  if (!/column|schema cache/i.test(error.message)) throw error;

  const baseRows = players.map(
    ({ number: _number, position: _position, ...row }) => row,
  );
  const { error: retryError } = await supabase.from("players").upsert(baseRows, {
    onConflict: "id",
  });
  if (retryError) throw retryError;
}

const PLAYER_SEASON_BASE_COLUMNS = [
  "player_id",
  "team_id",
  "league_id",
  "season",
  "position",
  "rating",
  "appearances",
  "minutes",
  "goals",
  "assists",
  "yellow_cards",
  "red_cards",
  "payload",
] as const;

async function upsertPlayerSeasons(
  rows: ReturnType<typeof playerSeasonRow>[],
) {
  if (rows.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase.from("player_seasons").upsert(rows, {
    onConflict: "player_id,team_id,league_id,season",
  });
  if (!error) return;
  if (!/column|schema cache/i.test(error.message)) throw error;

  const baseRows = rows.map((row) =>
    Object.fromEntries(
      PLAYER_SEASON_BASE_COLUMNS.map((column) => [column, row[column]]),
    ),
  );
  const { error: retryError } = await supabase.from("player_seasons").upsert(baseRows, {
    onConflict: "player_id,team_id,league_id,season",
  });
  if (retryError) throw retryError;
}

export function uniqueBy<T>(items: T[], key: (item: T) => string | number) {
  return Array.from(new Map(items.map((item) => [key(item), item])).values());
}

export async function currentTargetLeagueSeasons() {
  const supabase = createAdminClient();
  const pageSize = 1000;
  const rows: Array<{
    league_id: number;
    season: number;
    leagues: { name?: string; country_name?: string } | null;
  }> = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("team_seasons")
      .select("league_id, season, leagues(name, country_name)")
      .order("team_id")
      .order("league_id")
      .order("season")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(
      ...((data ?? []) as Array<{
        league_id: number;
        season: number;
        leagues: { name?: string; country_name?: string } | null;
      }>),
    );
    if (!data || data.length < pageSize) break;
  }

  return uniqueBy(
    rows
      .filter((row) => isTargetLeagueId(row.league_id))
      .map((row) => ({
        leagueId: row.league_id,
        season: row.season,
        name: row.leagues?.name ?? String(row.league_id),
        country: row.leagues?.country_name ?? null,
      })),
    (row) => `${row.leagueId}:${row.season}`,
  );
}

type TargetLeagueSeason = {
  leagueId: number;
  season: number;
  name: string;
  country: string | null;
};

export async function historicalTargetLeagueSeasons(depth = TARGET_SEASON_DEPTH) {
  const current = await currentTargetLeagueSeasons();
  const leagues = uniqueBy(current, (item) => item.leagueId).filter((item) =>
    isTargetLeagueId(item.leagueId),
  );
  const seasonYears = await fetchLeagueSeasonYears(leagues.map((item) => item.leagueId));

  const shortLeagues = leagues.filter(
    (item) => (seasonYears.get(item.leagueId)?.length ?? 0) < depth,
  );
  for (const [index, item] of shortLeagues.entries()) {
    if (index > 0) {
      await sleep(FIXTURE_REQUEST_GAP_MS);
    }
    await withRateLimitRetry(() => ingestLeagues({ id: item.leagueId }));
  }
  if (shortLeagues.length > 0) {
    const refreshed = await fetchLeagueSeasonYears(leagues.map((item) => item.leagueId));
    for (const [leagueId, years] of refreshed) {
      seasonYears.set(leagueId, years);
    }
  }

  const expanded: TargetLeagueSeason[] = [];
  for (const item of leagues) {
    const years = uniqueBy(
      [...(seasonYears.get(item.leagueId) ?? [])]
        .filter((year) => year >= TARGET_SEASON_FROM && year <= TARGET_SEASON_TO)
        .sort((left, right) => right - left),
      (year) => year,
    ).slice(0, depth);
    if (years.length === 0) continue;
    const seasons = years;

    for (const season of seasons) {
      expanded.push({
        leagueId: item.leagueId,
        name: item.name,
        country: item.country,
        season,
      });
    }
  }

  return expanded.sort(
    (left, right) => left.leagueId - right.leagueId || right.season - left.season,
  );
}

async function fetchLeagueSeasonYears(leagueIds: number[]) {
  const supabase = createAdminClient();
  const pageSize = 1000;
  const years = new Map<number, number[]>();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("league_seasons")
      .select("league_id, season")
      .in("league_id", leagueIds)
      .order("league_id")
      .order("season", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    for (const row of data ?? []) {
      const list = years.get(row.league_id as number) ?? [];
      list.push(row.season as number);
      years.set(row.league_id as number, list);
    }
    if (!data || data.length < pageSize) break;
  }

  return years;
}

async function targetVenueCountries() {
  const supabase = createAdminClient();
  const leagueCountries = (await currentTargetLeagueSeasons())
    .map((item) => item.country)
    .filter((country): country is string => Boolean(country));

  const teamCountries: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("teams")
      .select("country_name")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.country_name) teamCountries.push(row.country_name as string);
    }
    if (!data || data.length < pageSize) break;
  }

  return uniqueBy(
    [...leagueCountries, ...teamCountries].filter(
      (country) => country && !WORLD_COUNTRIES.has(country),
    ),
    (country) => country.toLowerCase(),
  ).sort((left, right) => left.localeCompare(right));
}

export function chunkRows<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function formatIngestError(cause: unknown) {
  if (cause instanceof ApiFootballError) {
    return cause.body ? `${cause.message} ${JSON.stringify(cause.body)}` : cause.message;
  }
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

function isRateLimitError(cause: unknown) {
  if (!(cause instanceof ApiFootballError) || !cause.body || typeof cause.body !== "object") {
    return false;
  }
  const errors = (cause.body as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return false;
  }
  return "rateLimit" in errors;
}

export function isUnavailableResource(cause: unknown) {
  if (!(cause instanceof ApiFootballError) || !cause.body || typeof cause.body !== "object") {
    return false;
  }
  const errors = (cause.body as { errors?: unknown }).errors;
  const text = Array.isArray(errors)
    ? errors.join(" ")
    : errors && typeof errors === "object"
      ? Object.values(errors).join(" ")
      : "";
  return /not available|does not exist|no standings/i.test(text);
}

export async function withRateLimitRetry<T>(fn: () => Promise<T>, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (cause) {
      if (cause instanceof ApiFootballQuotaError) throw cause;
      if (!isRateLimitError(cause) || attempt === attempts - 1) {
        throw cause;
      }
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
  throw new Error("Rate limit retry exhausted");
}

async function deleteByColumn(table: string, column: string, value: number) {
  const supabase = createAdminClient();
  let total = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq(column, value)
      .select("id");
    if (error) throw error;
    const count = data?.length ?? 0;
    total += count;
    if (count < 1000) break;
  }
  return total;
}

export async function collectIds(sources: Array<[string, string]>) {
  const supabase = createAdminClient();
  const ids = new Set<number>();
  for (const [table, column] of sources) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .not(column, "is", null)
        .order(column)
        .range(from, from + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        const value = (row as unknown as Record<string, unknown>)[column];
        if (typeof value === "number") ids.add(value);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return ids;
}

async function deleteMissingIds(table: string, keep: Set<number>) {
  const supabase = createAdminClient();
  const orphanIds: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!keep.has(row.id as number)) orphanIds.push(row.id as number);
    }
    if (!data || data.length < 1000) break;
  }

  let deleted = 0;
  for (const chunk of chunkRows(orphanIds, 100)) {
    const { error } = await supabase.from(table).delete().in("id", chunk);
    if (error) throw error;
    deleted += chunk.length;
  }
  return deleted;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
