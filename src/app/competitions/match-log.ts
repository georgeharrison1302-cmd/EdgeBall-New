import "server-only";

import { asNumber, asRecord, isMissingRelation } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

import type { MatchLogRow } from "./match-types";

export type { MatchLogRow } from "./match-types";

export type HitRate = { label: string; hits: number; games: number };

export type FormStatKind =
  | "card"
  | "foul1"
  | "foul2"
  | "fouls"
  | "drawn"
  | "sot"
  | "shots"
  | "tackles"
  | "saves";

type FpsRow = {
  fixture_id: number;
  team_id: number;
  player_id: number;
  statistics: unknown;
};

/**
 * Cross-competition player match log.
 * Query is **player_id only** — no league_id / competition filter — so club and
 * international appearances (e.g. Championship → Nations League) share one Last-N.
 * Sorted by fixture date DESC, then limited.
 */
export async function loadMatchLog(playerId: number, limit: number): Promise<MatchLogRow[]> {
  const map = await loadMatchLogsByPlayers([playerId], limit);
  return map.get(playerId) ?? [];
}

/**
 * Batch Last-N logs for many players (one FPS query per chunk + shared fixture hydrate).
 * Used by Prop Builder so every priced row gets form, not just the first 60 IDs.
 */
export async function loadMatchLogsByPlayers(
  playerIds: number[],
  limit: number,
): Promise<Map<number, MatchLogRow[]>> {
  const result = new Map<number, MatchLogRow[]>();
  const unique = [
    ...new Set(
      playerIds.filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (unique.length === 0) return result;

  const supabase = createIngestClient();
  const raw: FpsRow[] = [];

  for (let index = 0; index < unique.length; index += 80) {
    const chunk = unique.slice(index, index + 80);
    const { data, error } = await supabase
      .from("fixture_player_statistics")
      .select("fixture_id, team_id, player_id, statistics")
      .in("player_id", chunk);
    if (error) {
      if (isMissingRelation(error) || /column .* does not exist/i.test(error.message)) {
        return result;
      }
      throw error;
    }
    for (const row of data ?? []) {
      raw.push({
        fixture_id: Number(row.fixture_id),
        team_id: Number(row.team_id),
        player_id: Number(row.player_id),
        statistics: row.statistics,
      });
    }
  }

  if (raw.length === 0) return result;

  const fixtureIds = [
    ...new Set(raw.map((row) => row.fixture_id).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  const fixtures: Array<{
    id: number;
    date: string | null;
    referee: string | null;
    home_team_id: number | null;
    away_team_id: number | null;
    home_goals: number | null;
    away_goals: number | null;
  }> = [];
  for (let index = 0; index < fixtureIds.length; index += 200) {
    const chunk = fixtureIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, date, referee, home_team_id, away_team_id, home_goals, away_goals")
      .in("id", chunk);
    if (error) throw error;
    for (const fixture of data ?? []) {
      fixtures.push({
        id: Number(fixture.id),
        date: fixture.date == null ? null : String(fixture.date),
        referee: typeof fixture.referee === "string" ? fixture.referee : null,
        home_team_id: fixture.home_team_id == null ? null : Number(fixture.home_team_id),
        away_team_id: fixture.away_team_id == null ? null : Number(fixture.away_team_id),
        home_goals: fixture.home_goals == null ? null : Number(fixture.home_goals),
        away_goals: fixture.away_goals == null ? null : Number(fixture.away_goals),
      });
    }
  }

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const teamIds = [
    ...new Set(
      fixtures
        .flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id])
        .filter((id): id is number => id != null),
    ),
  ];
  const names = new Map<number, string>();
  for (let index = 0; index < teamIds.length; index += 200) {
    const chunk = teamIds.slice(index, index + 200);
    const { data: clubs } = await supabase.from("teams").select("id, name").in("id", chunk);
    for (const club of clubs ?? []) {
      names.set(Number(club.id), String(club.name));
    }
  }

  const byPlayer = new Map<number, MatchLogRow[]>();
  for (const row of raw) {
    const fixture = fixtureById.get(row.fixture_id);
    if (!fixture) continue;
    const isHome = row.team_id === fixture.home_team_id;
    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
    const stats = playerStats(row.statistics);
    if (stats.minutes == null || stats.minutes <= 0) continue;
    const homeGoals = fixture.home_goals;
    const awayGoals = fixture.away_goals;
    const score =
      homeGoals != null &&
      awayGoals != null &&
      Number.isFinite(homeGoals) &&
      Number.isFinite(awayGoals)
        ? `${homeGoals}-${awayGoals}`
        : null;
    const list = byPlayer.get(row.player_id) ?? [];
    list.push({
      fixtureId: row.fixture_id,
      kickoff: String(fixture.date ?? "").replace("T", " ").slice(0, 16),
      opponent: names.get(opponentId ?? 0) ?? "Opponent",
      venue: isHome
        ? ("H" as const)
        : row.team_id === fixture.away_team_id
          ? ("A" as const)
          : null,
      score,
      referee:
        typeof fixture.referee === "string" && fixture.referee.trim()
          ? fixture.referee.trim()
          : null,
      minutes: stats.minutes,
      shots: stats.shots,
      shotsOn: stats.shotsOn,
      foulsCommitted: stats.foulsCommitted,
      foulsWon: stats.foulsWon,
      tackles: stats.tackles,
      gkSaves: stats.gkSaves,
      yellow: stats.yellow,
      red: stats.red,
    });
    byPlayer.set(row.player_id, list);
  }

  for (const playerId of unique) {
    const rows = byPlayer.get(playerId) ?? [];
    result.set(
      playerId,
      rows
        .sort((left, right) => right.kickoff.localeCompare(left.kickoff))
        .slice(0, limit),
    );
  }
  return result;
}

export function hitRates(rows: MatchLogRow[]): HitRate[] {
  return [
    rate("1+ shots", rows.map((row) => row.shots)),
    rate("1+ on target", rows.map((row) => row.shotsOn)),
    rate("1+ fouls committed", rows.map((row) => row.foulsCommitted)),
    rate("1+ fouls won", rows.map((row) => row.foulsWon)),
    rate("1+ tackles", rows.map((row) => row.tackles)),
    rate("1+ saves", rows.map((row) => row.gkSaves)),
  ].filter((item): item is HitRate => item !== null);
}

/**
 * Last-N raw counts (oldest → newest) for Statz-style numbered form boxes.
 * Skips appearances where the stat is null — never pads with zeros.
 */
export function formValues(
  rows: MatchLogRow[],
  kind: FormStatKind,
  limit = 5,
): number[] {
  const slice = rows.slice(0, limit);
  if (slice.length === 0) return [];
  const values: number[] = [];
  for (const row of [...slice].reverse()) {
    const value = valueForKind(row, kind);
    if (value != null) values.push(value);
  }
  return values;
}

export function formHits(
  rows: MatchLogRow[],
  kind: FormStatKind,
  threshold?: number,
): Array<boolean | null> {
  const line = threshold ?? defaultThreshold(kind);
  const slice = rows.slice(0, 5);
  if (slice.length === 0) return [];
  return [...slice].reverse().map((row) => {
    const value = valueForKind(row, kind);
    if (value == null) return null;
    return value >= line;
  });
}

export function formMetrics(
  rows: MatchLogRow[],
  kind: FormStatKind,
  threshold?: number,
) {
  const line = threshold ?? defaultThreshold(kind);
  const values = formValues(rows, kind, 5);
  if (values.length === 0) {
    return { values, hitPct: null as number | null, avg: null as number | null, hits: 0 };
  }
  const hits = values.filter((value) => value >= line).length;
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    values,
    hitPct: Math.round((hits / values.length) * 100),
    avg: total / values.length,
    hits,
  };
}

function defaultThreshold(kind: FormStatKind): number {
  if (kind === "foul2") return 2;
  if (kind === "saves") return 3;
  if (kind === "shots") return 2;
  return 1;
}

function valueForKind(row: MatchLogRow, kind: FormStatKind): number | null {
  if (kind === "card") {
    if (row.yellow == null && row.red == null) return null;
    return (row.yellow ?? 0) + (row.red ?? 0);
  }
  if (kind === "foul1" || kind === "foul2" || kind === "fouls") return row.foulsCommitted;
  if (kind === "drawn") return row.foulsWon;
  if (kind === "sot") return row.shotsOn;
  if (kind === "shots") return row.shots;
  if (kind === "tackles") return row.tackles;
  if (kind === "saves") return row.gkSaves;
  return null;
}

function rate(label: string, values: Array<number | null>): HitRate | null {
  if (values.length === 0 || values.every((value) => value === null)) return null;
  return {
    label,
    hits: values.filter((value) => value !== null && value >= 1).length,
    games: values.length,
  };
}

/** Prefer flat EdgeBall aliases / micro bag, fall back to nested API-Football blocks. */
function playerStats(value: unknown) {
  const body = Array.isArray(value) ? value[0] : value;
  const record = asRecord(body) ?? {};
  const micro = asRecord(record.micro);
  const games = asRecord(record.games);
  const shots = asRecord(record.shots);
  const fouls = asRecord(record.fouls);
  const cards = asRecord(record.cards);
  const tackles = asRecord(record.tackles);
  const goals = asRecord(record.goals);

  const yellow = asNumber(cards?.yellow);
  const red = asNumber(cards?.red);

  return {
    minutes: asNumber(record.minutes) ?? asNumber(games?.minutes),
    shots:
      asNumber(micro?.shots) ??
      asNumber(record.shots_total) ??
      asNumber(shots?.total),
    shotsOn: asNumber(micro?.sot) ?? asNumber(record.sot) ?? asNumber(shots?.on),
    foulsCommitted:
      asNumber(micro?.fouls_committed) ??
      asNumber(record.fouls_committed) ??
      asNumber(fouls?.committed),
    foulsWon:
      asNumber(micro?.fouls_won) ??
      asNumber(record.fouls_won) ??
      asNumber(fouls?.drawn),
    tackles:
      asNumber(micro?.tackles) ??
      asNumber(record.tackles_total) ??
      asNumber(tackles?.total),
    gkSaves:
      asNumber(micro?.gk_saves) ??
      asNumber(record.gk_saves) ??
      asNumber(goals?.saves),
    yellow,
    red,
  };
}
