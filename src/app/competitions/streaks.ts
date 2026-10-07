import "server-only";

import { loadPlayerDirectory, playerLabel, playerPhoto } from "@/utils/players/directory";
import { nestNumber } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

export type StreakStat = "shots" | "sot" | "fouls" | "tackles";

export type PlayerStreak = {
  playerId: number;
  name: string;
  photo: string | null;
  team: string;
  position: string | null;
  streak: number;
  average: number | null;
  last5: Array<number | null>;
  /** `form` when FPS has data; `season` when falling back to player_season_stats. */
  source: "form" | "season";
};

const STATS: Record<StreakStat, { group: string; key: string }> = {
  shots: { group: "shots", key: "total" },
  sot: { group: "shots", key: "on" },
  fouls: { group: "fouls", key: "committed" },
  tackles: { group: "tackles", key: "total" },
};

export async function loadPlayerStreaks(
  leagueId: number,
  season: number,
  stat: StreakStat,
  line: number,
): Promise<PlayerStreak[]> {
  const fromForm = await loadFromFixturePlayerStats(leagueId, season, stat, line);
  if (fromForm.length > 0) return fromForm;
  return loadFromSeasonAverages(leagueId, season, stat, line);
}

async function loadFromFixturePlayerStats(
  leagueId: number,
  season: number,
  stat: StreakStat,
  line: number,
): Promise<PlayerStreak[]> {
  const supabase = createAdminClient();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, date")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("status_short", ["FT", "AET", "PEN"])
    .order("date");
  if (error) throw error;
  const kickoffs = new Map((fixtures ?? []).map((fixture) => [fixture.id, fixture.date ?? ""]));
  const ids = [...kickoffs.keys()];
  if (ids.length === 0) return [];

  const played: Array<{
    playerId: number;
    teamId: number | null;
    kickoff: string;
    value: number | null;
    position: string | null;
  }> = [];
  for (let index = 0; index < ids.length; index += 80) {
    const { data, error: statError } = await supabase
      .from("fixture_player_statistics")
      .select("player_id, team_id, statistics, fixture_id")
      .in("fixture_id", ids.slice(index, index + 80));
    if (statError) throw statError;
    if ((data ?? []).length === 0) continue;
    for (const row of data ?? []) {
      const body = statBlock(row.statistics);
      const minutes = nestedNumber(body, "games", "minutes") ?? 0;
      if (minutes < 1) continue;
      played.push({
        playerId: row.player_id,
        teamId: row.team_id,
        kickoff: kickoffs.get(row.fixture_id) ?? "",
        value: nestedNumber(body, STATS[stat].group, STATS[stat].key),
        position: nestedText(body, "games", "position"),
      });
    }
  }
  if (played.length === 0) return [];

  const byPlayer = new Map<number, typeof played>();
  for (const row of played) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }
  const ranked = [...byPlayer.entries()].flatMap(([playerId, rows]) => {
    const ordered = rows.sort((left, right) => left.kickoff.localeCompare(right.kickoff));
    const values = ordered.map((row) => row.value);
    let streak = 0;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index];
      if (value == null || value < line) break;
      streak += 1;
    }
    if (streak < 1) return [];
    const counted = values.filter((value): value is number => value != null);
    const latest = ordered.at(-1);
    return [
      {
        playerId,
        teamId: latest?.teamId ?? null,
        position: latest?.position ?? null,
        streak,
        average:
          counted.length === 0 ? null : counted.reduce((sum, value) => sum + value, 0) / counted.length,
        last5: values.slice(-5),
      },
    ];
  });
  ranked.sort(
    (left, right) => right.streak - left.streak || (right.average ?? -1) - (left.average ?? -1),
  );
  return hydrateStreaks(ranked.slice(0, 30), "form");
}

async function loadFromSeasonAverages(
  leagueId: number,
  season: number,
  stat: StreakStat,
  line: number,
): Promise<PlayerStreak[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("player_id, team_id, appearances, stats_data")
    .eq("league_id", leagueId)
    .eq("season", season)
    .gte("appearances", 5)
    .limit(2000);
  if (error) throw error;

  const ranked = (data ?? []).flatMap((row) => {
    const apps = Number(row.appearances);
    if (!Number.isFinite(apps) || apps < 5) return [];
    const total = nestNumber(row.stats_data, STATS[stat].group, STATS[stat].key);
    if (total == null) return [];
    const average = total / apps;
    if (average < line) return [];
    return [
      {
        playerId: Number(row.player_id),
        teamId: Number(row.team_id),
        position: null as string | null,
        streak: 0,
        average,
        last5: [] as Array<number | null>,
      },
    ];
  });
  ranked.sort((left, right) => (right.average ?? -1) - (left.average ?? -1));
  return hydrateStreaks(ranked.slice(0, 30), "season");
}

async function hydrateStreaks(
  shown: Array<{
    playerId: number;
    teamId: number | null;
    position: string | null;
    streak: number;
    average: number | null;
    last5: Array<number | null>;
  }>,
  source: "form" | "season",
): Promise<PlayerStreak[]> {
  const supabase = createAdminClient();
  const playerIds = shown.map((row) => row.playerId);
  const teamIds = [...new Set(shown.flatMap((row) => (row.teamId == null ? [] : [row.teamId])))];
  const [directory, { data: teams, error: teamError }] = await Promise.all([
    loadPlayerDirectory(supabase, playerIds, { teamIds }),
    teamIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("teams").select("id, name").in("id", teamIds),
  ]);
  if (teamError) throw teamError;
  const clubs = new Map((teams ?? []).map((team) => [team.id, team.name]));
  return shown.map((row) => ({
    playerId: row.playerId,
    name: playerLabel(directory, row.playerId),
    photo: playerPhoto(directory, row.playerId),
    team: row.teamId == null ? "Club" : clubs.get(row.teamId) ?? "Club",
    position: row.position,
    streak: row.streak,
    average: row.average == null ? null : Math.round(row.average * 10) / 10,
    last5: row.last5,
    source,
  }));
}

function statBlock(stats: unknown) {
  const row = Array.isArray(stats) ? stats[0] : stats;
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}

function nestedNumber(body: Record<string, unknown> | null, group: string, key: string) {
  const section = body?.[group];
  if (!section || typeof section !== "object") return null;
  const value = (section as Record<string, unknown>)[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nestedText(body: Record<string, unknown> | null, group: string, key: string) {
  const section = body?.[group];
  if (!section || typeof section !== "object") return null;
  const value = (section as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
