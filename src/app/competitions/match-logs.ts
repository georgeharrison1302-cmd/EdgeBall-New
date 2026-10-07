import "server-only";

import { asNumber, asRecord, fixtureGoals, isMissingRelation } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

export type TeamMatch = {
  teamId: number;
  kickoff: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  xg: number | null;
  xga: number | null;
  cornersFor: number | null;
  cornersAgainst: number | null;
};

const FINISHED = ["FT", "AET", "PEN"];

/** Cheap coverage probe — power rankings / xG / corners need stored match sheets. */
export async function leagueHasMatchSheets(leagueId: number, season: number): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("status_short", FINISHED)
    .limit(40);
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const ids = (fixtures ?? []).map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
  if (ids.length === 0) return false;
  const { count, error: sheetError } = await supabase
    .from("fixture_statistics")
    .select("fixture_id", { count: "exact", head: true })
    .in("fixture_id", ids);
  if (sheetError) {
    if (isMissingRelation(sheetError)) return false;
    throw sheetError;
  }
  return (count ?? 0) > 0;
}

export async function loadTeamMatches(leagueId: number, season: number): Promise<TeamMatch[]> {
  const supabase = createAdminClient();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, date, home_team_id, away_team_id, home_goals, away_goals, score")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("status_short", FINISHED)
    .order("date");
  if (error) throw error;
  const rows = (fixtures ?? []).flatMap((fixture) => {
    const goals = fixtureGoals(fixture);
    if (fixture.home_team_id == null || fixture.away_team_id == null || goals.home == null || goals.away == null) return [];
    return [{ ...fixture, home_team_id: fixture.home_team_id, away_team_id: fixture.away_team_id, home_goals: goals.home, away_goals: goals.away, date: fixture.date }];
  });
  const sheets = new Map<string, { xg: number | null; corners: number | null }>();
  const ids = rows.map((row) => row.id);
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error: sheetError } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, team_id, statistics")
      .in("fixture_id", ids.slice(index, index + 200));
    if (sheetError) {
      if (isMissingRelation(sheetError) || /column .* does not exist/i.test(sheetError.message)) break;
      throw sheetError;
    }
    for (const sheet of data ?? []) {
      const stats = statsMap(sheet.statistics);
      sheets.set(`${sheet.fixture_id}:${sheet.team_id}`, {
        xg: asNumber(stats.expected_goals),
        corners: asNumber(stats["Corner Kicks"]),
      });
    }
  }

  return rows.flatMap((fixture) => {
    const homeSheet = sheets.get(`${fixture.id}:${fixture.home_team_id}`);
    const awaySheet = sheets.get(`${fixture.id}:${fixture.away_team_id}`);
    const kickoff = fixture.date ?? "";
    return [
      {
        teamId: fixture.home_team_id,
        kickoff,
        home: true,
        goalsFor: fixture.home_goals,
        goalsAgainst: fixture.away_goals,
        xg: homeSheet?.xg ?? null,
        xga: awaySheet?.xg ?? null,
        cornersFor: homeSheet?.corners ?? null,
        cornersAgainst: awaySheet?.corners ?? null,
      },
      {
        teamId: fixture.away_team_id,
        kickoff,
        home: false,
        goalsFor: fixture.away_goals,
        goalsAgainst: fixture.home_goals,
        xg: awaySheet?.xg ?? null,
        xga: homeSheet?.xg ?? null,
        cornersFor: awaySheet?.corners ?? null,
        cornersAgainst: homeSheet?.corners ?? null,
      },
    ];
  });
}

/** API stores either `[{type,value}]` arrays or keyed objects — normalize both. */
function statsMap(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.flatMap((item) => {
        const record = asRecord(item);
        if (!record || typeof record.type !== "string") return [];
        return [[record.type, record.value]];
      }),
    );
  }
  return asRecord(raw) ?? {};
}
