import "server-only";

import { nestNumber, standingSide } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";
import { loadTeamYellowRates } from "@/utils/stats/discipline";
import { loadRefereeRates, lookupReferee } from "@/utils/stats/referees";

import type { FixtureFactorInput, TeamFactorStats } from "./types";

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"] as const;

/**
 * Build evaluator input for a fixture from PYTH tables.
 * Pure evaluator stays injection-only; this is the data adapter.
 */
export async function loadFixtureFactorInput(
  fixtureId: number,
): Promise<FixtureFactorInput | null> {
  const supabase = createIngestClient();
  const { data: fixture, error } = await supabase
    .from("fixtures")
    .select("id, date, referee, league_id, season, home_team_id, away_team_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (error) throw error;
  if (!fixture) return null;

  const homeId = fixture.home_team_id == null ? null : Number(fixture.home_team_id);
  const awayId = fixture.away_team_id == null ? null : Number(fixture.away_team_id);
  const leagueId = fixture.league_id == null ? null : Number(fixture.league_id);
  const season = fixture.season == null ? null : Number(fixture.season);
  const kickoff = fixture.date ? String(fixture.date) : null;

  const teamIds = [homeId, awayId].filter((id): id is number => id != null && id > 0);

  const yellowScopes =
    leagueId != null && season != null
      ? teamIds.map((teamId) => ({ teamId, leagueId, season }))
      : [];

  const [refs, homePrev, awayPrev, standings, playerStats, leagueSize, cardRates] =
    await Promise.all([
      loadRefereeRates(fixture.referee ? [fixture.referee] : []),
      homeId != null && kickoff
        ? previousKickoff(homeId, kickoff, fixtureId)
        : Promise.resolve(null),
      awayId != null && kickoff
        ? previousKickoff(awayId, kickoff, fixtureId)
        : Promise.resolve(null),
      leagueId != null && season != null && teamIds.length
        ? supabase
            .from("standings")
            .select("team_id, rank, all_stats")
            .eq("league_id", leagueId)
            .eq("season", season)
            .in("team_id", teamIds)
        : Promise.resolve({ data: [], error: null }),
      leagueId != null && season != null && teamIds.length
        ? supabase
            .from("player_season_stats")
            .select("player_id, team_id, appearances, minutes, stats_data")
            .eq("league_id", leagueId)
            .eq("season", season)
            .in("team_id", teamIds)
            .gte("appearances", 3)
        : Promise.resolve({ data: [], error: null }),
      leagueId != null && season != null
        ? countLeagueTeams(leagueId, season)
        : Promise.resolve(null),
      yellowScopes.length ? loadTeamYellowRates(yellowScopes) : Promise.resolve(new Map()),
    ]);

  if ("error" in standings && standings.error) throw standings.error;
  if ("error" in playerStats && playerStats.error) throw playerStats.error;

  const standingRows = "data" in standings ? standings.data ?? [] : [];
  const playerRows = "data" in playerStats ? playerStats.data ?? [] : [];

  const homeStanding = standingRows.find((row) => Number(row.team_id) === homeId);
  const awayStanding = standingRows.find((row) => Number(row.team_id) === awayId);

  const ref = lookupReferee(refs, fixture.referee);
  const homeCards =
    homeId != null && leagueId != null && season != null
      ? (cardRates.get(`${homeId}:${leagueId}:${season}`) ?? null)
      : null;
  const awayCards =
    awayId != null && leagueId != null && season != null
      ? (cardRates.get(`${awayId}:${leagueId}:${season}`) ?? null)
      : null;

  return {
    fixture: {
      id: fixtureId,
      date: kickoff,
      homeTeamId: homeId,
      awayTeamId: awayId,
    },
    homeTeamStats: teamStats(homeId, homeStanding, leagueSize, homeCards),
    awayTeamStats: teamStats(awayId, awayStanding, leagueSize, awayCards),
    refStats: ref
      ? {
          name: ref.name,
          avgCardsPerMatch: ref.avg,
          matches: ref.matches,
        }
      : fixture.referee
        ? { name: fixture.referee, avgCardsPerMatch: null, matches: null }
        : null,
    playerStats: playerRows.flatMap((row) => {
      const apps = Number(row.appearances) || 0;
      const rawMinutes =
        Number(row.minutes) || nestNumber(row.stats_data, "games", "minutes") || 0;
      const minutes = apps > 0 && rawMinutes >= apps * 45 ? rawMinutes : apps > 0 ? apps * 90 : 0;
      const fouls = nestNumber(row.stats_data, "fouls", "committed");
      const foulsPer90 =
        fouls != null && minutes > 0 ? Number(((fouls * 90) / minutes).toFixed(2)) : null;
      return [
        {
          playerId: Number(row.player_id),
          teamId: Number(row.team_id),
          foulsPer90,
        },
      ];
    }),
    homePreviousKickoff: homePrev,
    awayPreviousKickoff: awayPrev,
  };
}

function teamStats(
  teamId: number | null,
  standing: { team_id: number; rank: number | null; all_stats: unknown } | undefined,
  teamsInLeague: number | null,
  cardsPerGame: number | null,
): TeamFactorStats | null {
  if (teamId == null) return null;
  const side = standingSide(standing?.all_stats);
  const played = side.played;
  const gf =
    side.goalsFor != null && played != null && played > 0
      ? side.goalsFor / played
      : null;
  const ga =
    side.goalsAgainst != null && played != null && played > 0
      ? side.goalsAgainst / played
      : null;
  return {
    teamId,
    goalsForPerGame: gf,
    goalsAgainstPerGame: ga,
    rank: standing?.rank == null ? null : Number(standing.rank),
    played,
    teamsInLeague,
    cardsPerGame,
  };
}

async function previousKickoff(
  teamId: number,
  beforeIso: string,
  excludeFixtureId: number,
): Promise<string | null> {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .in("status_short", [...FINISHED])
    .lt("date", beforeIso)
    .neq("id", excludeFixtureId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.date ? String(data.date) : null;
}

async function countLeagueTeams(leagueId: number, season: number): Promise<number | null> {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("standings")
    .select("team_id")
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) throw error;
  const n = new Set((data ?? []).map((row) => Number(row.team_id))).size;
  return n > 0 ? n : null;
}
