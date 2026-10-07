import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";

import { buildHeadToHead, buildTeamPanel, opponentIds, type MatchStatsView, type TeamRef } from "./match-stats";
import { loadHeadToHeadMatches, loadTeamMatchesForTeams } from "./team-engine-load";

/** League-season team stats for both sides plus all-competition head-to-head. */
export async function loadMatchStats(input: {
  leagueId: number;
  season: number;
  home: TeamRef;
  away: TeamRef;
}): Promise<MatchStatsView> {
  const { leagueId, season, home, away } = input;
  const [league, meetings] = await Promise.all([
    loadTeamMatchesForTeams([home.id, away.id], { leagueId, season }),
    loadHeadToHeadMatches(home.id, away.id),
  ]);
  const names = await loadTeamRefs(opponentIds(league, meetings), [home, away]);
  return {
    leagueId,
    season,
    home: buildTeamPanel(league, home, "home", names),
    away: buildTeamPanel(league, away, "away", names),
    h2h: buildHeadToHead(meetings, home.id, names),
  };
}

async function loadTeamRefs(ids: number[], known: TeamRef[]) {
  const names = new Map<number, TeamRef>(known.map((team) => [team.id, team]));
  const missing = ids.filter((id) => !names.has(id));
  if (missing.length === 0) return names;
  const { data, error } = await createAdminClient().from("teams").select("id, name, logo").in("id", missing);
  if (error) throw error;
  for (const row of data ?? []) names.set(row.id, { id: row.id, name: row.name, logo: row.logo });
  return names;
}
