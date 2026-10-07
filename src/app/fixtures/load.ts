import "server-only";

import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { prematchBets } from "@/utils/api-football/bet-catalogs";
import {
  BOOK_IDS,
  latestOddsSnapshots,
  oddFor,
  pickBookmaker,
  betsFromOddsData,
  type StoredOddsRow,
} from "@/utils/odds-api-io/stored";
import { loadPlayerDirectory, playerLabel } from "@/utils/players/directory";
import { fixtureGoals, isMissingRelation, nestNumber, predictionPercents } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

import {
  buildGameScript,
  loadTeamSheetContext,
  loadTeamYellowRates,
  type TeamYellowScope,
} from "@/utils/stats/discipline";
import { loadRefereeRates, lookupReferee } from "@/utils/stats/referees";

import { fixtureBucket, parseKickoffMs } from "./bucket";
import type { DayLoad, FixtureMatch } from "./types";

const MIN_MATCHES = 10;
const CARD_LINE = 5.5;
const FOUL_LINE = 1.8;

export async function loadFixtureDay(date: string, leagueId: number | null): Promise<DayLoad> {
  const supabase = createIngestClient();
  const next = shiftDate(date, 1);
  let query = supabase
    .from("fixtures")
    .select("id, season, league_id, date, status_short, score, referee, home_team_id, away_team_id, home_goals, away_goals")
    .gte("date", `${date}T00:00:00`)
    .lt("date", `${next}T00:00:00`)
    .order("date");
  query = leagueId == null ? query.in("league_id", [...TARGET_LEAGUE_IDS]) : query.eq("league_id", leagueId);
  const { data, error } = await query.limit(1000);
  if (error) throw error;
  const fixtures = data ?? [];
  if (fixtures.length === 0) return { date, matches: [] };

  const teamIds = [...new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter((id): id is number => id != null))];
  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league_id))];
  const seasons = [...new Set(fixtures.map((fixture) => fixture.season))];
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const empty = { data: [], error: null };
  const [{ data: forms, error: formError }, { data: predictions, error: predictionError }, { data: odds, error: oddsError }, { data: clubs, error: clubError }, { data: competitions, error: leagueError }] = await Promise.all([
    teamIds.length === 0 ? empty : supabase.from("standings").select("league_id, season, team_id, form").in("league_id", leagueIds).in("season", seasons).in("team_id", teamIds),
    supabase.from("predictions").select("fixture_id, percent, under_over, goals, prediction_data").in("fixture_id", fixtureIds),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .in("fixture_id", fixtureIds)
      .in("bookmaker_id", [...BOOK_IDS])
      .order("updated_at", { ascending: false }),
    teamIds.length === 0 ? empty : supabase.from("teams").select("id, name, logo").in("id", teamIds),
    leagueIds.length === 0 ? empty : supabase.from("leagues").select("id, name, logo").in("id", leagueIds),
  ]);
  if (formError) throw formError;
  if (predictionError) throw predictionError;
  if (oddsError) throw oddsError;
  if (clubError) throw clubError;
  if (leagueError) throw leagueError;

  const clubsById = new Map((clubs ?? []).map((club) => [club.id, club]));
  const leaguesById = new Map((competitions ?? []).map((row) => [row.id, row]));

  const formKey = (leagueId: number, season: number, teamId: number) => `${leagueId}:${season}:${teamId}`;
  const formByTeam = new Map<string, string>();
  for (const row of forms ?? []) {
    if (row.form) formByTeam.set(formKey(row.league_id, row.season, row.team_id), row.form);
  }
  const predictionByFixture = new Map((predictions ?? []).map((row) => [row.fixture_id, row]));
  const oddsByFixture = pickBookmaker(latestOddsSnapshots((odds ?? []) as StoredOddsRow[]));
  const locks = await loadLocks(fixtures);
  const refs = await loadRefereeRates(fixtures.map((fixture) => fixture.referee ?? ""));
  const yellowScopes: TeamYellowScope[] = fixtures.flatMap((fixture) => {
    const scopes: TeamYellowScope[] = [];
    if (fixture.home_team_id != null) {
      scopes.push({ teamId: fixture.home_team_id, leagueId: fixture.league_id, season: fixture.season });
    }
    if (fixture.away_team_id != null) {
      scopes.push({ teamId: fixture.away_team_id, leagueId: fixture.league_id, season: fixture.season });
    }
    return scopes;
  });
  const [cardRates, sheetContext] = await Promise.all([
    loadTeamYellowRates(yellowScopes),
    loadTeamSheetContext(yellowScopes),
  ]);

  const matches: FixtureMatch[] = fixtures.map((fixture) => {
    const status = (fixture.status_short ?? "").toUpperCase();
    const prediction = predictionByFixture.get(fixture.id);
    const bets = betsFromOddsData(oddsByFixture.get(fixture.id)?.odds_data);
    const price = (name: string) => (bets ? oddFor(bets, prematchBets.matchWinner, [name]) : null);
    const homeClub = clubsById.get(fixture.home_team_id ?? 0);
    const awayClub = clubsById.get(fixture.away_team_id ?? 0);
    const competition = leaguesById.get(fixture.league_id);
    const homeName = homeClub?.name ?? "Home";
    const awayName = awayClub?.name ?? "Away";
    const homeKey = `${fixture.home_team_id}:${fixture.league_id}:${fixture.season}`;
    const awayKey = `${fixture.away_team_id}:${fixture.league_id}:${fixture.season}`;
    const homeYellows = cardRates.get(homeKey) ?? null;
    const awayYellows = cardRates.get(awayKey) ?? null;
    const kickoffMs = parseKickoffMs(fixture.date);
    const kickoffAt = kickoffMs == null ? null : new Date(kickoffMs).toISOString();
    return {
      id: fixture.id,
      leagueId: fixture.league_id,
      season: Number(fixture.season) || 0,
      league: competition?.name ?? "Competition",
      leagueLogo: competition?.logo ?? null,
      kickoff: kickoffAt ? kickoffAt.slice(11, 16) : (fixture.date ?? "").slice(11, 16),
      kickoffAt,
      status,
      bucket: fixtureBucket(status, kickoffAt),
      home: {
        id: fixture.home_team_id,
        name: homeName,
        logo: homeClub?.logo ?? null,
        form: fixture.home_team_id == null ? null : formByTeam.get(formKey(fixture.league_id, fixture.season, fixture.home_team_id)) ?? null,
      },
      away: {
        id: fixture.away_team_id,
        name: awayName,
        logo: awayClub?.logo ?? null,
        form: fixture.away_team_id == null ? null : formByTeam.get(formKey(fixture.league_id, fixture.season, fixture.away_team_id)) ?? null,
      },
      goalsHome: fixtureGoals(fixture).home,
      goalsAway: fixtureGoals(fixture).away,
      minute: null,
      homePct: percent(predictionPercents(prediction?.percent).home),
      drawPct: percent(predictionPercents(prediction?.percent).draw),
      awayPct: percent(predictionPercents(prediction?.percent).away),
      underOver: prediction?.under_over?.trim() || null,
      goalsLine: goalsLine(prediction?.goals ?? prediction?.prediction_data),
      homeOdd: price("Home"),
      drawOdd: price("Draw"),
      awayOdd: price("Away"),
      lock: locks.get(fixture.id) ?? null,
      homeYellowsPerGame: homeYellows,
      awayYellowsPerGame: awayYellows,
      strictRef: lookupReferee(refs, fixture.referee),
      gameScript: buildGameScript({
        homeName,
        awayName,
        homeYellows,
        awayYellows,
        homeSheet: sheetContext.get(homeKey) ?? null,
        awaySheet: sheetContext.get(awayKey) ?? null,
      }),
    };
  });
  return { date, matches };
}

async function loadLocks(
  fixtures: {
    id: number;
    league_id: number;
    season: number;
    referee: string | null;
    home_team_id: number | null;
    away_team_id: number | null;
  }[],
) {
  const locks = new Map<number, FixtureMatch["lock"]>();
  const refs = await loadRefereeRates(fixtures.map((fixture) => fixture.referee ?? ""));
  const hot = fixtures.flatMap((fixture) => {
    const ref = lookupReferee(refs, fixture.referee);
    if (!ref || ref.matches < MIN_MATCHES || ref.avg < CARD_LINE) return [];
    return [{ fixture, ref }];
  });
  if (hot.length === 0) return locks;

  const teamIds = [
    ...new Set(hot.flatMap(({ fixture }) => [fixture.home_team_id, fixture.away_team_id]).filter((id): id is number => id != null)),
  ];
  const foulLeaders = await loadFoulLeaders(teamIds, hot.map(({ fixture }) => ({ leagueId: fixture.league_id, season: fixture.season })));
  for (const { fixture, ref } of hot) {
    const candidates = [fixture.home_team_id, fixture.away_team_id]
      .filter((id): id is number => id != null)
      .flatMap((teamId) => foulLeaders.get(`${teamId}:${fixture.league_id}:${fixture.season}`) ?? []);
    const player = candidates.sort((left, right) => right.fouls - left.fouls)[0];
    if (!player || player.fouls < FOUL_LINE) continue;
    locks.set(fixture.id, {
      referee: ref.name,
      cards: ref.avg,
      player: player.name,
      fouls: player.fouls,
    });
  }
  return locks;
}

async function loadFoulLeaders(
  teamIds: number[],
  scopes: Array<{ leagueId: number; season: number }>,
) {
  const map = new Map<string, Array<{ playerId: number; name: string; fouls: number }>>();
  if (teamIds.length === 0 || scopes.length === 0) return map;
  const supabase = createIngestClient();
  const leagueIds = [...new Set(scopes.map((scope) => scope.leagueId))];
  const seasons = [...new Set(scopes.map((scope) => scope.season))];
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("player_id, team_id, league_id, season, appearances, stats_data")
    .in("team_id", teamIds)
    .in("league_id", leagueIds)
    .in("season", seasons)
    .gte("appearances", MIN_MATCHES);
  if (error) {
    if (isMissingRelation(error)) return map;
    throw error;
  }
  const playerIds = [...new Set((data ?? []).map((row) => Number(row.player_id)))];
  const directory = await loadPlayerDirectory(supabase, playerIds, { teamIds });
  for (const row of data ?? []) {
    const appearances = Number(row.appearances);
    const fouls = nestNumber(row.stats_data, "fouls", "committed");
    if (!Number.isFinite(appearances) || appearances < MIN_MATCHES || fouls == null) continue;
    const rate = fouls / appearances;
    if (rate < FOUL_LINE) continue;
    const key = `${row.team_id}:${row.league_id}:${row.season}`;
    const list = map.get(key) ?? [];
    const playerId = Number(row.player_id);
    list.push({
      playerId,
      name: playerLabel(directory, playerId),
      fouls: Number(rate.toFixed(2)),
    });
    map.set(key, list);
  }
  return map;
}

function percent(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function goalsLine(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { predictions?: { goals?: { home?: unknown; away?: unknown } }; goals?: { home?: unknown; away?: unknown }; home?: unknown; away?: unknown };
  const goals = root.predictions?.goals ?? root.goals ?? (root.home != null || root.away != null ? root : null);
  const home = goals?.home == null ? "" : String(goals.home).trim();
  const away = goals?.away == null ? "" : String(goals.away).trim();
  if (home === "" || away === "") return null;
  return { home, away };
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
