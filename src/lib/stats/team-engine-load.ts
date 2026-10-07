import "server-only";

import { isMissingRelation } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

import {
  FINISHED_STATUSES,
  buildTeamMatches,
  type FixtureInput,
  type SheetInput,
  type TeamMatch,
} from "./team-engine";

const PAGE = 1000;
const SHEET_CHUNK = 200;
const FIXTURE_COLUMNS =
  "id, date, league_id, season, home_team_id, away_team_id, home_goals, away_goals, score, status_short";

type Scope = { leagueId?: number; season?: number };

/** Every finished match in one competition season, as per-team rows (newest first). */
export async function loadLeagueTeamMatches(leagueId: number, season: number): Promise<TeamMatch[]> {
  return loadTeamMatches({ leagueId, season });
}

/**
 * Finished matches for specific teams. Without a scope this spans every
 * competition (for cross-competition form); pass `leagueId` / `season` for
 * FootyStats-style league tables.
 */
export async function loadTeamMatchesForTeams(teamIds: number[], scope: Scope = {}): Promise<TeamMatch[]> {
  const ids = [...new Set(teamIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const matches = await loadTeamMatches(scope, ids);
  return matches.filter((match) => wanted.has(match.teamId));
}

/** Every finished meeting between two teams in any competition (both perspectives, newest first). */
export async function loadHeadToHeadMatches(teamA: number, teamB: number, limit = 20): Promise<TeamMatch[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select(FIXTURE_COLUMNS)
    .in("status_short", [...FINISHED_STATUSES])
    .or(
      `and(home_team_id.eq.${teamA},away_team_id.eq.${teamB}),and(home_team_id.eq.${teamB},away_team_id.eq.${teamA})`,
    )
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const fixtures = (data ?? []) as FixtureInput[];
  return buildTeamMatches(fixtures, await loadSheets(fixtures.map((fixture) => fixture.id)));
}

async function loadTeamMatches(scope: Scope, teamIds?: number[]): Promise<TeamMatch[]> {
  const fixtures = await loadFinishedFixtures(scope, teamIds);
  const sheets = await loadSheets(fixtures.map((fixture) => fixture.id));
  return buildTeamMatches(fixtures, sheets);
}

async function loadFinishedFixtures(scope: Scope, teamIds?: number[]): Promise<FixtureInput[]> {
  const supabase = createAdminClient();
  const rows: FixtureInput[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("fixtures")
      .select(FIXTURE_COLUMNS)
      .in("status_short", [...FINISHED_STATUSES])
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (scope.leagueId != null) query = query.eq("league_id", scope.leagueId);
    if (scope.season != null) query = query.eq("season", scope.season);
    if (teamIds?.length) {
      const list = teamIds.join(",");
      query = query.or(`home_team_id.in.(${list}),away_team_id.in.(${list})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as FixtureInput[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function loadSheets(fixtureIds: number[]): Promise<SheetInput[]> {
  const supabase = createAdminClient();
  const rows: SheetInput[] = [];
  for (let index = 0; index < fixtureIds.length; index += SHEET_CHUNK) {
    const { data, error } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, team_id, statistics")
      .in("fixture_id", fixtureIds.slice(index, index + SHEET_CHUNK));
    if (error) {
      // Sheets are optional context: goal markets still work without them.
      if (isMissingRelation(error)) return [];
      throw error;
    }
    rows.push(...((data ?? []) as SheetInput[]));
  }
  return rows;
}
