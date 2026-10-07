import "server-only";
import { createIngestClient as createAdminClient } from "@/utils/supabase/admin";
import {
  API_FOOTBALL_DAILY_RESERVE,
  ApiFootballQuotaError,
  apiFootballGet,
  apiFootballGetAllPages,
  CoverageNotSupported,
  getApiFootballRateLimit,
  isCoverageNotSupported,
  isEmptyApiResponse,
} from "./client";
import { isTargetLeagueId, TARGET_LEAGUE_IDS, TARGET_SEASON_FROM, TARGET_SEASON_TO } from "./competitions";
import { type LiveBetId } from "./bet-catalogs";
import { cadence, isFresh } from "./cadence";
import { coverageAllows } from "./coverage";
import { isKnownTimezone } from "./reference";
import {
  getCoaches,
  getFixtureEvents,
  getFixtureLineups,
  getFixturePlayers,
  getFixtureRounds,
  getFixtureStatistics,
  getInjuries,
  getLiveFixtures,
  getBets,
  getBookmakers,
  getLiveBets,
  getPlayerSquads,
  getPredictions,
  getTransfers,
  getTrophies,
  getSidelined,
  type ApiFootballCoach,
  type ApiFootballFixtureEvent,
  type ApiFootballFixtureItem,
  type ApiFootballFixtureLineup,
  type ApiFootballFixtureStatistic,
  type ApiFootballInjuryItem,
  type ApiFootballLiveOddsItem,
  type ApiFootballOddsItem,
  type ApiFootballPredictionItem,
  type ApiFootballSquadItem,
  type ApiFootballTransferItem,
  type ApiFootballTrophy,
  type ApiFootballSidelined,
} from "./endpoints";
import {
  FIXTURE_REQUEST_GAP_MS,
  TOP_CARDS_REQUEST_GAP_MS,
  chunkRows,
  formatIngestError,
  ingestPlayers,
  PlayersNotReady,
  ingestTeamStatistics,
  ingestTopAssists,
  ingestTopScorers,
  ingestTopRedCards,
  ingestTopYellowCards,
  isUnavailableResource,
  sleep,
  uniqueBy,
  withRateLimitRetry,
} from "./ingest";

const UPSERT_CHUNK = 500;
const ID_BATCH = 20;
const QUOTA_CHECK_EVERY = 250;
const FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
  "1H",
  "2H",
  "HT",
  "ET",
  "BT",
  "P",
  "LIVE",
  "INT",
]);
export class IngestQuotaStop extends Error {
  constructor() {
    super("Stopped to keep an API-Football daily quota reserve");
    this.name = "IngestQuotaStop";
  }
}

export type IngestFailure = {
  id: string;
  error: string;
};

type LeagueSeasonTarget = {
  leagueId: number;
  name: string;
  country: string | null;
  season: number;
  isCurrent: boolean;
  coverageInjuries: boolean;
  coverageOdds: boolean;
  coverageTopScorers: boolean;
  coverageTopCards: boolean;
  coverageEvents: boolean;
  coverageLineups: boolean;
  coverageFixtureStatistics: boolean;
  coveragePlayerStatistics: boolean;
  coveragePredictions: boolean;
};

type TeamSeasonTarget = {
  teamId: number;
  leagueId: number;
  season: number;
};

type FixtureTarget = {
  id: number;
  leagueId: number;
  season: number;
  status: string | null;
  kickoff: string | null;
  current: boolean;
};

let paced = false;
let callsSinceQuotaCheck = 0;

export function isDailyQuota(cause: unknown) {
  return /limit for the day|daily request|reached the request limit/i.test(
    formatIngestError(cause),
  );
}

async function noteApiCall(gap = FIXTURE_REQUEST_GAP_MS) {
  if (paced) await sleep(gap);
  paced = true;
  callsSinceQuotaCheck += 1;
  const { dailyRemaining } = getApiFootballRateLimit();
  const shouldLog =
    callsSinceQuotaCheck >= QUOTA_CHECK_EVERY ||
    (dailyRemaining != null && dailyRemaining < API_FOOTBALL_DAILY_RESERVE);
  if (shouldLog) {
    callsSinceQuotaCheck = 0;
    if (dailyRemaining != null) console.log(`quota remaining: ${dailyRemaining}`);
  }
  if (dailyRemaining != null && dailyRemaining < API_FOOTBALL_DAILY_RESERVE) {
    throw new IngestQuotaStop();
  }
}

async function call<T>(fn: () => Promise<T>, gap = FIXTURE_REQUEST_GAP_MS) {
  await noteApiCall(gap);
  try {
    return await withRateLimitRetry(fn);
  } catch (cause) {
    if (cause instanceof IngestQuotaStop) throw cause;
    if (cause instanceof ApiFootballQuotaError || isDailyQuota(cause)) {
      throw new IngestQuotaStop();
    }
    throw cause;
  }
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function dateOrNull(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function compactRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined && value !== null),
  );
}

async function upsertCompact(
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict: string,
) {
  const cleaned = rows.map(compactRow).filter((row) => Object.keys(row).length > 0);
  if (cleaned.length === 0) return;
  const supabase = createAdminClient();
  for (const chunk of chunkRows(cleaned, UPSERT_CHUNK)) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

async function insertRows(table: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const supabase = createAdminClient();
  for (const chunk of chunkRows(rows, UPSERT_CHUNK)) {
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

async function deleteMatch(
  table: string,
  match: Record<string, string | number>,
  returning: string,
) {
  const supabase = createAdminClient();
  while (true) {
    let query = supabase.from(table).delete();
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query.select(returning);
    if (error) throw error;
    if (!data || data.length < 1000) return;
  }
}

async function deleteIn(table: string, column: string, values: number[]) {
  if (values.length === 0) return;
  const supabase = createAdminClient();
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in(column, values)
      .select("id");
    if (error) throw error;
    if (!data || data.length < 1000) return;
  }
}

async function completedIds(resource: string) {
  const supabase = createAdminClient();
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("ingest_checkpoints")
      .select("id")
      .eq("resource", resource)
      .like("last_status", "ok%")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) ids.add(String(row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function checkpointFresh(id: string, intervalMs: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ingest_checkpoints").select("last_run_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return isFresh(data?.last_run_at ? String(data.last_run_at) : null, intervalMs);
}

async function markOk(
  id: string,
  resource: string,
  params: Record<string, unknown>,
  status = "ok",
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ingest_checkpoints").upsert(
    {
      id,
      resource,
      params,
      last_status: status,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function scopedLeagueSeasons() {
  const supabase = createAdminClient();
  const rows: LeagueSeasonTarget[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("league_seasons")
      .select(
        "league_id, season, is_current, coverage_injuries, coverage_odds, coverage_top_scorers, coverage_top_cards, coverage_events, coverage_lineups, coverage_fixture_statistics, coverage_player_statistics, coverage_predictions, leagues(name, country_name)",
      )
      .order("league_id")
      .order("season", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const season = Number(row.season);
      if (season < TARGET_SEASON_FROM || season > TARGET_SEASON_TO) continue;
      const league = row.leagues as { name?: string; country_name?: string } | null;
      rows.push({
        leagueId: Number(row.league_id),
        name: league?.name ?? String(row.league_id),
        country: league?.country_name ?? null,
        season,
        isCurrent: Boolean(row.is_current),
        coverageInjuries: Boolean(row.coverage_injuries),
        coverageOdds: Boolean(row.coverage_odds),
        coverageTopScorers: Boolean(row.coverage_top_scorers),
        coverageTopCards: Boolean(row.coverage_top_cards),
        coverageEvents: Boolean(row.coverage_events),
        coverageLineups: Boolean(row.coverage_lineups),
        coverageFixtureStatistics: Boolean(row.coverage_fixture_statistics),
        coveragePlayerStatistics: Boolean(row.coverage_player_statistics),
        coveragePredictions: Boolean(row.coverage_predictions),
      });
    }
    if (!data || data.length < 1000) break;
  }

  const byLeague = new Map<number, LeagueSeasonTarget[]>();
  for (const row of rows) {
    const list = byLeague.get(row.leagueId) ?? [];
    list.push(row);
    byLeague.set(row.leagueId, list);
  }

  const scoped: LeagueSeasonTarget[] = [];
  for (const list of byLeague.values()) {
    list.sort((left, right) => right.season - left.season);
    scoped.push(...list);
  }
  return scoped.sort(
    (left, right) => left.leagueId - right.leagueId || right.season - left.season,
  );
}

async function teamSeasonTargets(scope: LeagueSeasonTarget[]) {
  const currentKeys = new Set(
    scope.filter((item) => item.isCurrent).map((item) => `${item.leagueId}:${item.season}`),
  );
  const scopeKeys = new Set(scope.map((item) => `${item.leagueId}:${item.season}`));
  const supabase = createAdminClient();
  const rows: TeamSeasonTarget[] = [];
  const currentTeamIds = new Set<number>();
  const teamIds = new Set<number>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("team_seasons")
      .select("team_id, league_id, season")
      .order("team_id")
      .order("league_id")
      .order("season")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const teamId = Number(row.team_id);
      const leagueId = Number(row.league_id);
      const season = Number(row.season);
      if (!scopeKeys.has(`${leagueId}:${season}`)) continue;
      rows.push({ teamId, leagueId, season });
      teamIds.add(teamId);
      if (currentKeys.has(`${leagueId}:${season}`)) currentTeamIds.add(teamId);
    }
    if (!data || data.length < 1000) break;
  }

  return {
    teamSeasons: rows,
    currentTeamIds: [...currentTeamIds].sort((left, right) => left - right),
    teamIds: [...teamIds].sort((left, right) => left - right),
  };
}

async function loadFixtures(scope: LeagueSeasonTarget[]) {
  const currentKeys = new Set(
    scope.filter((item) => item.isCurrent).map((item) => `${item.leagueId}:${item.season}`),
  );
  const scopeKeys = new Set(scope.map((item) => `${item.leagueId}:${item.season}`));
  const supabase = createAdminClient();
  const fixtures: FixtureTarget[] = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, league_id, season, status_short, date")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const leagueId = Number(row.league_id);
      const season = Number(row.season);
      if (!scopeKeys.has(`${leagueId}:${season}`)) continue;
      fixtures.push({
        id: Number(row.id),
        leagueId,
        season,
        status: row.status_short,
        kickoff: row.date == null ? null : String(row.date),
        current: currentKeys.has(`${leagueId}:${season}`),
      });
    }
    if (!data || data.length < 1000) break;
  }

  return fixtures.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    if (left.season !== right.season) return right.season - left.season;
    return left.id - right.id;
  });
}

function take<T>(items: T[], limit?: number) {
  return limit == null ? items : items.slice(0, limit);
}

async function runStep(
  id: string,
  resource: string,
  params: Record<string, unknown>,
  done: Set<string>,
  failed: IngestFailure[],
  work: () => Promise<string | void>,
) {
  if (done.has(id)) return true;
  try {
    const status = (await work()) ?? "ok";
    await markOk(id, resource, params, status);
    done.add(id);
    return true;
  } catch (cause) {
    if (cause instanceof IngestQuotaStop) throw cause;
    if (cause instanceof PlayersNotReady) return false;
    if (isUnavailableResource(cause)) {
      await markOk(id, resource, params, "ok:unavailable");
      done.add(id);
      return true;
    }
    failed.push({ id, error: formatIngestError(cause) });
    return false;
  }
}

export async function ingestFixtureRounds(limit?: number) {
  const targets = take(await scopedLeagueSeasons(), limit);
  const done = await completedIds("fixture-rounds");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const target of targets) {
    const id = `rounds:${target.leagueId}:${target.season}`;
    const ran = await runStep(id, "fixture-rounds", targetParams(target), done, failed, async () => {
      const envelope = await call(() =>
        getFixtureRounds({
          league: target.leagueId,
          season: target.season,
          dates: true,
        }),
      );
      if (isEmptyApiResponse(envelope)) {
        console.log(
          `Data Not Yet Available resource=rounds league=${target.leagueId} season=${target.season}`,
        );
        return "ok:empty";
      }
      const response = envelope.response;
      const rows = response.flatMap((item) => {
        if (typeof item === "string") {
          return [{ league_id: target.leagueId, season: target.season, round: item, dates: [] }];
        }
        if (!item?.round) return [];
        return [
          {
            league_id: target.leagueId,
            season: target.season,
            round: item.round,
            dates: (item.dates ?? []).map((date) => dateOrNull(date)).filter(Boolean),
          },
        ];
      });
      if (rows.length > 0) {
        await upsertCompact("fixture_rounds", rows, "league_id,season,round");
      }
      return `ok:${rows.length}`;
    });
    if (ran) ingested += 1;
  }

  return { ingested, failed, targets: targets.length };
}

export async function refreshCurrentRound(leagueId: number, season: number) {
  if (!isTargetLeagueId(leagueId)) return null;
  const envelope = await call(() =>
    getFixtureRounds({ league: leagueId, season, current: true }),
  );
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=rounds league=${leagueId} season=${season}`);
    return null;
  }
  const first = envelope.response[0];
  const name = typeof first === "string" ? first : first?.round;
  if (!name) return null;
  const supabase = createAdminClient();
  const { error: clearError } = await supabase
    .from("fixture_rounds")
    .update({ is_current: false })
    .eq("league_id", leagueId)
    .eq("season", season)
    .eq("is_current", true);
  if (clearError) throw clearError;
  const { data, error } = await supabase
    .from("fixture_rounds")
    .update({ is_current: true })
    .eq("league_id", leagueId)
    .eq("season", season)
    .eq("round", name)
    .select("round");
  if (error) throw error;
  if (!data?.length) {
    const { error: insertError } = await supabase.from("fixture_rounds").upsert(
      { league_id: leagueId, season, round: name, dates: [], is_current: true },
      { onConflict: "league_id,season,round" },
    );
    if (insertError) throw insertError;
  }
  console.log(`current round league=${leagueId} season=${season} ${name}`);
  return name;
}

export async function ingestMissingTeamPlayers(limit?: number) {
  const { teamSeasons } = await teamSeasonTargets(await scopedLeagueSeasons());
  const covered = await coveredTeamPlayers();
  const missing = teamSeasons.filter(
    (target) => !covered.has(`${target.teamId}:${target.leagueId}:${target.season}`),
  );
  const targets = take(missing, limit);
  const done = await completedIds("team-players");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, target] of targets.entries()) {
    const id = `team-players:${target.teamId}:${target.leagueId}:${target.season}`;
    const ran = await runStep(id, "team-players", target, done, failed, async () => {
      const result = await call(() =>
        ingestPlayers({
          league: target.leagueId,
          season: target.season,
          team: target.teamId,
        }),
      );
      if (result.rows === 0) throw new PlayersNotReady();
      return `ok:${result.rows}`;
    });
    if (ran) ingested += 1;
    if ((index + 1) % 50 === 0) {
      console.log(`missing players ${index + 1}/${targets.length}`);
    }
  }

  return { ingested, failed, targets: targets.length };
}

async function coveredTeamPlayers() {
  const supabase = createAdminClient();
  const covered = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_seasons")
      .select("player_id, team_id, league_id, season")
      .gte("season", TARGET_SEASON_FROM)
      .lte("season", TARGET_SEASON_TO)
      .order("player_id")
      .order("team_id")
      .order("league_id")
      .order("season")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      covered.add(`${row.team_id}:${row.league_id}:${row.season}`);
    }
    if (!data || data.length < 1000) break;
  }
  return covered;
}

async function allTeamIds() {
  const supabase = createAdminClient();
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("teams")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) ids.push(Number(row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export async function ingestSquads(limit?: number) {
  const teams = take(await allTeamIds(), limit);
  const done = await completedIds("squads");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, teamId] of teams.entries()) {
    const id = `squads:${teamId}`;
    const ran = await runStep(id, "squads", { teamId }, done, failed, async () => {
      const result = await call(() => syncTeamSquad(teamId));
      if (result.players === 0) throw new PlayersNotReady();
      return `ok:${result.players}`;
    });
    if (ran) ingested += 1;
    if ((index + 1) % 50 === 0) console.log(`squads ${index + 1}/${teams.length}`);
  }

  return { ingested, failed, targets: teams.length };
}

export async function syncTeamSquad(teamId: number) {
  if (!Number.isInteger(teamId) || teamId <= 0) {
    console.log("squads need a team id");
    return { players: 0 };
  }
  const storedSquad = createAdminClient()
    .from("squads")
    .select("updated_at")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: squadRow, error: squadFreshError } = await storedSquad;
  if (squadFreshError) throw squadFreshError;
  if (isFresh(squadRow?.updated_at ? String(squadRow.updated_at) : null, cadence.squads)) {
    console.log(`squad fresh team=${teamId}`);
    return { players: 1 };
  }
  const envelope = await getPlayerSquads({ team: teamId });
  const players = (envelope.response ?? []).reduce((sum, item) => sum + (item.players?.length ?? 0), 0);
  if (isEmptyApiResponse(envelope) || players === 0) {
    console.log(`Data Not Yet Available resource=squads team=${teamId}`);
    return { players: 0 };
  }
  await persistSquads(teamId, envelope.response);
  return { players };
}

async function persistSquads(teamId: number, items: ApiFootballSquadItem[]) {
  const players = uniqueBy(
    items.flatMap((item) => item.players.filter((player) => player.id)),
    (player) => player.id,
  );
  await upsertCompact(
    "players",
    players.map((player) => ({
      id: player.id,
      name: player.name,
      age: player.age,
      photo_url: player.photo,
    })),
    "id",
  );
  await upsertCompact(
    "teams",
    items
      .filter((item) => item.team?.id)
      .map((item) => ({
        id: item.team.id,
        name: item.team.name ?? `Team ${item.team.id}`,
        logo: item.team.logo,
      })),
    "id",
  );

  const rows = uniqueBy(
    items.flatMap((item) =>
      item.players.flatMap((player) =>
        player.id
          ? [
              {
                team_id: item.team?.id ?? teamId,
                player_id: player.id,
                number: player.number,
                position: player.position,
              },
            ]
          : [],
      ),
    ),
    (row) => `${row.team_id}:${row.player_id}`,
  );
  if (rows.length === 0) return;
  await deleteMatch("squads", { team_id: teamId }, "team_id");
  await insertRows("squads", rows);
}

export async function ingestTopAssistsCatalog(limit?: number) {
  const targets = take(await scopedLeagueSeasons(), limit);
  const done = await completedIds("top-assists");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, target] of targets.entries()) {
    const id = `top-assists:${target.leagueId}:${target.season}`;
    const ran = await runStep(id, "top-assists", targetParams(target), done, failed, async () => {
      const result = await call(() =>
        ingestTopAssists({ league: target.leagueId, season: target.season }),
      );
      if (result.rows === 0) throw new PlayersNotReady();
      return `ok:${result.rows}`;
    });
    if (ran) ingested += 1;
    if ((index + 1) % 25 === 0) console.log(`top assists ${index + 1}/${targets.length}`);
  }

  return { ingested, failed, targets: targets.length };
}

export async function ingestCoaches(limit?: number) {
  const teams = take(await allTeamIds(), limit);
  const done = await completedIds("coaches");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, teamId] of teams.entries()) {
    const id = `coaches:${teamId}`;
    const ran = await runStep(id, "coaches", { teamId }, done, failed, async () => {
      const result = await call(() => syncCoaches({ team: teamId }));
      if (result.coaches === 0) throw new PlayersNotReady();
      return `ok:${result.current ?? result.coaches}`;
    });
    if (ran) ingested += 1;
    if ((index + 1) % 50 === 0) console.log(`coaches ${index + 1}/${teams.length}`);
  }

  return { ingested, failed, targets: teams.length };
}

function latestCoach(coaches: ApiFootballCoach[], teamId: number | null) {
  const ranked = coaches.map((coach) => {
    const jobs = coach.career.filter((job) => job.team?.id === teamId);
    const openJob = jobs.find((job) => !dateOrNull(job.end));
    const newest = [...jobs].sort((left, right) => (right.start ?? "").localeCompare(left.start ?? ""))[0];
    return {
      coach,
      current: Boolean(openJob),
      start: openJob?.start ?? newest?.start ?? "",
    };
  });
  ranked.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    return right.start.localeCompare(left.start);
  });
  return ranked[0]?.coach ?? null;
}

export async function syncCoaches(params: { id: number } | { team: number } | { search: string }) {
  if ("search" in params && params.search.trim().length < 3) {
    console.log("coach search needs at least 3 characters");
    return { coaches: 0, current: null as number | null };
  }
  if ("id" in params && (!Number.isInteger(params.id) || params.id <= 0)) {
    console.log("coaches need an id, a team, or a search");
    return { coaches: 0, current: null as number | null };
  }
  if ("team" in params && (!Number.isInteger(params.team) || params.team <= 0)) {
    console.log("coaches need an id, a team, or a search");
    return { coaches: 0, current: null as number | null };
  }
  if ("team" in params || "id" in params) {
    const coachQuery = createAdminClient().from("coaches").select("updated_at").order("updated_at", { ascending: false }).limit(1);
    const { data: coachRow, error: coachFreshError } = await ("team" in params
      ? coachQuery.eq("team_id", params.team)
      : coachQuery.eq("id", params.id)
    ).maybeSingle();
    if (coachFreshError) throw coachFreshError;
    if (isFresh(coachRow?.updated_at ? String(coachRow.updated_at) : null, cadence.coaches)) {
      console.log("coach fresh");
      return { coaches: 1, current: "id" in params ? params.id : null };
    }
  }
  const query = "search" in params ? { search: params.search.trim() } : params;
  const envelope = await getCoaches(query);
  if (isEmptyApiResponse(envelope)) {
    const label = "id" in params ? `id=${params.id}` : "team" in params ? `team=${params.team}` : `search=${params.search.trim()}`;
    console.log(`Data Not Yet Available resource=coachs ${label}`);
    return { coaches: 0, current: null as number | null };
  }
  const teamId = "team" in params ? params.team : null;
  const current = await persistCoaches(teamId, envelope.response);
  return { coaches: envelope.response.length, current };
}

async function persistCoaches(teamId: number | null, coaches: ApiFootballCoach[]) {
  const current = latestCoach(coaches, teamId);
  const teams = uniqueBy(
    coaches.flatMap((coach) => [
      ...(coach.team?.id
        ? [{ id: coach.team.id, name: coach.team.name ?? `Team ${coach.team.id}`, logo: coach.team.logo }]
        : []),
      ...coach.career.flatMap((job) =>
        job.team?.id
          ? [{ id: job.team.id, name: job.team.name ?? `Team ${job.team.id}`, logo: job.team.logo }]
          : [],
      ),
    ]),
    (team) => team.id,
  );
  await upsertCompact("teams", teams, "id");
  await upsertCompact(
    "coaches",
    coaches.map((coach) => ({
      id: coach.id,
      name: coach.name,
      firstname: coach.firstname,
      lastname: coach.lastname,
      age: coach.age,
      nationality: coach.nationality,
      photo_url: coach.photo ?? `https://media.api-sports.io/football/coachs/${coach.id}.png`,
      birth_date: dateOrNull(coach.birth?.date),
      birth_place: coach.birth?.place,
      birth_country: coach.birth?.country,
    })),
    "id",
  );
  const supabase = createAdminClient();
  for (const coach of coaches) {
    const clubId = coach.team?.id ?? (current?.id === coach.id ? teamId : null);
    if (!clubId) continue;
    const { error: clearError } = await supabase.from("coaches").update({ team_id: null }).eq("team_id", clubId).neq("id", coach.id);
    if (clearError) throw clearError;
    const { error: currentError } = await supabase.from("coaches").update({ team_id: clubId }).eq("id", coach.id);
    if (currentError) throw currentError;
  }

  for (const coach of coaches) {
    if (coach.career.length === 0) continue;
    await deleteMatch("coach_career", { coach_id: coach.id }, "id");
    await insertRows(
      "coach_career",
      coach.career.map((job) => ({
        coach_id: coach.id,
        team_id: job.team?.id ?? null,
        team_name: job.team?.name ?? null,
        start_date: dateOrNull(job.start),
        end_date: dateOrNull(job.end),
      })),
    );
  }
  return current?.id ?? coaches.find((coach) => coach.team?.id)?.id ?? coaches[0]?.id ?? null;
}

export async function ingestTransfers(limit?: number) {
  const { teamIds } = await teamSeasonTargets(await scopedLeagueSeasons());
  const teams = take(teamIds, limit);
  const done = await completedIds("transfers");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, teamId] of teams.entries()) {
    const id = `transfers:${teamId}`;
    const ran = await runStep(id, "transfers", { teamId }, done, failed, async () => {
      const result = await call(() => syncTransfers({ team: teamId }));
      if (result.moves === 0) throw new PlayersNotReady();
      return `ok:${result.moves}`;
    });
    if (ran) ingested += 1;
    if ((index + 1) % 50 === 0) console.log(`transfers ${index + 1}/${teams.length}`);
  }

  return { ingested, failed, targets: teams.length };
}

export async function syncTransfers(params: { player: number } | { team: number }) {
  const id = "player" in params ? params.player : params.team;
  const kind = "player" in params ? "player" : "team";
  if (!Number.isInteger(id) || id <= 0) {
    console.log("transfers need a player or a team");
    return { moves: 0 };
  }
  const envelope = await getTransfers(params);
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=transfers ${kind}=${id}`);
    return { moves: 0 };
  }
  const moves = await persistTransfers(envelope.response);
  return { moves };
}

async function persistTransfers(items: ApiFootballTransferItem[]) {
  const players = uniqueBy(
    items.filter((item) => item.player?.id).map((item) => item.player),
    (player) => player.id as number,
  );
  const teams = uniqueBy(
    items.flatMap((item) =>
      item.transfers.flatMap((move) => [move.teams.in, move.teams.out]),
    ).flatMap((team) =>
      team?.id
        ? [{ id: team.id, name: team.name ?? `Team ${team.id}`, logo: team.logo }]
        : [],
    ),
    (team) => team.id,
  );
  await upsertCompact(
    "players",
    players.map((player) => ({ id: player.id, name: player.name })),
    "id",
  );
  await upsertCompact("teams", teams, "id");

  const ready = items.filter((item) => item.player?.id && item.transfers.length > 0);
  for (const item of items) {
    if (item.player?.id && item.transfers.length === 0) {
      console.log(`Data Not Yet Available resource=transfers player=${item.player.id}`);
    }
  }
  const playerIds = ready.map((item) => item.player.id as number);
  await deleteIn("transfers", "player_id", playerIds);
  const rows = ready.flatMap((item) =>
    item.transfers.map((move) => ({
      player_id: item.player.id,
      date: dateOrNull(move.date),
      type: move.type,
      team_in_id: move.teams.in?.id ?? null,
      team_out_id: move.teams.out?.id ?? null,
    })),
  );
  await insertRows("transfers", rows);
  return rows.length;
}

const INJURY_FRESH_MS = cadence.injuries;
const INJURY_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type InjuryQuery = {
  league?: number;
  season?: number;
  fixture?: number;
  team?: number;
  player?: number;
  date?: string;
  timezone?: string;
};

export async function syncInjuries(params: InjuryQuery) {
  const problem = await injuryQueryProblem(params);
  if (problem) {
    console.log(problem);
    return { injuries: 0 };
  }
  if (params.league != null && params.season != null) {
    if (!isTargetLeagueId(params.league)) return { injuries: 0 };
    if (!(await coverageAllows(params.league, params.season, "injuries"))) return { injuries: 0 };
  }
  if (params.fixture != null && !(await fixtureInjuriesCovered(params.fixture))) return { injuries: 0 };
  if (await injuriesFresh(params)) {
    console.log("injuries fresh");
    return { injuries: await injuriesCount(params) };
  }

  const envelope = await getInjuries({
    league: params.league,
    season: params.season,
    fixture: params.fixture,
    team: params.team,
    player: params.player,
    date: params.date,
  });
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=injuries ${injuryLabel(params)}`);
    return { injuries: 0 };
  }
  const count = await persistInjuries(envelope.response, params);
  return { injuries: count };
}

async function injuryQueryProblem(params: InjuryQuery) {
  if (params.timezone != null && !(await isKnownTimezone(params.timezone))) return `timezone ${params.timezone} is not stored`;
  if (params.date != null && !INJURY_DATE.test(params.date)) return "injury date must be YYYY-MM-DD";
  for (const [name, value] of [
    ["league", params.league],
    ["season", params.season],
    ["fixture", params.fixture],
    ["team", params.team],
    ["player", params.player],
  ] as const) {
    if (value != null && (!Number.isInteger(value) || value <= 0)) return `injuries need a valid ${name}`;
  }
  if ((params.league == null) !== (params.season == null)) return "injuries need a league and a season together";
  if (params.fixture == null && params.team == null && params.player == null && params.date == null && params.league == null) {
    return "injuries need a league and season, a fixture, a team, a player, or a date";
  }
  return null;
}

async function fixtureInjuriesCovered(fixtureId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("fixtures").select("league_id, season").eq("id", fixtureId).maybeSingle();
  if (error) throw error;
  if (!data) return true;
  return coverageAllows(Number(data.league_id), Number(data.season), "injuries");
}

async function injuriesFresh(params: InjuryQuery) {
  const newest = await newestInjury(params);
  if (!newest) return false;
  return Date.now() - new Date(newest).getTime() < INJURY_FRESH_MS;
}

async function newestInjury(params: InjuryQuery) {
  const supabase = createAdminClient();
  let query = supabase.from("injuries").select("updated_at").order("updated_at", { ascending: false }).limit(1);
  if (params.fixture != null) query = query.eq("fixture_id", params.fixture);
  else if (params.player != null) query = query.eq("player_id", params.player);
  else if (params.team != null) query = query.eq("team_id", params.team);
  else if (params.league != null && params.season != null) query = query.eq("league_id", params.league).eq("season", params.season);
  else if (params.date != null) {
    const ids = await fixtureIdsOnDate(params.date);
    if (ids.length === 0) return null;
    query = query.in("fixture_id", ids);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.updated_at ? String(data.updated_at) : null;
}

async function injuriesCount(params: InjuryQuery) {
  const supabase = createAdminClient();
  let query = supabase.from("injuries").select("id", { count: "exact", head: true });
  if (params.fixture != null) query = query.eq("fixture_id", params.fixture);
  else if (params.player != null) query = query.eq("player_id", params.player);
  else if (params.team != null) query = query.eq("team_id", params.team);
  else if (params.league != null && params.season != null) query = query.eq("league_id", params.league).eq("season", params.season);
  else if (params.date != null) {
    const ids = await fixtureIdsOnDate(params.date);
    if (ids.length === 0) return 0;
    query = query.in("fixture_id", ids);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fixtureIdsOnDate(date: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id")
    .gte("date", `${date}T00:00:00`)
    .lt("date", `${date}T23:59:59.999`);
  if (error) throw error;
  return (data ?? []).map((row) => Number(row.id));
}

function injuryLabel(params: InjuryQuery) {
  if (params.fixture != null) return `fixture=${params.fixture}`;
  if (params.player != null) return `player=${params.player}`;
  if (params.team != null) return `team=${params.team}`;
  if (params.date != null) return `date=${params.date}`;
  return `league=${params.league ?? ""} season=${params.season ?? ""}`;
}

export async function ingestInjuries(limit?: number) {
  const scope = await scopedLeagueSeasons();
  const targets = take(
    scope.filter((item) => item.coverageInjuries),
    limit,
  );
  const uncovered = scope.length - scope.filter((item) => item.coverageInjuries).length;
  if (uncovered > 0) console.log(`coverage off injuries for ${uncovered} league seasons`);
  const done = await completedIds("injuries");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const target of targets) {
    const id = `injuries:${target.leagueId}:${target.season}`;
    const ran = await runStep(id, "injuries", targetParams(target), done, failed, async () => {
      const result = await call(() =>
        syncInjuries({ league: target.leagueId, season: target.season }),
      );
      if (result.injuries === 0) throw new PlayersNotReady();
      return `ok:${result.injuries}`;
    });
    if (ran) ingested += 1;
  }

  return { ingested, failed, targets: targets.length };
}

async function persistInjuries(items: ApiFootballInjuryItem[], params: InjuryQuery) {
  if (items.length === 0) return 0;
  const fixtureIds = await knownIds(
    "fixtures",
    items.flatMap((item) => (item.fixture?.id ? [item.fixture.id] : params.fixture != null ? [params.fixture] : [])),
  );
  const leagueIds = await knownIds(
    "leagues",
    items.flatMap((item) => (item.league?.id ? [item.league.id] : params.league != null ? [params.league] : [])),
  );
  await upsertCompact(
    "players",
    uniqueBy(
      items.flatMap((item) =>
        item.player?.id ? [{ id: item.player.id, name: item.player.name, photo_url: item.player.photo }] : [],
      ),
      (player) => player.id,
    ),
    "id",
  );
  await upsertCompact(
    "teams",
    uniqueBy(
      items.flatMap((item) =>
        item.team?.id
          ? [{ id: item.team.id, name: item.team.name ?? `Team ${item.team.id}`, logo: item.team.logo }]
          : [],
      ),
      (team) => team.id,
    ),
    "id",
  );

  await replaceInjuryScope(params, [...fixtureIds]);
  const rows = items.map((item) => ({
    fixture_id: item.fixture?.id && fixtureIds.has(item.fixture.id) ? item.fixture.id : params.fixture != null && fixtureIds.has(params.fixture) ? params.fixture : null,
    league_id: item.league?.id && leagueIds.has(item.league.id) ? item.league.id : params.league != null && leagueIds.has(params.league) ? params.league : null,
    season: item.league?.season ?? params.season ?? null,
    team_id: item.team?.id ?? null,
    player_id: item.player?.id ?? null,
    type: item.player?.type ?? null,
    reason: item.player?.reason ?? null,
  }));
  await insertRows("injuries", rows);
  return rows.length;
}

async function knownIds(table: "fixtures" | "leagues", ids: number[]) {
  const unique = [...new Set(ids)];
  const known = new Set<number>();
  if (unique.length === 0) return known;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from(table).select("id").in("id", unique);
  if (error) throw error;
  for (const row of data ?? []) known.add(Number(row.id));
  return known;
}

async function replaceInjuryScope(params: InjuryQuery, knownFixtures: number[]) {
  if (params.fixture != null) {
    await deleteMatch("injuries", { fixture_id: params.fixture }, "id");
    return;
  }
  if (params.player != null) {
    await deleteMatch("injuries", { player_id: params.player }, "id");
    return;
  }
  if (params.team != null) {
    await deleteMatch("injuries", { team_id: params.team }, "id");
    return;
  }
  if (params.league != null && params.season != null) {
    await deleteMatch("injuries", { league_id: params.league, season: params.season }, "id");
    return;
  }
  for (const fixtureId of knownFixtures) {
    await deleteMatch("injuries", { fixture_id: fixtureId }, "id");
  }
}

const ODDS_CATALOG_CHECKPOINT = "odds:catalogs";

export async function findOddsCatalog(
  catalog: "bookmakers" | "bets" | "liveBets",
  params: { id?: number; search?: string },
) {
  const search = params.search?.trim().replace(/[%_]/g, "") ?? "";
  if ((params.id == null || !Number.isInteger(params.id) || params.id <= 0) && search.length === 0) {
    console.log("catalog lookup needs an id or a search");
    return [];
  }
  const table = catalog === "bookmakers" ? "bookmakers" : catalog === "bets" ? "bets" : "live_bets";
  const supabase = createAdminClient();
  let query = supabase.from(table).select("id, name").order("name").limit(50);
  if (params.id != null && Number.isInteger(params.id) && params.id > 0) query = query.eq("id", params.id);
  if (search.length > 0) query = query.ilike("name", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: Number(row.id), name: row.name }));
}

export async function syncOddsCatalogs() {
  if (await oddsCatalogsFresh()) {
    console.log("odds catalogs already stored");
    const counts = await oddsCatalogCounts();
    return { skipped: true, ...counts };
  }

  const bookmakers = await refreshOddsCatalog("bookmakers", () => getBookmakers(), "bookmakers");
  const bets = await refreshOddsCatalog("bets", () => getBets(), "bets");
  const liveBets = await refreshOddsCatalog("live_bets", () => getLiveBets(), "live-bets");
  if (bookmakers + bets + liveBets > 0) {
    await markOk(ODDS_CATALOG_CHECKPOINT, "odds-catalogs", {}, `ok:${bookmakers}/${bets}/${liveBets}`);
  }
  return { skipped: false, bookmakers, bets, liveBets };
}

async function oddsCatalogsFresh() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("last_run_at, last_status")
    .eq("id", ODDS_CATALOG_CHECKPOINT)
    .maybeSingle();
  if (error) throw error;
  return isFresh(data?.last_run_at ? String(data.last_run_at) : null, cadence.oddsCatalogs) && String(data?.last_status ?? "").startsWith("ok");
}

async function oddsCatalogCounts() {
  const supabase = createAdminClient();
  const [bookmakers, bets, liveBets] = await Promise.all([
    supabase.from("bookmakers").select("id", { count: "exact", head: true }),
    supabase.from("bets").select("id", { count: "exact", head: true }),
    supabase.from("live_bets").select("id", { count: "exact", head: true }),
  ]);
  if (bookmakers.error) throw bookmakers.error;
  if (bets.error) throw bets.error;
  if (liveBets.error) throw liveBets.error;
  return { bookmakers: bookmakers.count ?? 0, bets: bets.count ?? 0, liveBets: liveBets.count ?? 0 };
}

async function refreshOddsCatalog(
  table: "bookmakers" | "bets" | "live_bets",
  load: () => Promise<{ results: number; response: Array<{ id: number; name: string | null }> }>,
  resource: string,
) {
  const envelope = await load();
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=${resource}`);
    return 0;
  }
  const rows = uniqueBy(
    envelope.response.flatMap((item) => (item.id && item.name ? [{ id: item.id, name: item.name }] : [])),
    (item) => item.id,
  );
  if (rows.length === 0) {
    console.log(`Data Not Yet Available resource=${resource}`);
    return 0;
  }
  await upsertCompact(table, rows, "id");
  return rows.length;
}

export async function ingestPrematchOdds(limit?: number) {
  console.log("API-Football prematch odds ingest is disabled. Odds-API.io is the only odds source.");
  void limit;
  return { ingested: 0, failed: [] as IngestFailure[], targets: 0 };
}

async function oddsResumePage(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("last_status, params")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.last_status?.startsWith("partial")) return 1;
  const page = asNumber((data.params as { page?: unknown } | null)?.page);
  return page ? page + 1 : 1;
}

async function allFixtureIds() {
  const supabase = createAdminClient();
  const ids = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) ids.add(Number(row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export type OddsDrop = {
  key: string;
  reason: string;
};

const ODDS_FRESH_MS = cadence.odds;
const ODDS_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
const ODDS_LEAD_MS = 14 * 24 * 60 * 60 * 1000;

export type FixtureOddsSync = {
  fixtureId: number;
  flag: "Data Not Yet Available" | "fresh" | "outside window" | null;
  pagesFetched: number[];
  pageSizes: number[];
  pagingTotal: number;
  apiRows: number;
  stored: number;
  dropped: OddsDrop[];
  keys: string[];
};

function oddsWindowProblem(kickoff: string | null) {
  if (!kickoff) return "odds need a kickoff";
  const at = new Date(kickoff).getTime();
  if (!Number.isFinite(at)) return "odds need a kickoff";
  const now = Date.now();
  if (at < now - ODDS_HISTORY_MS) return "odds history is only kept for 7 days";
  if (at > now + ODDS_LEAD_MS) return "odds are not available more than 14 days before kickoff";
  return null;
}

async function oddsFresh(fixtureId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("last_run_at")
    .eq("id", `odds:fixture:${fixtureId}`)
    .maybeSingle();
  if (error) throw error;
  if (!data?.last_run_at) return false;
  return Date.now() - new Date(String(data.last_run_at)).getTime() < ODDS_FRESH_MS;
}

function emptyOddsSync(
  fixtureId: number,
  flag: FixtureOddsSync["flag"],
  pagesFetched: number[] = [],
  pageSizes: number[] = [],
  pagingTotal = 0,
): FixtureOddsSync {
  return {
    fixtureId,
    flag,
    pagesFetched,
    pageSizes,
    pagingTotal,
    apiRows: 0,
    stored: 0,
    dropped: [],
    keys: [],
  };
}

function logOddsDrops(dropped: OddsDrop[]) {
  for (const drop of dropped) {
    console.log(`odds dropped ${drop.key}: ${drop.reason}`);
  }
}

export async function storePrematchOdds(items: ApiFootballOddsItem[]) {
  console.log("API-Football prematch odds store is disabled. Odds-API.io is the only odds source.");
  void items;
  return { stored: 0, apiRows: 0, dropped: [] as OddsDrop[], keys: [] as string[] };
}

async function persistOdds(items: ApiFootballOddsItem[], knownFixtures: Set<number>) {
  if (items.length === 0) {
    return { apiRows: 0, stored: 0, dropped: [] as OddsDrop[], keys: [] as string[] };
  }

  const bookmakers = uniqueBy(
    items.flatMap((item) =>
      item.bookmakers.map((bookmaker) => ({ id: bookmaker.id, name: bookmaker.name })),
    ),
    (bookmaker) => bookmaker.id,
  );
  const bets = uniqueBy(
    items.flatMap((item) =>
      item.bookmakers.flatMap((bookmaker) =>
        bookmaker.bets.map((bet) => ({ id: bet.id, name: bet.name })),
      ),
    ),
    (bet) => bet.id,
  );
  await upsertCompact("bookmakers", bookmakers, "id");
  await upsertCompact("bets", bets, "id");

  const capturedAt = new Date().toISOString();
  const dropped: OddsDrop[] = [];
  let apiRows = 0;
  const byKey = new Map<string, {
    fixture_id: number;
    bookmaker_id: number;
    market_id: number;
    market_name: string | null;
    values: Array<{ value: string; odd: number | null }>;
    update_at: string;
    captured_at: string;
  }>();

  for (const item of items) {
    if (!knownFixtures.has(item.fixture.id)) {
      dropped.push({ key: String(item.fixture.id), reason: "fixture is not in the sync set" });
      continue;
    }
    for (const bookmaker of item.bookmakers ?? []) {
      for (const bet of bookmaker.bets ?? []) {
        const key = `${item.fixture.id}:${bookmaker.id}:${bet.id}`;
        if (bookmaker.id == null || bet.id == null) {
          dropped.push({ key, reason: "missing bookmaker or market id" });
          continue;
        }
        const selections = new Map<string, { value: string; odd: number | null }>();
        for (const price of bet.values ?? []) {
          apiRows += 1;
          const selection = price.value == null ? "" : String(price.value).trim();
          if (selection === "") {
            dropped.push({ key, reason: "empty selection" });
            continue;
          }
          selections.set(selection, { value: selection, odd: asNumber(price.odd) });
        }
        if (selections.size === 0) continue;
        byKey.set(key, {
          fixture_id: item.fixture.id,
          bookmaker_id: bookmaker.id,
          market_id: bet.id,
          market_name: bet.name ?? null,
          values: [...selections.values()],
          update_at: item.update ?? capturedAt,
          captured_at: item.update ?? capturedAt,
        });
      }
    }
  }

  const rows = [...byKey.values()];
  await upsertCompact("odds", rows, "fixture_id,bookmaker_id,market_id");
  return { apiRows, stored: rows.length, dropped, keys: [...byKey.keys()] };
}

export async function syncFixtureOdds(fixtureId: number): Promise<FixtureOddsSync> {
  console.log("API-Football fixture odds ingest is disabled. Odds-API.io is the only odds source.");
  return emptyOddsSync(fixtureId, "outside window");
}

export async function refreshPrematchOdds(fixtureIds: number[]) {
  console.log("API-Football prematch odds refresh is disabled. Odds-API.io is the only odds source.");
  void fixtureIds;
  return { requested: 0, updated: 0, stored: 0, failed: [] as number[], unavailable: [] as number[] };
}

export async function ingestTeamStatisticsCatalog(limit?: number) {
  const { teamSeasons } = await teamSeasonTargets(await scopedLeagueSeasons());
  const targets = take(teamSeasons, limit);
  const done = await completedIds("team-statistics");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, target] of targets.entries()) {
    const id = `team-statistics:${target.teamId}:${target.leagueId}:${target.season}`;
    const ran = await runStep(
      id,
      "team-statistics",
      target,
      done,
      failed,
      async () => {
        await call(() =>
          ingestTeamStatistics({
            team: target.teamId,
            league: target.leagueId,
            season: target.season,
          }),
        );
        return "ok";
      },
    );
    if (ran) ingested += 1;
    if ((index + 1) % 50 === 0) {
      console.log(`team statistics ${index + 1}/${targets.length}`);
    }
  }

  return { ingested, failed, targets: targets.length };
}

type TrophyGroup = {
  id: number;
  trophies: ApiFootballTrophy[];
};

type SidelinedGroup = {
  id: number;
  sidelined: ApiFootballSidelined[];
};

export async function syncTrophies(params: { player: number } | { coach: number }) {
  const id = "player" in params ? params.player : params.coach;
  const column = "player" in params ? "player_id" : "coach_id";
  if (!Number.isInteger(id) || id <= 0) {
    console.log("trophies need a player or a coach");
    return { trophies: 0 };
  }
  const envelope = await getTrophies(params);
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=trophies ${column}=${id}`);
    return { trophies: 0 };
  }
  const rows = envelope.response.map((trophy) => ({
    [column]: id,
    league_name: trophy.league,
    country: trophy.country,
    season: trophy.season,
    place: trophy.place,
  }));
  await deleteIn("trophies", column, [id]);
  await insertRows("trophies", rows);
  return { trophies: rows.length };
}

export async function ingestPlayerTrophies(limit?: number) {
  return ingestGroupedCareer({
    resource: "trophies-players",
    idPrefix: "trophies:player",
    column: "player_id",
    people: await playerIds(),
    limit,
    path: "/trophies",
    queryKey: "players",
    groupKey: "trophies",
    table: "trophies",
    mapRow: (personId, trophy: ApiFootballTrophy) => ({
      player_id: personId,
      league_name: trophy.league,
      country: trophy.country,
      season: trophy.season,
      place: trophy.place,
    }),
  });
}

export async function syncSidelined(params: { player: number } | { coach: number }) {
  const id = "player" in params ? params.player : params.coach;
  const column = "player" in params ? "player_id" : "coach_id";
  if (!Number.isInteger(id) || id <= 0) {
    console.log("sidelined needs a player or a coach");
    return { spells: 0 };
  }
  const envelope = await getSidelined(params);
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available resource=sidelined ${column}=${id}`);
    return { spells: 0 };
  }
  const rows = envelope.response.map((item) => ({
    [column]: id,
    type: item.type,
    start_date: dateOrNull(item.start),
    end_date: item.end,
  }));
  await deleteIn("sidelined", column, [id]);
  await insertRows("sidelined", rows);
  return { spells: rows.length };
}

export async function ingestPlayerSidelined(limit?: number) {
  return ingestGroupedCareer({
    resource: "sidelined-players",
    idPrefix: "sidelined:player",
    column: "player_id",
    people: await playerIds(),
    limit,
    path: "/sidelined",
    queryKey: "players",
    groupKey: "sidelined",
    table: "sidelined",
    mapRow: (personId, item: ApiFootballSidelined) => ({
      player_id: personId,
      type: item.type,
      start_date: dateOrNull(item.start),
      end_date: item.end,
    }),
  });
}

export async function ingestCoachTrophies(limit?: number) {
  return ingestGroupedCareer({
    resource: "trophies-coaches",
    idPrefix: "trophies:coach",
    column: "coach_id",
    people: await coachIds(),
    limit,
    path: "/trophies",
    queryKey: "coachs",
    groupKey: "trophies",
    table: "trophies",
    mapRow: (personId, trophy: ApiFootballTrophy) => ({
      coach_id: personId,
      league_name: trophy.league,
      country: trophy.country,
      season: trophy.season,
      place: trophy.place,
    }),
  });
}

export async function ingestCoachSidelined(limit?: number) {
  return ingestGroupedCareer({
    resource: "sidelined-coaches",
    idPrefix: "sidelined:coach",
    column: "coach_id",
    people: await coachIds(),
    limit,
    path: "/sidelined",
    queryKey: "coachs",
    groupKey: "sidelined",
    table: "sidelined",
    mapRow: (personId, item: ApiFootballSidelined) => ({
      coach_id: personId,
      type: item.type,
      start_date: dateOrNull(item.start),
      end_date: item.end,
    }),
  });
}

async function ingestGroupedCareer<T>(options: {
  resource: string;
  idPrefix: string;
  column: "player_id" | "coach_id";
  people: number[];
  limit?: number;
  path: string;
  queryKey: "players" | "coachs";
  groupKey: "trophies" | "sidelined";
  table: "trophies" | "sidelined";
  mapRow: (personId: number, item: T) => Record<string, unknown>;
}) {
  const batches = take(chunkRows(options.people, ID_BATCH), options.limit);
  const done = await completedIds(options.resource);
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, batch] of batches.entries()) {
    const pending = batch.filter(
      (personId) => !done.has(`${options.idPrefix}:${personId}`),
    );
    if (pending.length === 0) {
      ingested += 1;
      continue;
    }

    const id = `${options.idPrefix}:${pending[0]}`;
    try {
      const envelope = await call(() =>
        apiFootballGet<Array<{ id: number } & Record<string, T[]>>>(options.path, {
          [options.queryKey]: pending.join("-"),
        }),
      );
      if (isEmptyApiResponse(envelope)) {
        console.log(`Data Not Yet Available resource=${options.path} ids=${pending.join("-")}`);
        continue;
      }
      const response = envelope.response;
      const groups = response.filter((item) => item?.id && (item[options.groupKey]?.length ?? 0) > 0);
      for (const personId of pending) {
        if (!groups.some((group) => group.id === personId)) {
          console.log(`Data Not Yet Available resource=${options.path} ${options.column}=${personId}`);
        }
      }
      await deleteIn(
        options.table,
        options.column,
        groups.map((group) => group.id),
      );
      const rows = groups.flatMap((group) =>
        (group[options.groupKey] ?? []).map((item) => options.mapRow(group.id, item)),
      );
      await insertRows(options.table, rows);
      for (const group of groups) {
        const count = (group[options.groupKey] ?? []).length;
        await markOk(`${options.idPrefix}:${group.id}`, options.resource, {
          id: group.id,
        }, `ok:${count}`);
        done.add(`${options.idPrefix}:${group.id}`);
      }
      ingested += 1;
    } catch (cause) {
      if (cause instanceof IngestQuotaStop) throw cause;
      if (isUnavailableResource(cause)) {
        for (const personId of pending) {
          await markOk(
            `${options.idPrefix}:${personId}`,
            options.resource,
            { id: personId },
            "ok:unavailable",
          );
          done.add(`${options.idPrefix}:${personId}`);
        }
        ingested += 1;
      } else {
        failed.push({ id, error: formatIngestError(cause) });
      }
    }
    if ((index + 1) % 25 === 0) {
      console.log(`${options.resource} ${index + 1}/${batches.length}`);
    }
  }

  return { ingested, failed, targets: batches.length };
}

async function playerIds() {
  const supabase = createAdminClient();
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("players")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) ids.push(Number(row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function coachIds() {
  const supabase = createAdminClient();
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("coaches")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) ids.push(Number(row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export async function ingestRankTables(limit?: number) {
  const targets = take(await scopedLeagueSeasons(), limit);
  const done = await completedIds("player-ranks");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const target of targets) {
    const scorers = `scorers:${target.leagueId}:${target.season}`;
    if (target.coverageTopScorers) {
      const ran = await runStep(scorers, "player-ranks", targetParams(target), done, failed, async () => {
        const result = await call(() =>
          ingestTopScorers({ league: target.leagueId, season: target.season }),
        );
        if (result.rows === 0) throw new PlayersNotReady();
        return `ok:${result.rows}`;
      });
      if (ran) ingested += 1;
    }

    if (!target.coverageTopCards) continue;
    const cards = `cards:${target.leagueId}:${target.season}`;
    const ran = await runStep(cards, "player-ranks", targetParams(target), done, failed, async () => {
      const yellow = await call(
        () => ingestTopYellowCards({ league: target.leagueId, season: target.season }),
        TOP_CARDS_REQUEST_GAP_MS,
      );
      const red = await call(
        () => ingestTopRedCards({ league: target.leagueId, season: target.season }),
        TOP_CARDS_REQUEST_GAP_MS,
      );
      if (yellow.rows === 0 && red.rows === 0) throw new PlayersNotReady();
      return `ok:yellow=${yellow.rows};red=${red.rows}`;
    });
    if (ran) ingested += 1;
  }

  return { ingested, failed, targets: targets.length };
}

const LINEUP_LEAD_MS = cadence.lineupsBefore;
const LINEUP_STARTED = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "FT", "AET", "PEN", "AWD", "WO"]);

function lineupsDue(status: string | null, kickoff: string | null) {
  if (status && LINEUP_STARTED.has(status)) return true;
  if (!kickoff) return false;
  const at = new Date(kickoff).getTime();
  if (Number.isNaN(at)) return false;
  return Date.now() >= at - LINEUP_LEAD_MS;
}

async function lineupsStored(fixtureId: number) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("fixture_lineups")
    .select("fixture_id", { count: "exact", head: true })
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function ingestFixtureDetails(limit?: number) {
  const scope = await scopedLeagueSeasons();
  const coverage = new Map(scope.map((item) => [`${item.leagueId}:${item.season}`, item]));
  const fixtures = take(
    (await loadFixtures(scope)).filter((fixture) =>
      FINISHED_STATUSES.has(fixture.status ?? ""),
    ),
    limit,
  );
  const done = await completedIds("fixture-detail");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, fixture] of fixtures.entries()) {
    const flags = coverage.get(`${fixture.leagueId}:${fixture.season}`);
    if (
      !flags?.coverageEvents &&
      !flags?.coverageLineups &&
      !flags?.coverageFixtureStatistics &&
      !flags?.coveragePlayerStatistics
    ) {
      continue;
    }
    const id = `fixture-detail:${fixture.id}`;
    const ran = await runStep(
      id,
      "fixture-detail",
      { fixtureId: fixture.id, leagueId: fixture.leagueId, season: fixture.season },
      done,
      failed,
      async () => {
        const events = flags?.coverageEvents
          ? (await call(() => getFixtureEvents({ fixture: fixture.id }))).response
          : null;
        const lineups =
          flags?.coverageLineups && lineupsDue(fixture.status, fixture.kickoff) && !(await lineupsStored(fixture.id))
            ? (await call(() => getFixtureLineups({ fixture: fixture.id }))).response
            : null;
        const statistics = flags?.coverageFixtureStatistics
          ? await loadFixtureStatistics(fixture.id)
          : null;
        const players = flags?.coveragePlayerStatistics
          ? (await call(() => getFixturePlayers({ fixture: fixture.id }))).response
          : null;
        await persistFixtureDetail(fixture.id, events, lineups, statistics, players);
        return `ok:events=${events?.length ?? 0}`;
      },
    );
    if (ran) ingested += 1;
    if ((index + 1) % 25 === 0) console.log(`fixture detail ${index + 1}/${fixtures.length}`);
  }

  return { ingested, failed, targets: fixtures.length };
}

async function loadFixtureStatistics(fixtureId: number) {
  const envelope = await call(() => getFixtureStatistics({ fixture: fixtureId }));
  if (isCoverageNotSupported(envelope)) {
    console.log(`Coverage not supported fixture=${fixtureId}`);
    return null;
  }
  return envelope.response;
}

function sheetRow(
  fixtureId: number,
  teamId: number,
  statistics: Array<{ type: string | null; value: string | number | null }>,
) {
  // PYTH fixture_statistics columns: fixture_id, team_id, statistics (jsonb), updated_at.
  // Do not write period / expected_goals / corners columns — they are not on live PYTH.
  const stats = Object.fromEntries(statistics.map((stat) => [stat.type ?? "unknown", stat.value]));
  return {
    fixture_id: fixtureId,
    team_id: teamId,
    statistics: stats,
    updated_at: new Date().toISOString(),
  };
}

function sheetNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

async function persistFixtureDetail(
  fixtureId: number,
  events: ApiFootballFixtureEvent[] | null,
  lineups: ApiFootballFixtureLineup[] | null,
  statistics: ApiFootballFixtureStatistic[] | null,
  playerItems: Array<{
    team: { id: number | null; name: string | null; logo?: string | null };
    players: Array<{
      player: { id: number | null; name: string | null; photo: string | null };
      statistics: Array<Record<string, unknown>>;
    }>;
  }> | null,
) {
  const teams = uniqueBy(
    [
      ...(events ?? []).flatMap((event) => (event.team?.id ? [event.team] : [])),
      ...(lineups ?? []).flatMap((lineup) => (lineup.team?.id ? [lineup.team] : [])),
      ...(statistics ?? []).flatMap((item) => (item.team?.id ? [item.team] : [])),
      ...(playerItems ?? []).flatMap((item) => (item.team?.id ? [item.team] : [])),
    ].map((team) => ({
      id: team.id as number,
      name: team.name ?? `Team ${team.id}`,
      logo: team.logo,
    })),
    (team) => team.id,
  );
  const players = uniqueBy(
    [
      ...(events ?? []).flatMap((event) => [event.player, event.assist]),
      ...(lineups ?? []).flatMap((lineup) => [
        ...lineup.startXI.map((item) => item.player),
        ...lineup.substitutes.map((item) => item.player),
      ]),
      ...(playerItems ?? []).flatMap((item) => item.players.map((player) => player.player)),
    ].flatMap((player) =>
      player?.id
        ? [{ id: player.id, name: player.name, photo_url: "photo" in player ? player.photo : null }]
        : [],
    ),
    (player) => player.id,
  );
  const coaches = uniqueBy(
    (lineups ?? []).flatMap((lineup) =>
      lineup.coach?.id
        ? [{ id: lineup.coach.id, name: lineup.coach.name, photo_url: lineup.coach.photo }]
        : [],
    ),
    (coach) => coach.id,
  );

  await upsertCompact("teams", teams, "id");
  await upsertCompact("players", players, "id");
  await upsertCompact("coaches", coaches, "id");

  if (events && events.length > 0) {
  await deleteMatch("fixture_events", { fixture_id: fixtureId }, "id");
  await insertRows(
    "fixture_events",
    events.map((event) => ({
      fixture_id: fixtureId,
      time_elapsed: event.time?.elapsed ?? null,
      time_extra: event.time?.extra ?? null,
      team_id: event.team?.id ?? null,
      player_id: event.player?.id ?? null,
      assist_id: event.assist?.id ?? null,
      type: event.type,
      detail: event.detail,
      comments: event.comments,
    })),
  );
  } else if (events) {
    console.log(`Data Not Yet Available fixture=${fixtureId} resource=events`);
  }

  if (lineups && lineups.length > 0) {
  await deleteMatch("fixture_lineups", { fixture_id: fixtureId }, "fixture_id");
  const lineupRows = uniqueBy(
    lineups.flatMap((lineup) =>
      lineup.team?.id
        ? [
            {
              fixture_id: fixtureId,
              team_id: lineup.team.id,
              formation: lineup.formation,
              coach_id: lineup.coach?.id ?? null,
              colors: lineup.team.colors ?? {},
            },
          ]
        : [],
    ),
    (row) => row.team_id,
  );
  await insertRows("fixture_lineups", lineupRows);
  await insertRows(
    "fixture_lineup_players",
    uniqueBy(
      lineups.flatMap((lineup) => {
        if (!lineup.team?.id) return [];
        return [
          ...lineup.startXI.map((item) => ({ item, is_starter: true })),
          ...lineup.substitutes.map((item) => ({ item, is_starter: false })),
        ].flatMap(({ item, is_starter }) =>
          item.player?.id
            ? [
                {
                  fixture_id: fixtureId,
                  team_id: lineup.team.id,
                  player_id: item.player.id,
                  player_name: item.player.name,
                  number: item.player.number,
                  position: item.player.pos,
                  grid: item.player.grid,
                  is_starter,
                },
              ]
            : [],
        );
      }),
      (row) => `${row.team_id}:${row.player_id}`,
    ),
  );
  } else if (lineups) {
    console.log(`Data Not Yet Available fixture=${fixtureId} resource=lineups`);
  }

  if (statistics && statistics.length > 0) {
  await deleteMatch("fixture_statistics", { fixture_id: fixtureId }, "fixture_id");
  await insertRows(
    "fixture_statistics",
    uniqueBy(
      statistics.flatMap((item) =>
        item.team?.id
          ? [
              sheetRow(fixtureId, item.team.id, item.statistics),
            ]
          : [],
      ),
      (row) => row.team_id,
    ),
  );
  } else if (statistics) {
    console.log(`Data Not Yet Available fixture=${fixtureId} resource=statistics`);
  }

  if (playerItems && playerItems.length > 0) {
  await deleteMatch("fixture_player_statistics", { fixture_id: fixtureId }, "fixture_id");
  await insertRows(
    "fixture_player_statistics",
    uniqueBy(
      playerItems.flatMap((item) =>
        item.players.flatMap((player) => {
          if (!player.player?.id) return [];
          const games = (player.statistics?.[0]?.games ?? {}) as Record<string, unknown>;
          return [
            {
              fixture_id: fixtureId,
              team_id: item.team?.id ?? null,
              player_id: player.player.id,
              minutes: asNumber(games.minutes),
              rating: games.rating == null ? null : String(games.rating),
              captain: typeof games.captain === "boolean" ? games.captain : null,
              substitute: typeof games.substitute === "boolean" ? games.substitute : null,
              stats: player.statistics ?? [],
            },
          ];
        }),
      ),
      (row) => row.player_id,
    ),
  );
  } else if (playerItems) {
    console.log(`Data Not Yet Available fixture=${fixtureId} resource=players`);
  }
}

const PREDICTION_FRESH_MS = cadence.predictions;

export async function syncPrediction(fixtureId: number) {
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    console.log("predictions need a fixture id");
    return { predictions: 0 };
  }
  const supabase = createAdminClient();
  const { data: fixture, error } = await supabase.from("fixtures").select("league_id, season").eq("id", fixtureId).maybeSingle();
  if (error) throw error;
  if (!fixture) {
    console.log(`Data Not Yet Available resource=predictions fixture=${fixtureId}`);
    return { predictions: 0 };
  }
  if (!(await coverageAllows(Number(fixture.league_id), Number(fixture.season), "predictions"))) {
    return { predictions: 0 };
  }
  const { data: stored, error: storedError } = await supabase
    .from("predictions")
    .select("updated_at")
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (storedError) throw storedError;
  if (stored?.updated_at && Date.now() - new Date(String(stored.updated_at)).getTime() < PREDICTION_FRESH_MS) {
    console.log(`predictions fresh fixture=${fixtureId}`);
    return { predictions: 1 };
  }

  const envelope = await getPredictions({ fixture: fixtureId });
  if (isCoverageNotSupported(envelope)) {
    console.log(`Coverage not supported fixture=${fixtureId}`);
    return { predictions: 0 };
  }
  if (isEmptyApiResponse(envelope) || !envelope.response[0]) {
    console.log(`Data Not Yet Available resource=predictions fixture=${fixtureId}`);
    return { predictions: 0 };
  }
  await persistPrediction(fixtureId, envelope.response[0]);
  return { predictions: 1 };
}

export async function ingestUpcomingPredictions(limit?: number) {
  const scope = await scopedLeagueSeasons();
  const allowed = new Set(
    scope.filter((item) => item.coveragePredictions).map((item) => `${item.leagueId}:${item.season}`),
  );
  const uncovered = scope.length - allowed.size;
  if (uncovered > 0) console.log(`coverage off predictions for ${uncovered} league seasons`);
  const fixtures = take(
    (await loadFixtures(scope)).filter((fixture) =>
      allowed.has(`${fixture.leagueId}:${fixture.season}`),
    ),
    limit,
  );
  const done = await completedIds("predictions");
  const failed: IngestFailure[] = [];
  let ingested = 0;

  for (const [index, fixture] of fixtures.entries()) {
    const id = `predictions:${fixture.id}`;
    const ran = await runStep(
      id,
      "predictions",
      { fixtureId: fixture.id },
      done,
      failed,
      async () => {
        const result = await call(() => syncPrediction(fixture.id));
        if (result.predictions === 0) throw new PlayersNotReady();
        return "ok";
      },
    );
    if (ran) ingested += 1;
    if ((index + 1) % 50 === 0) console.log(`predictions ${index + 1}/${fixtures.length}`);
  }

  return { ingested, failed, targets: fixtures.length };
}

async function persistPrediction(fixtureId: number, item: ApiFootballPredictionItem | null) {
  if (!item) return;
  const winnerId = item.predictions.winner?.id ?? null;
  if (winnerId && item.predictions.winner?.name) {
    await upsertCompact(
      "teams",
      [{ id: winnerId, name: item.predictions.winner.name }],
      "id",
    );
  }
  await upsertCompact(
    "predictions",
    [
      {
        fixture_id: fixtureId,
        winner_id: winnerId,
        winner_comment: item.predictions.winner?.comment ?? null,
        win_or_draw: item.predictions.win_or_draw,
        under_over: item.predictions.under_over,
        advice: item.predictions.advice,
        percent_home: item.predictions.percent?.home ?? null,
        percent_draw: item.predictions.percent?.draw ?? null,
        percent_away: item.predictions.percent?.away ?? null,
        payload: item,
      },
    ],
    "fixture_id",
  );
}

function targetParams(target: LeagueSeasonTarget) {
  return {
    leagueId: target.leagueId,
    season: target.season,
    name: target.name,
  };
}

export async function ingestLiveFixtures() {
  const failed: IngestFailure[] = [];
  if (await checkpointFresh("live:fixtures", cadence.liveFixtures)) {
    console.log("live fixtures fresh");
    return { ingested: 0, failed, targets: 0 };
  }
  try {
    const { response } = await call(() => getLiveFixtures("all"));
    await markOk("live:fixtures", "live-fixtures", {}, `ok:${response.length}`);
    const items = response.filter((item) => isTargetLeagueId(item.league.id));
    await persistLiveFixtures(items);
    return { ingested: items.length, failed, targets: items.length };
  } catch (cause) {
    if (cause instanceof IngestQuotaStop) throw cause;
    failed.push({ id: "live-fixtures", error: formatIngestError(cause) });
    return { ingested: 0, failed, targets: 1 };
  }
}

async function persistLiveFixtures(items: ApiFootballFixtureItem[]) {
  if (items.length === 0) return;
  const supabase = createAdminClient();
  await upsertCompact(
    "venues",
    uniqueBy(
      items.flatMap((item) =>
        item.fixture.venue?.id
          ? [{ id: item.fixture.venue.id, name: item.fixture.venue.name, city: item.fixture.venue.city }]
          : [],
      ),
      (venue) => venue.id,
    ),
    "id",
  );
  await upsertCompact(
    "teams",
    uniqueBy(
      items.flatMap((item) =>
        [item.teams.home, item.teams.away].flatMap((team) =>
          team?.id
            ? [{ id: team.id, name: team.name ?? `Team ${team.id}`, logo: team.logo }]
            : [],
        ),
      ),
      (team) => team.id,
    ),
    "id",
  );
  const rows = items.map((item) => ({
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
  }));
  const { error } = await supabase.from("fixtures").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

const LIVE_ODDS_BEFORE_MS = 15 * 60 * 1000;
const LIVE_POLL_MS = cadence.live;
const LIVE_STATS_MS = cadence.liveStats;
const LIVE_ODDS_AFTER_MS = 20 * 60 * 1000;
const LIVE_FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

async function liveBetName(id: LiveBetId) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("live_bets").select("name").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}

export async function syncLiveOdds(params: { fixture?: number; league?: number; bet?: LiveBetId; season?: number }) {
  console.log("API-Football live odds ingest is disabled. Odds-API.io is the only odds source.");
  void params;
  return { rows: 0 };
}

async function liveOddsWindow(fixtureId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("fixtures").select("date, status_short").eq("id", fixtureId).maybeSingle();
  if (error) throw error;
  if (!data?.date) return "live odds need a stored kickoff";
  const kickoff = new Date(data.date).getTime();
  const now = Date.now();
  if (kickoff > now + LIVE_ODDS_BEFORE_MS) return "live odds appear from 15 minutes before kickoff";
  if (LIVE_FINISHED.has(data.status_short ?? "") && now - kickoff > 3 * 60 * 60 * 1000) {
    return "live odds are not kept after the match";
  }
  if (LIVE_FINISHED.has(data.status_short ?? "") && now - kickoff > LIVE_ODDS_AFTER_MS && now - kickoff > 2 * 60 * 60 * 1000) {
    return "live odds are not kept after the match";
  }
  return null;
}

export async function ingestLiveOdds() {
  console.log("API-Football live odds ingest is disabled. Odds-API.io is the only odds source.");
  return { ingested: 0, failed: [] as IngestFailure[], targets: 0 };
}

async function persistLiveOdds(items: ApiFootballLiveOddsItem[]) {
  if (items.length === 0) return 0;
  const fixtureIds = await knownIds(
    "fixtures",
    items.flatMap((item) => (item.fixture?.id ? [item.fixture.id] : [])),
  );
  const known = items.filter((item) => item.fixture?.id && fixtureIds.has(item.fixture.id));
  if (known.length === 0) {
    console.log("Data Not Yet Available resource=live-odds");
    return 0;
  }
  await upsertCompact(
    "live_bets",
    uniqueBy(
      known.flatMap((item) => (item.odds ?? []).flatMap((bet) => (bet.id && bet.name ? [{ id: bet.id, name: bet.name }] : []))),
      (bet) => bet.id,
    ),
    "id",
  );
  const capturedAt = new Date().toISOString();
  const rows = uniqueBy(
    known.flatMap((item) =>
      (item.odds ?? []).flatMap((bet) =>
        (bet.values ?? []).flatMap((value) => {
          const selection = value.value == null ? "" : String(value.value).trim();
          if (!bet.id || selection === "") return [];
          return [
            {
              fixture_id: item.fixture.id,
              bet_id: bet.id,
              value: selection,
              handicap: value.handicap == null || value.handicap === "" ? "" : String(value.handicap),
              odd: asNumber(value.odd),
              main: value.main ?? null,
              suspended: value.suspended ?? null,
              stopped: item.status?.stopped ?? null,
              blocked: item.status?.blocked ?? null,
              finished: item.status?.finished ?? null,
              captured_at: capturedAt,
            },
          ];
        }),
      ),
    ),
    (row) => `${row.fixture_id}:${row.bet_id}:${row.value}:${row.handicap}:${row.captured_at}`,
  );
  if (rows.length === 0) return 0;
  await insertRows("live_odds", rows);
  return rows.length;
}

export async function ingestRemainingCache(limit?: number) {
  const stages = [
    ["fixture rounds", () => ingestFixtureRounds(limit)],
    ["odds", () => ingestPrematchOdds(limit)],
    ["team statistics", () => ingestTeamStatisticsCatalog(limit)],
    ["squads", () => ingestSquads(limit)],
    ["coaches", () => ingestCoaches(limit)],
    ["top assists", () => ingestTopAssistsCatalog(limit)],
    ["missing players", () => ingestMissingTeamPlayers(limit)],
    ["transfers", () => ingestTransfers(limit)],
    ["injuries", () => ingestInjuries(limit)],
    ["live fixtures", () => ingestLiveFixtures()],
    ["player trophies", () => ingestPlayerTrophies(limit)],
    ["player sidelined", () => ingestPlayerSidelined(limit)],
    ["coach trophies", () => ingestCoachTrophies(limit)],
    ["coach sidelined", () => ingestCoachSidelined(limit)],
    ["fixture detail", () => ingestFixtureDetails(limit)],
    ["predictions", () => ingestUpcomingPredictions(limit)],
    ["live odds", () => ingestLiveOdds()],
  ] as const;

  const failed: Array<IngestFailure & { stage: string }> = [];
  try {
    for (const [stage, run] of stages) {
      console.log(`stage ${stage}`);
      const result = await run();
      console.log(
        `${stage}: ${result.ingested}/${result.targets}` +
          (result.failed.length ? `, failed ${result.failed.length}` : ""),
      );
      for (const item of result.failed.slice(0, 10)) {
        console.log(`- ${item.id}: ${item.error}`);
      }
      failed.push(...result.failed.map((item) => ({ ...item, stage })));
    }
  } catch (cause) {
    if (cause instanceof IngestQuotaStop) {
      console.log(cause.message);
      return { failed, stopped: true };
    }
    throw cause;
  }

  return { failed, stopped: false };
}
