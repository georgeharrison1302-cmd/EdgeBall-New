import "server-only";

import { prematchBets } from "@/utils/api-football/bet-catalogs";
import {
  BOOK_IDS,
  latestOddsSnapshots,
  oddFor,
  pickBookmaker,
  betsFromOddsData,
  type StoredOddsRow,
} from "@/utils/odds-api-io/stored";
import { fixtureGoals } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export type BttsRow = {
  teamId: number;
  team: string;
  logo: string | null;
  last5: boolean[];
  hits: string | null;
  homePct: number | null;
  awayPct: number | null;
  seasonPct: number | null;
  nextOpponent: string | null;
  nextFixtureId: number | null;
  nextOdd: string | null;
};

type Side = { id: number; name: string; logo: string | null };

export async function loadBothTeamsToScore(leagueId: number, season: number, teams: Side[]): Promise<BttsRow[]> {
  if (teams.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, home_goals, away_goals, score, home_team_id, away_team_id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .order("date")
    .limit(1000);
  if (error) throw error;
  const fixtures = (data ?? []) as FixtureRow[];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const now = Date.now();
  const nextIds: number[] = [];
  const byTeam = new Map<number, BttsRow>();
  for (const team of teams) {
    const played = fixtures.filter((fixture) => finished(fixture) && (fixture.home_team_id === team.id || fixture.away_team_id === team.id));
    const last5 = played.slice(-5).map(bothScored);
    const home = played.filter((fixture) => fixture.home_team_id === team.id);
    const away = played.filter((fixture) => fixture.away_team_id === team.id);
    const upcoming = fixtures.find((fixture) => !finished(fixture) && fixture.date && new Date(fixture.date).getTime() >= now && (fixture.home_team_id === team.id || fixture.away_team_id === team.id));
    if (upcoming) nextIds.push(upcoming.id);
    byTeam.set(team.id, {
      teamId: team.id,
      team: team.name,
      logo: team.logo,
      last5,
      hits: last5.length === 0 ? null : `${last5.filter(Boolean).length}/${last5.length}`,
      homePct: rate(home),
      awayPct: rate(away),
      seasonPct: rate(played),
      nextOpponent: upcoming ? (upcoming.home_team_id === team.id ? teamNames.get(upcoming.away_team_id ?? 0) ?? "Away" : teamNames.get(upcoming.home_team_id ?? 0) ?? "Home") : null,
      nextFixtureId: upcoming?.id ?? null,
      nextOdd: null,
    });
  }
  if (nextIds.length > 0) {
    const { data: odds, error: oddsError } = await supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .in("fixture_id", [...new Set(nextIds)])
      .in("bookmaker_id", [...BOOK_IDS])
      .order("updated_at", { ascending: false });
    if (oddsError) throw oddsError;
    const chosen = pickBookmaker(latestOddsSnapshots((odds ?? []) as StoredOddsRow[]));
    const yes = new Map<number, string>();
    for (const [fixtureId, row] of chosen) {
      const bets = betsFromOddsData(row.odds_data);
      const price = bets ? oddFor(bets, prematchBets.bothTeamsToScore, ["Yes"]) : null;
      if (price) yes.set(fixtureId, price.toFixed(2));
    }
    for (const team of teams) {
      const row = byTeam.get(team.id);
      const upcoming = fixtures.find((fixture) => !finished(fixture) && fixture.date && new Date(fixture.date).getTime() >= now && (fixture.home_team_id === team.id || fixture.away_team_id === team.id));
      if (row && upcoming) row.nextOdd = yes.get(upcoming.id) ?? null;
    }
  }
  return [...byTeam.values()].sort((left, right) => (right.seasonPct ?? -1) - (left.seasonPct ?? -1) || left.team.localeCompare(right.team));
}

function finished(fixture: FixtureRow) {
  const status = (fixture.status_short ?? "").toUpperCase();
  const goals = fixtureGoals(fixture);
  return FINISHED.has(status) && goals.home != null && goals.away != null;
}

function bothScored(fixture: FixtureRow) {
  const goals = fixtureGoals(fixture);
  return (goals.home ?? 0) > 0 && (goals.away ?? 0) > 0;
}

function rate(fixtures: FixtureRow[]) {
  if (fixtures.length === 0) return null;
  return Math.round((fixtures.filter(bothScored).length / fixtures.length) * 100);
}

type FixtureRow = {
  id: number;
  date: string | null;
  status_short: string | null;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
  home_team_id: number | null;
  away_team_id: number | null;
};
