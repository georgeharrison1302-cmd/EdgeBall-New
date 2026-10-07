import "server-only";

import { parseTeamCards } from "@/app/rates";
import { asNumber, isMissingRelation, nestNumber } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";
import { fixtureStatNumber, fixtureYellows } from "@/utils/stats/referees";

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"] as const;
/** Prefer recent finished sheets when deriving team yellow averages. */
const RECENT_TEAM_MATCHES = 12;

export type TeamYellowScope = {
  teamId: number;
  leagueId: number;
  season: number;
};

export type SheetContext = {
  teamId: number;
  xgPerGame: number | null;
  cornersPerGame: number | null;
};

export type TeamFoulRates = {
  committedPerGame: number | null;
  drawnPerGame: number | null;
};

/**
 * Team yellows/game from `fixture_statistics` joined to finished `fixtures`.
 * Falls back to `team_statistics` cards totals when sheets are sparse.
 */
export async function loadTeamYellowRates(scopes: TeamYellowScope[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = dedupeScopes(scopes);
  if (unique.length === 0) return map;

  const fromSheets = await yellowRatesFromFixtureStatistics(unique);
  for (const [key, value] of fromSheets) map.set(key, value);

  const missing = unique.filter((scope) => !map.has(scopeKey(scope)));
  if (missing.length === 0) return map;

  const fromTeamStats = await yellowRatesFromTeamStatistics(missing);
  for (const [key, value] of fromTeamStats) {
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

/** Soft-read `team_match_sheet_totals` for game-script context (xg / corners). */
export async function loadTeamSheetContext(
  scopes: TeamYellowScope[],
): Promise<Map<string, SheetContext>> {
  const map = new Map<string, SheetContext>();
  const unique = dedupeScopes(scopes);
  if (unique.length === 0) return map;
  const supabase = createIngestClient();
  const teamIds = [...new Set(unique.map((scope) => scope.teamId))];
  const leagueIds = [...new Set(unique.map((scope) => scope.leagueId))];
  const seasons = [...new Set(unique.map((scope) => scope.season))];
  const { data, error } = await supabase
    .from("team_match_sheet_totals")
    .select("team_id, league_id, season, xg_per_game, corners_per_game")
    .in("team_id", teamIds)
    .in("league_id", leagueIds)
    .in("season", seasons);
  if (error) {
    if (isMissingRelation(error)) return map;
    throw error;
  }
  for (const row of data ?? []) {
    const key = `${row.team_id}:${row.league_id}:${row.season}`;
    map.set(key, {
      teamId: Number(row.team_id),
      xgPerGame: asNumber(row.xg_per_game),
      cornersPerGame: asNumber(row.corners_per_game),
    });
  }
  return map;
}

/** Season foul rates from `player_season_stats` (team aggregate /90 → per game). */
export async function loadTeamFoulRates(
  homeId: number,
  awayId: number,
  leagueId: number,
  season: number,
): Promise<{ home: TeamFoulRates; away: TeamFoulRates }> {
  const empty: TeamFoulRates = { committedPerGame: null, drawnPerGame: null };
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("team_id, appearances, stats_data")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("team_id", [homeId, awayId])
    .gt("appearances", 0);
  if (error) {
    if (isMissingRelation(error)) return { home: empty, away: empty };
    throw error;
  }

  const buckets = new Map<number, { committed: number; drawn: number; minutes: number }>();
  for (const row of data ?? []) {
    const teamId = Number(row.team_id);
    const apps = Number(row.appearances);
    if (!Number.isFinite(apps) || apps <= 0) continue;
    const minutes = nestNumber(row.stats_data, "games", "minutes") ?? apps * 90;
    const committed = nestNumber(row.stats_data, "fouls", "committed") ?? 0;
    const drawn = nestNumber(row.stats_data, "fouls", "drawn") ?? 0;
    const bucket = buckets.get(teamId) ?? { committed: 0, drawn: 0, minutes: 0 };
    bucket.committed += committed;
    bucket.drawn += drawn;
    bucket.minutes += Math.max(0, minutes);
    buckets.set(teamId, bucket);
  }

  function rates(teamId: number): TeamFoulRates {
    const bucket = buckets.get(teamId);
    if (!bucket || bucket.minutes < 90) return empty;
    return {
      committedPerGame: Number(((bucket.committed * 90) / bucket.minutes).toFixed(2)),
      drawnPerGame: Number(((bucket.drawn * 90) / bucket.minutes).toFixed(2)),
    };
  }

  return { home: rates(homeId), away: rates(awayId) };
}

export function buildMatchClash(home: TeamFoulRates, away: TeamFoulRates) {
  // Prefer the stronger of the two collision directions when both clear 2.0.
  const candidates = [
    { playerRate: home.drawnPerGame, opponentRate: away.committedPerGame },
    { playerRate: away.drawnPerGame, opponentRate: home.committedPerGame },
  ].filter(
    (row): row is { playerRate: number; opponentRate: number } =>
      row.playerRate != null &&
      row.opponentRate != null &&
      row.playerRate >= 2 &&
      row.opponentRate >= 2,
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (left, right) => left.playerRate + left.opponentRate - (right.playerRate + right.opponentRate),
  );
  const best = candidates[candidates.length - 1];
  return {
    playerRate: best.playerRate,
    opponentRate: best.opponentRate,
    label: "Fouls drawn vs fouls committed",
  };
}

export function buildGameScript(input: {
  homeName: string;
  awayName: string;
  homeYellows: number | null;
  awayYellows: number | null;
  homeSheet?: SheetContext | null;
  awaySheet?: SheetContext | null;
  h2hCount?: number;
}): { label: string; detail: string } | null {
  const homeY = input.homeYellows;
  const awayY = input.awayYellows;
  if (homeY != null && awayY != null) {
    const combined = homeY + awayY;
    if (combined >= 5) {
      return {
        label: "Card-heavy sides",
        detail: `${input.homeName} ${homeY.toFixed(1)} + ${input.awayName} ${awayY.toFixed(1)} yellows/game`,
      };
    }
  }

  const homeXg = input.homeSheet?.xgPerGame;
  const awayXg = input.awaySheet?.xgPerGame;
  if (homeXg != null && awayXg != null && homeXg + awayXg >= 3) {
    return {
      label: "Open game script",
      detail: `Combined xG/game ${(homeXg + awayXg).toFixed(1)} from match sheets`,
    };
  }

  const homeC = input.homeSheet?.cornersPerGame;
  const awayC = input.awaySheet?.cornersPerGame;
  if (homeC != null && awayC != null && homeC + awayC >= 10) {
    return {
      label: "Corner-heavy script",
      detail: `Combined corners/game ${(homeC + awayC).toFixed(1)}`,
    };
  }

  if ((input.h2hCount ?? 0) >= 3) {
    return { label: "Rivalry", detail: `${input.h2hCount} stored meetings` };
  }
  return null;
}

async function yellowRatesFromFixtureStatistics(scopes: TeamYellowScope[]) {
  const map = new Map<string, number>();
  const supabase = createIngestClient();
  const teamIds = [...new Set(scopes.map((scope) => scope.teamId))];
  const leagueIds = [...new Set(scopes.map((scope) => scope.leagueId))];
  const seasons = [...new Set(scopes.map((scope) => scope.season))];

  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, home_team_id, away_team_id, league_id, season, date")
    .in("league_id", leagueIds)
    .in("season", seasons)
    .in("status_short", [...FINISHED])
    .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
    .order("date", { ascending: false })
    .limit(Math.min(2000, teamIds.length * RECENT_TEAM_MATCHES * 2));
  if (error) {
    if (isMissingRelation(error)) return map;
    throw error;
  }

  const wanted = new Set(scopes.map(scopeKey));
  const recentByTeam = new Map<string, number[]>();
  for (const fixture of fixtures ?? []) {
    const leagueId = Number(fixture.league_id);
    const season = Number(fixture.season);
    for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
      if (teamId == null) continue;
      const key = `${teamId}:${leagueId}:${season}`;
      if (!wanted.has(key)) continue;
      const list = recentByTeam.get(key) ?? [];
      if (list.length >= RECENT_TEAM_MATCHES) continue;
      list.push(Number(fixture.id));
      recentByTeam.set(key, list);
    }
  }

  const fixtureIds = [...new Set([...recentByTeam.values()].flat())];
  if (fixtureIds.length === 0) return map;

  const yellowsByFixtureTeam = new Map<string, number>();
  for (let index = 0; index < fixtureIds.length; index += 200) {
    const chunk = fixtureIds.slice(index, index + 200);
    const { data: stats, error: statsError } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, team_id, statistics")
      .in("fixture_id", chunk);
    if (statsError) {
      if (isMissingRelation(statsError) || /column .* does not exist/i.test(statsError.message)) {
        return map;
      }
      throw statsError;
    }
    for (const row of stats ?? []) {
      const yellows =
        fixtureYellows(row.statistics) ??
        fixtureStatNumber(row.statistics, "Yellow Cards") ??
        fixtureStatNumber(row.statistics, "Yellow cards");
      if (yellows == null) continue;
      yellowsByFixtureTeam.set(`${row.fixture_id}:${row.team_id}`, yellows);
    }
  }

  for (const [key, ids] of recentByTeam) {
    let sum = 0;
    let n = 0;
    const teamId = Number(key.split(":")[0]);
    for (const fixtureId of ids) {
      const yellows = yellowsByFixtureTeam.get(`${fixtureId}:${teamId}`);
      if (yellows == null) continue;
      sum += yellows;
      n += 1;
    }
    if (n >= 3) map.set(key, Number((sum / n).toFixed(2)));
  }
  return map;
}

async function yellowRatesFromTeamStatistics(scopes: TeamYellowScope[]) {
  const map = new Map<string, number>();
  const supabase = createIngestClient();
  const teamIds = [...new Set(scopes.map((scope) => scope.teamId))];
  const { data, error } = await supabase
    .from("team_statistics")
    .select("team_id, league_id, season, stats")
    .in("team_id", teamIds);
  if (error) {
    if (isMissingRelation(error)) return map;
    throw error;
  }
  const wanted = new Set(scopes.map(scopeKey));
  for (const row of data ?? []) {
    const key = `${row.team_id}:${row.league_id}:${row.season}`;
    if (!wanted.has(key)) continue;
    const parsed = parseTeamCards(row.stats);
    const played = nestNumber(row.stats, "fixtures", "played", "total");
    if (parsed.yellows == null || played == null || played < 1) continue;
    map.set(key, Number((parsed.yellows / played).toFixed(2)));
  }
  return map;
}

function scopeKey(scope: TeamYellowScope) {
  return `${scope.teamId}:${scope.leagueId}:${scope.season}`;
}

function dedupeScopes(scopes: TeamYellowScope[]) {
  const map = new Map<string, TeamYellowScope>();
  for (const scope of scopes) {
    if (!Number.isInteger(scope.teamId) || scope.teamId <= 0) continue;
    if (!Number.isInteger(scope.leagueId) || !Number.isInteger(scope.season)) continue;
    map.set(scopeKey(scope), scope);
  }
  return [...map.values()];
}
