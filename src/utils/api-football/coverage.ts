import "server-only";
import { createIngestClient } from "@/utils/supabase/admin";

export const COVERAGE_COLUMNS = {
  events: "coverage_events",
  lineups: "coverage_lineups",
  fixtureStatistics: "coverage_fixture_statistics",
  playerStatistics: "coverage_player_statistics",
  standings: "coverage_standings",
  players: "coverage_players",
  topScorers: "coverage_top_scorers",
  topAssists: "coverage_top_assists",
  topCards: "coverage_top_cards",
  injuries: "coverage_injuries",
  predictions: "coverage_predictions",
  odds: "coverage_odds",
} as const;

export type CoverageFlag = keyof typeof COVERAGE_COLUMNS;

export async function coverageAllows(leagueId: number, season: number, flag: CoverageFlag) {
  const column = COVERAGE_COLUMNS[flag];
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("league_seasons")
    .select(column)
    .eq("league_id", leagueId)
    .eq("season", season)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, boolean | null> | null;
  const allowed = row?.[column] === true;
  if (!allowed) {
    console.log(`coverage off ${flag} league=${leagueId} season=${season}`);
  }
  return allowed;
}
