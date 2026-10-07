import "server-only";

import { loadPlayerDirectory, playerLabel } from "@/utils/players/directory";
import { asNumber, asRecord, nestNumber, standingSide } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

import { loadBothTeamsToScore } from "./btts";
import { parseTeamCards } from "../rates";
import type { StandingRow } from "./data";

export type SideTotals = {
  played: number | null;
  win: number | null;
  draw: number | null;
  lose: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalsDiff: number | null;
  points: number | null;
};

export type DisciplineLeader = {
  playerId: number;
  name: string;
  yellows: number;
  fouls: number | null;
};

export type StandingsLensRow = {
  teamId: number;
  team: string;
  logoUrl: string | null;
  rank: number | null;
  description: string | null;
  movement: string | null;
  form: string | null;
  overall: SideTotals;
  home: SideTotals;
  away: SideTotals;
  /** (yellow + red) / games played from team_statistics card buckets. */
  cardsPerGame: number | null;
  totalYellows: number | null;
  yellowsPerGame: number | null;
  reds: number | null;
  topYellow: DisciplineLeader | null;
  leaders: DisciplineLeader[];
  bttsPct: number | null;
  bttsLast5: boolean[];
  over25Pct: number | null;
  gfPerGame: number | null;
  gaPerGame: number | null;
  cleanSheets: number | null;
  nextOpponent: string | null;
  nextFixtureId: number | null;
  nextOdd: string | null;
  /** Actionable betting line for the accordion. */
  narrative: string;
};

const IN_CHUNK = 200;

/**
 * Multi-lens standings enricher.
 * Sources: `standings` + `team_statistics` + `player_season_stats` (no `league_table_advanced`).
 * Pass `groups` when the caller already loaded `loadLeague` to avoid a second standings round-trip.
 */
export async function loadStandingsLenses(
  leagueId: number,
  season: number,
  groups?: Array<{ name: string; rows: StandingRow[] }>,
): Promise<Map<number, StandingsLensRow>> {
  const rows = groups?.flatMap((group) => group.rows) ?? (await loadStandingRows(leagueId, season));
  const map = new Map<number, StandingsLensRow>();
  if (rows.length === 0) return map;
  const teamIds = [...new Set(rows.map((row) => row.teamId).filter((id) => id > 0))];
  const supabase = createIngestClient();
  const [{ data: standings, error: standingError }, { data: stats, error: statsError }, btts] =
    await Promise.all([
      supabase
        .from("standings")
        .select("team_id, points, goals_diff, all_stats, home_stats, away_stats")
        .eq("league_id", leagueId)
        .eq("season", season)
        .in("team_id", teamIds),
      supabase
        .from("team_statistics")
        .select("team_id, stats")
        .eq("league_id", leagueId)
        .eq("season", season)
        .in("team_id", teamIds),
      loadBothTeamsToScore(
        leagueId,
        season,
        rows.map((row) => ({ id: row.teamId, name: row.team, logo: row.logoUrl })),
      ),
    ]);
  if (standingError) throw standingError;
  if (statsError) throw statsError;

  const standingByTeam = new Map((standings ?? []).map((row) => [Number(row.team_id), row]));
  const statsByTeam = new Map((stats ?? []).map((row) => [Number(row.team_id), row.stats]));
  const bttsByTeam = new Map(btts.map((row) => [row.teamId, row]));
  const leaders = await loadDisciplineLeaders(teamIds, leagueId, season);

  for (const row of rows) {
    const standing = standingByTeam.get(row.teamId);
    const statsPayload = statsByTeam.get(row.teamId);
    const parsed = parseTeamCards(statsPayload);
    const cleanSheets = cleanSheetTotal(statsPayload);
    const overall = sideTotals(
      standing?.all_stats,
      standing?.points ?? row.points,
      standing?.goals_diff ?? row.goalsDiff,
    );
    const home = sideTotals(standing?.home_stats, null, null);
    const away = sideTotals(standing?.away_stats, null, null);
    const played = overall.played;
    const yellowsPerGame =
      parsed.yellows != null && played != null && played > 0
        ? Number((parsed.yellows / played).toFixed(2))
        : null;
    const cardTotal =
      parsed.yellows == null && parsed.reds == null
        ? null
        : (parsed.yellows ?? 0) + (parsed.reds ?? 0);
    const cardsPerGame =
      cardTotal != null && played != null && played > 0
        ? Number((cardTotal / played).toFixed(2))
        : null;
    const bttsRow = bttsByTeam.get(row.teamId);
    const teamLeaders = leaders.get(row.teamId) ?? [];
    const bttsRate =
      bttsRow?.seasonPct != null
        ? `${Math.round(bttsRow.seasonPct)}%`
        : bttsRow?.hits
          ? bttsRow.hits
          : null;
    const narrative = [
      bttsRow?.nextOpponent ? `Next: vs ${bttsRow.nextOpponent}` : null,
      bttsRate ? `BTTS ${bttsRate}` : null,
      yellowsPerGame != null ? `Yellows ${yellowsPerGame.toFixed(1)}/g` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    map.set(row.teamId, {
      teamId: row.teamId,
      team: row.team,
      logoUrl: row.logoUrl,
      rank: row.rank,
      description: row.description,
      movement: row.movement,
      form: row.form,
      overall,
      home,
      away,
      cardsPerGame,
      totalYellows: parsed.yellows,
      yellowsPerGame,
      reds: parsed.reds,
      topYellow: teamLeaders[0] ?? null,
      leaders: teamLeaders.slice(0, 3),
      bttsPct: bttsRow?.seasonPct ?? null,
      bttsLast5: bttsRow?.last5 ?? [],
      over25Pct: parsed.over25,
      gfPerGame:
        parsed.gfAvg ??
        (overall.goalsFor != null && played ? Number((overall.goalsFor / played).toFixed(2)) : null),
      gaPerGame:
        parsed.gaAvg ??
        (overall.goalsAgainst != null && played
          ? Number((overall.goalsAgainst / played).toFixed(2))
          : null),
      cleanSheets,
      nextOpponent: bttsRow?.nextOpponent ?? null,
      nextFixtureId: bttsRow?.nextFixtureId ?? null,
      nextOdd: bttsRow?.nextOdd ?? null,
      narrative,
    });
  }
  return map;
}

/** Minimal standing identity when caller only has leagueId + season. */
async function loadStandingRows(leagueId: number, season: number): Promise<StandingRow[]> {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("standings")
    .select("team_id, rank, points, goals_diff, form, description, status, all_stats, home_stats, away_stats")
    .eq("league_id", leagueId)
    .eq("season", season)
    .order("rank");
  if (error) throw error;
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const { data: teams } =
    teamIds.length === 0
      ? { data: [] as Array<{ id: number; name: string; logo: string | null }> }
      : await supabase.from("teams").select("id, name, logo").in("id", teamIds);
  const teamById = new Map((teams ?? []).map((team) => [Number(team.id), team]));
  return (data ?? []).map((row) => {
    const team = teamById.get(Number(row.team_id));
    const side = standingSide(row.all_stats);
    const home = standingSide(row.home_stats);
    const away = standingSide(row.away_stats);
    return {
      teamId: Number(row.team_id),
      team: team?.name ?? "Team",
      logoUrl: team?.logo ?? null,
      rank: asNumber(row.rank),
      points: asNumber(row.points),
      goalsDiff: asNumber(row.goals_diff),
      played: side.played,
      win: side.win,
      draw: side.draw,
      lose: side.lose,
      goalsFor: side.goalsFor,
      goalsAgainst: side.goalsAgainst,
      form: typeof row.form === "string" ? row.form : null,
      description: typeof row.description === "string" ? row.description : null,
      movement: typeof row.status === "string" ? row.status : null,
      homeRecord:
        home.win == null && home.draw == null && home.lose == null
          ? null
          : `${home.win ?? 0}-${home.draw ?? 0}-${home.lose ?? 0}`,
      awayRecord:
        away.win == null && away.draw == null && away.lose == null
          ? null
          : `${away.win ?? 0}-${away.draw ?? 0}-${away.lose ?? 0}`,
    };
  });
}

function cleanSheetTotal(payload: unknown) {
  const body = asRecord(payload);
  const cleanSheet = asRecord(body?.clean_sheet);
  return asNumber(cleanSheet?.total);
}

function sideTotals(stats: unknown, points: number | null, goalsDiff: number | null): SideTotals {
  const side = standingSide(stats);
  const derivedPoints =
    side.win == null && side.draw == null ? points : (side.win ?? 0) * 3 + (side.draw ?? 0);
  const derivedDiff =
    side.goalsFor == null && side.goalsAgainst == null ? goalsDiff : (side.goalsFor ?? 0) - (side.goalsAgainst ?? 0);
  return {
    played: side.played,
    win: side.win,
    draw: side.draw,
    lose: side.lose,
    goalsFor: side.goalsFor,
    goalsAgainst: side.goalsAgainst,
    goalsDiff: derivedDiff,
    points: derivedPoints,
  };
}

async function loadDisciplineLeaders(teamIds: number[], leagueId: number, season: number) {
  const map = new Map<number, DisciplineLeader[]>();
  if (teamIds.length === 0) return map;
  const supabase = createIngestClient();
  const rows: Array<{
    player_id: number;
    team_id: number;
    yellow_cards: number | null;
    stats_data: unknown;
  }> = [];
  for (const chunk of chunks(teamIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, team_id, yellow_cards, stats_data")
      .eq("league_id", leagueId)
      .eq("season", season)
      .in("team_id", chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as typeof rows));
  }
  const playerIds = [...new Set(rows.map((row) => Number(row.player_id)))];
  const directory = await loadPlayerDirectory(supabase, playerIds, { teamIds });
  const byTeam = new Map<number, DisciplineLeader[]>();
  for (const row of rows) {
    const teamId = Number(row.team_id);
    const playerId = Number(row.player_id);
    const yellows = Number(row.yellow_cards) || 0;
    const fouls = nestNumber(row.stats_data, "fouls", "committed");
    if (yellows <= 0 && (fouls == null || fouls <= 0)) continue;
    const list = byTeam.get(teamId) ?? [];
    list.push({
      playerId,
      name: playerLabel(directory, playerId),
      yellows,
      fouls,
    });
    byTeam.set(teamId, list);
  }
  for (const [teamId, list] of byTeam) {
    map.set(
      teamId,
      list.sort((left, right) => right.yellows - left.yellows || (right.fouls ?? 0) - (left.fouls ?? 0)).slice(0, 3),
    );
  }
  return map;
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
