import "server-only";

import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { matchMarketPrices } from "@/lib/odds/match-markets";
import {
  BOOK_IDS,
  latestOddsSnapshots,
  pickBookmaker,
  type StoredOddsRow,
} from "@/utils/odds-api-io/stored";
import { fixtureGoals } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

import { fixtureBucket, parseKickoffMs } from "./bucket";
import type { DayLoad, FixtureMatch } from "./types";

/**
 * Lightweight fixture-board load: identity, status, form, and stored book prices.
 * Heavier matchup context belongs on `/fixtures/[id]`, not the landing list.
 */
export async function loadFixtureDay(date: string, leagueId: number | null): Promise<DayLoad> {
  const supabase = createIngestClient();
  const next = shiftDate(date, 1);
  let query = supabase
    .from("fixtures")
    .select("id, season, league_id, date, status_short, score, home_team_id, away_team_id, home_goals, away_goals")
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
  const [
    { data: forms, error: formError },
    { data: odds, error: oddsError },
    { data: clubs, error: clubError },
    { data: competitions, error: leagueError },
  ] = await Promise.all([
    teamIds.length === 0
      ? empty
      : supabase
          .from("standings")
          .select("league_id, season, team_id, form")
          .in("league_id", leagueIds)
          .in("season", seasons)
          .in("team_id", teamIds),
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
  if (oddsError) throw oddsError;
  if (clubError) throw clubError;
  if (leagueError) throw leagueError;

  const clubsById = new Map((clubs ?? []).map((club) => [club.id, club]));
  const leaguesById = new Map((competitions ?? []).map((row) => [row.id, row]));
  const formByTeam = new Map<string, string>();
  for (const row of forms ?? []) {
    if (row.form) formByTeam.set(`${row.league_id}:${row.season}:${row.team_id}`, row.form);
  }
  const oddsByFixture = pickBookmaker(latestOddsSnapshots((odds ?? []) as StoredOddsRow[]));

  const matches: FixtureMatch[] = fixtures.map((fixture) => {
    const status = (fixture.status_short ?? "").toUpperCase();
    const homeClub = clubsById.get(fixture.home_team_id ?? 0);
    const awayClub = clubsById.get(fixture.away_team_id ?? 0);
    const competition = leaguesById.get(fixture.league_id);
    const kickoffMs = parseKickoffMs(fixture.date);
    const kickoffAt = kickoffMs == null ? null : new Date(kickoffMs).toISOString();
    const goals = fixtureGoals(fixture);
    const form = (teamId: number | null) =>
      teamId == null ? null : formByTeam.get(`${fixture.league_id}:${fixture.season}:${teamId}`) ?? null;

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
        name: homeClub?.name ?? "Home",
        logo: homeClub?.logo ?? null,
        form: form(fixture.home_team_id),
      },
      away: {
        id: fixture.away_team_id,
        name: awayClub?.name ?? "Away",
        logo: awayClub?.logo ?? null,
        form: form(fixture.away_team_id),
      },
      goalsHome: goals.home,
      goalsAway: goals.away,
      minute: null,
      prices: matchMarketPrices(oddsByFixture.get(fixture.id)?.odds_data),
    };
  });
  return { date, matches };
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
