import "server-only";

import { isMissingRelation, standingSide } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

export type Bar = {
  label: string;
  home: string;
  away: string;
  homeShare: number;
};

export type Comparison = {
  bars: Bar[];
  homePlayed: number | null;
  awayPlayed: number | null;
};

type SideRate = {
  played: number;
  scored: number | null;
  conceded: number | null;
  yellows: number | null;
  cleanSheets: number | null;
  failedToScore: number | null;
  xg: number | null;
  homeXg: number | null;
  awayXg: number | null;
  xc: number | null;
  homeXc: number | null;
  awayXc: number | null;
  corners: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
};

export async function loadComparison(leagueId: number, season: number, homeId: number, awayId: number): Promise<Comparison> {
  const supabase = createAdminClient();
  const [{ data: standings, error }, { data: stats, error: statsError }, sheetResult] = await Promise.all([
    supabase
      .from("standings")
      .select("team_id, all_stats")
      .eq("league_id", leagueId)
      .eq("season", season)
      .in("team_id", [homeId, awayId]),
    supabase
      .from("team_statistics")
      .select("team_id, stats")
      .eq("league_id", leagueId)
      .eq("season", season)
      .in("team_id", [homeId, awayId]),
    supabase
      .from("team_match_sheet_totals")
      .select("team_id, xg_per_game, home_xg_per_game, away_xg_per_game, xc_per_game, home_xc_per_game, away_xc_per_game, corners_per_game, home_corners_per_game, away_corners_per_game")
      .eq("league_id", leagueId)
      .eq("season", season)
      .in("team_id", [homeId, awayId]),
  ]);
  if (error) throw error;
  if (statsError) throw statsError;
  const sheets = sheetResult.error && isMissingRelation(sheetResult.error) ? [] : sheetResult.error ? (() => { throw sheetResult.error; })() : sheetResult.data ?? [];
  const home = sideRate(homeId, standings ?? [], stats ?? [], sheets);
  const away = sideRate(awayId, standings ?? [], stats ?? [], sheets);
  return {
    bars: comparisonBars(home, away),
    homePlayed: home?.played ?? null,
    awayPlayed: away?.played ?? null,
  };
}

function sideRate(
  teamId: number,
  standings: Array<{ team_id: number; all_stats: unknown }>,
  stats: Array<{ team_id: number; stats: unknown }>,
  sheets: Array<{
    team_id: number | null;
    xg_per_game: number | null;
    home_xg_per_game: number | null;
    away_xg_per_game: number | null;
    xc_per_game: number | null;
    home_xc_per_game: number | null;
    away_xc_per_game: number | null;
    corners_per_game: number | null;
    home_corners_per_game: number | null;
    away_corners_per_game: number | null;
  }>,
): SideRate | null {
  const row = standings.find((item) => item.team_id === teamId);
  const all = standingSide(row?.all_stats);
  if (!all.played) return null;
  const parsed = parsePayload(stats.find((item) => item.team_id === teamId)?.stats);
  const sheet = sheets.find((item) => item.team_id === teamId);
  return {
    played: all.played,
    scored: perGame(all.goalsFor, all.played),
    conceded: perGame(all.goalsAgainst, all.played),
    yellows: perGame(parsed.yellows, all.played),
    cleanSheets: perGame(parsed.cleanSheets, all.played),
    failedToScore: perGame(parsed.failedToScore, all.played),
    xg: num(sheet?.xg_per_game),
    homeXg: num(sheet?.home_xg_per_game),
    awayXg: num(sheet?.away_xg_per_game),
    xc: num(sheet?.xc_per_game),
    homeXc: num(sheet?.home_xc_per_game),
    awayXc: num(sheet?.away_xc_per_game),
    corners: num(sheet?.corners_per_game),
    homeCorners: num(sheet?.home_corners_per_game),
    awayCorners: num(sheet?.away_corners_per_game),
  };
}

function num(value: number | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function comparisonBars(home: SideRate | null, away: SideRate | null): Bar[] {
  if (!home || !away) return [];
  const rows: Array<[string, number | null, number | null]> = [
    ["Goals scored / game", home.scored, away.scored],
    ["Expected goals / game", home.xg, away.xg],
    ["Home expected goals / game", home.homeXg, away.homeXg],
    ["Away expected goals / game", home.awayXg, away.awayXg],
    ["Expected conceded / game", home.xc, away.xc],
    ["Home expected conceded / game", home.homeXc, away.homeXc],
    ["Away expected conceded / game", home.awayXc, away.awayXc],
    ["Home corners / game", home.homeCorners, away.homeCorners],
    ["Away corners / game", home.awayCorners, away.awayCorners],
    ["Corners / game", home.corners, away.corners],
    ["Goals conceded / game", home.conceded, away.conceded],
    ["Yellow cards / game", home.yellows, away.yellows],
    ["Clean sheets / game", home.cleanSheets, away.cleanSheets],
    ["Failed to score / game", home.failedToScore, away.failedToScore],
  ];
  return rows.flatMap(([label, left, right]) => {
    if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) return [];
    const sum = left + right;
    return [
      {
        label,
        home: left.toFixed(/expected|corner/i.test(label) ? 2 : 1),
        away: right.toFixed(/expected|corner/i.test(label) ? 2 : 1),
        homeShare: sum === 0 ? 50 : (left / sum) * 100,
      },
    ];
  });
}

function perGame(total: number | null | undefined, played: number) {
  if (total === null || total === undefined || played < 1) return null;
  return total / played;
}

export function parseTeamCards(payload: unknown) {
  const body = asRecord(payload);
  const cards = asRecord(body?.cards);
  const goals = asRecord(body?.goals);
  const goalsFor = asRecord(goals?.for);
  const goalsAgainst = asRecord(goals?.against);
  const over = asRecord(asRecord(goalsFor?.under_over)?.["2.5"]);
  const overCount = asNumber(over?.over);
  const underCount = asNumber(over?.under);
  const overSample = (overCount ?? 0) + (underCount ?? 0);
  return {
    yellows: cardTotal(cards?.yellow),
    reds: cardTotal(cards?.red),
    gfAvg: avgNumber(asRecord(goalsFor?.average)?.total),
    gaAvg: avgNumber(asRecord(goalsAgainst?.average)?.total),
    over25: overSample > 0 && overCount != null ? (overCount / overSample) * 100 : null,
  };
}

function parsePayload(payload: unknown) {
  const body = asRecord(payload);
  const cleanSheet = asRecord(body?.clean_sheet);
  const failed = asRecord(body?.failed_to_score);
  const cards = asRecord(body?.cards);
  return {
    cleanSheets: asNumber(cleanSheet?.total),
    failedToScore: asNumber(failed?.total),
    yellows: cardTotal(cards?.yellow),
  };
}

function avgNumber(value: unknown) {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return asNumber(value);
}

function cardTotal(value: unknown) {
  const buckets = asRecord(value);
  if (!buckets) return null;
  let sum = 0;
  let any = false;
  for (const bucket of Object.values(buckets)) {
    const total = asNumber(asRecord(bucket)?.total);
    if (total === null) continue;
    sum += total;
    any = true;
  }
  return any ? sum : null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}
