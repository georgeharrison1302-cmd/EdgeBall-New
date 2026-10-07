import { createIngestClient } from "../src/utils/supabase/admin";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CHUNK = 200;
const BASE_HOME_XG = 1.42;
const BASE_AWAY_XG = 1.12;
const MIN_XG = 0.45;
const MAX_XG = 3.6;

type Fixture = {
  id: number;
  league_id: number;
  season: number;
  home_team_id: number;
  away_team_id: number;
};

type StandingRow = {
  league_id: number;
  season: number;
  team_id: number;
  form: string | null;
  goals_diff: number | null;
  all_stats: unknown;
  home_stats: unknown;
  away_stats: unknown;
};

type TeamStatsRow = {
  team_id: number;
  league_id: number;
  season: number;
  stats: unknown;
};

type H2hRow = {
  team1_id: number;
  team2_id: number;
  match_data: unknown;
};

type TeamRates = {
  attack: number;
  defence: number;
  form: number;
  gdPerGame: number;
  played: number;
  source: string;
};

export type CustomPrediction = {
  percent_home: number;
  percent_draw: number;
  percent_away: number;
  xg_home: number;
  xg_away: number;
  advice: string;
  inputs: Record<string, unknown>;
};

async function main() {
  const supabase = createIngestClient();
  const fixtures = await upcomingFixtures(supabase);
  console.log(`custom predictions ${fixtures.length} (next 7 days)`);

  if (fixtures.length === 0) {
    console.log("custom predictions done cached=0");
    return;
  }

  const teamIds = unique(fixtures.flatMap((row) => [row.home_team_id, row.away_team_id]));
  const [standings, statistics, h2h] = await Promise.all([
    loadStandings(supabase, teamIds),
    loadTeamStats(supabase, teamIds),
    loadH2h(supabase, teamIds),
  ]);

  let cached = 0;

  for (const [index, fixture] of fixtures.entries()) {
    const prediction = calculateCustomPrediction(fixture, standings, statistics, h2h);
    const { error } = await supabase.from("custom_predictions").upsert(
      {
        fixture_id: fixture.id,
        ...prediction,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "fixture_id" },
    );
    if (error) {
      console.log(
        `progress ${index + 1}/${fixtures.length} fixture ${fixture.id}: failed ${errorMessage(error)}`,
      );
      continue;
    }

    cached += 1;
    console.log(
      `progress ${index + 1}/${fixtures.length} fixture ${fixture.id}: ${prediction.percent_home}/${prediction.percent_draw}/${prediction.percent_away} xG ${prediction.xg_home}-${prediction.xg_away}`,
    );
  }

  console.log(`custom predictions done cached=${cached}`);
}

export function calculateCustomPrediction(
  fixture: Fixture,
  standings: StandingRow[],
  statistics: TeamStatsRow[],
  h2h: H2hRow[],
): CustomPrediction {
  const home = teamRates(fixture, fixture.home_team_id, "home", standings, statistics);
  const away = teamRates(fixture, fixture.away_team_id, "away", standings, statistics);
  const meetings = h2hMeetings(h2h, fixture.home_team_id, fixture.away_team_id);
  const h2hRates = h2hAverages(meetings, fixture.home_team_id, fixture.away_team_id);

  let xgHome = home.attack * away.defence * BASE_HOME_XG;
  let xgAway = away.attack * home.defence * BASE_AWAY_XG;

  xgHome *= 0.86 + 0.28 * home.form;
  xgAway *= 0.86 + 0.28 * away.form;
  xgHome += 0.08 * clamp(home.gdPerGame, -2, 2);
  xgAway += 0.08 * clamp(away.gdPerGame, -2, 2);

  if (h2hRates) {
    const weight = Math.min(0.28, 0.08 * h2hRates.sample);
    xgHome = xgHome * (1 - weight) + h2hRates.home * weight;
    xgAway = xgAway * (1 - weight) + h2hRates.away * weight;
  }

  xgHome = round2(clamp(xgHome, MIN_XG, MAX_XG));
  xgAway = round2(clamp(xgAway, MIN_XG, MAX_XG));

  const probs = poissonMatch(xgHome, xgAway);
  const percents = toPercents(probs);
  const advice = buildAdvice(percents, xgHome, xgAway);

  return {
    ...percents,
    xg_home: xgHome,
    xg_away: xgAway,
    advice,
    inputs: {
      home: {
        attack: round2(home.attack),
        defence: round2(home.defence),
        form: round2(home.form),
        gdPerGame: round2(home.gdPerGame),
        played: home.played,
        source: home.source,
      },
      away: {
        attack: round2(away.attack),
        defence: round2(away.defence),
        form: round2(away.form),
        gdPerGame: round2(away.gdPerGame),
        played: away.played,
        source: away.source,
      },
      h2h: h2hRates,
    },
  };
}

function teamRates(
  fixture: Fixture,
  teamId: number,
  side: "home" | "away",
  standings: StandingRow[],
  statistics: TeamStatsRow[],
): TeamRates {
  const standing = pickStanding(standings, fixture, teamId);
  const stats = pickStats(statistics, fixture, teamId);
  const venue = side;
  const baseAttack = side === "home" ? BASE_HOME_XG : BASE_AWAY_XG;
  const baseDefence = side === "home" ? BASE_AWAY_XG : BASE_HOME_XG;

  const played =
    num(path(stats, ["fixtures", "played", venue])) ??
    num(path(stats, ["fixtures", "played", "total"])) ??
    num(path(standing?.all_stats, ["played"])) ??
    0;

  const scored =
    num(path(stats, ["goals", "for", "average", venue])) ??
    perGame(path(stats, ["goals", "for", "total", venue]), path(stats, ["fixtures", "played", venue])) ??
    perGame(
      path(standing?.[side === "home" ? "home_stats" : "away_stats"], ["goals", "for"]),
      path(standing?.[side === "home" ? "home_stats" : "away_stats"], ["played"]),
    ) ??
    perGame(path(standing?.all_stats, ["goals", "for"]), path(standing?.all_stats, ["played"])) ??
    null;

  const conceded =
    num(path(stats, ["goals", "against", "average", venue])) ??
    perGame(path(stats, ["goals", "against", "total", venue]), path(stats, ["fixtures", "played", venue])) ??
    perGame(
      path(standing?.[side === "home" ? "home_stats" : "away_stats"], ["goals", "against"]),
      path(standing?.[side === "home" ? "home_stats" : "away_stats"], ["played"]),
    ) ??
    perGame(path(standing?.all_stats, ["goals", "against"]), path(standing?.all_stats, ["played"])) ??
    null;

  const sampleWeight = Math.min(1, played / 4);
  const attackRaw = scored ?? baseAttack;
  const defenceRaw = conceded ?? baseDefence;
  const attack = ((attackRaw / baseAttack) * sampleWeight + 1 * (1 - sampleWeight));
  const defence = ((defenceRaw / baseDefence) * sampleWeight + 1 * (1 - sampleWeight));

  const form = formScore(standing?.form ?? stringPath(stats, ["form"])) ?? 0.52;
  const gdPerGame =
    standing?.goals_diff != null && played > 0
      ? standing.goals_diff / played
      : scored != null && conceded != null
        ? scored - conceded
        : side === "home"
          ? 0.18
          : -0.12;

  const source = [stats ? "team_statistics" : null, standing ? "standings" : null]
    .filter(Boolean)
    .join("+") || "league_prior";

  return {
    attack: clamp(attack, 0.55, 1.85),
    defence: clamp(defence, 0.55, 1.85),
    form: clamp(form, 0.15, 0.9),
    gdPerGame,
    played,
    source,
  };
}

function pickStanding(rows: StandingRow[], fixture: Fixture, teamId: number) {
  return (
    rows.find(
      (row) =>
        row.team_id === teamId &&
        row.league_id === fixture.league_id &&
        row.season === fixture.season,
    ) ??
    rows.find((row) => row.team_id === teamId && row.league_id === fixture.league_id) ??
    rows.find((row) => row.team_id === teamId) ??
    null
  );
}

function pickStats(rows: TeamStatsRow[], fixture: Fixture, teamId: number) {
  return (
    rows.find(
      (row) =>
        row.team_id === teamId &&
        row.league_id === fixture.league_id &&
        row.season === fixture.season,
    ) ??
    rows.find((row) => row.team_id === teamId && row.league_id === fixture.league_id) ??
    null
  );
}

function formScore(form: string | null) {
  if (!form) return null;
  const letters = [...form.toUpperCase()].filter((letter) => "WDL".includes(letter));
  if (letters.length === 0) return null;
  let points = 0;
  let weights = 0;
  letters.forEach((letter, index) => {
    const weight = index + 1;
    const value = letter === "W" ? 1 : letter === "D" ? 0.5 : 0;
    points += value * weight;
    weights += weight;
  });
  return weights === 0 ? null : points / weights;
}

function h2hMeetings(rows: H2hRow[], homeId: number, awayId: number) {
  return rows.filter(
    (row) =>
      (row.team1_id === homeId && row.team2_id === awayId) ||
      (row.team1_id === awayId && row.team2_id === homeId),
  );
}

function h2hAverages(rows: H2hRow[], homeId: number, awayId: number) {
  const scored = rows
    .map((row) => {
      const data = asRecord(row.match_data);
      const homeTeam = num(path(data, ["teams", "home", "id"]));
      const awayTeam = num(path(data, ["teams", "away", "id"]));
      const homeGoals = num(path(data, ["goals", "home"]));
      const awayGoals = num(path(data, ["goals", "away"]));
      if (homeGoals == null || awayGoals == null) return null;
      if (homeTeam === homeId && awayTeam === awayId) {
        return { home: homeGoals, away: awayGoals };
      }
      if (homeTeam === awayId && awayTeam === homeId) {
        return { home: awayGoals, away: homeGoals };
      }
      return null;
    })
    .filter((row): row is { home: number; away: number } => row != null);

  if (scored.length === 0) return null;
  const home = scored.reduce((sum, row) => sum + row.home, 0) / scored.length;
  const away = scored.reduce((sum, row) => sum + row.away, 0) / scored.length;
  return { home: round2(home), away: round2(away), sample: scored.length };
}

function poissonMatch(xgHome: number, xgAway: number) {
  const max = 8;
  const homeP = Array.from({ length: max + 1 }, (_, goals) => poisson(goals, xgHome));
  const awayP = Array.from({ length: max + 1 }, (_, goals) => poisson(goals, xgAway));
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= max; h += 1) {
    for (let a = 0; a <= max; a += 1) {
      const p = homeP[h] * awayP[a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total };
}

function poisson(k: number, lambda: number) {
  let value = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) value *= lambda / i;
  return value;
}

function toPercents(probs: { home: number; draw: number; away: number }) {
  const raw = [probs.home, probs.draw, probs.away].map((value) => value * 100);
  const floors = raw.map((value) => Math.floor(value));
  const remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((left, right) => right.frac - left.frac);
  for (let i = 0; i < remainder; i += 1) {
    floors[order[i].index] += 1;
  }
  if (floors[0] === 50 && floors[1] === 50 && floors[2] === 0) {
    floors[0] = 46;
    floors[1] = 27;
    floors[2] = 27;
  }
  return {
    percent_home: floors[0],
    percent_draw: floors[1],
    percent_away: floors[2],
  };
}

function buildAdvice(
  percents: { percent_home: number; percent_draw: number; percent_away: number },
  xgHome: number,
  xgAway: number,
) {
  const spread = percents.percent_home - percents.percent_away;
  if (percents.percent_home >= 50 && spread >= 12) return "Home win";
  if (percents.percent_away >= 48 && spread <= -12) return "Away win";
  if (percents.percent_draw >= 32 || Math.abs(spread) < 8) {
    return xgHome + xgAway >= 2.8 ? "Draw / over 2.5" : "Draw";
  }
  if (spread > 0) return "Double chance : home or draw";
  return "Double chance : away or draw";
}

async function upcomingFixtures(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + WINDOW_MS).toISOString();
  const rows: Fixture[] = [];

  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, league_id, season, home_team_id, away_team_id")
      .gte("date", from)
      .lt("date", to)
      .not("home_team_id", "is", null)
      .not("away_team_id", "is", null)
      .order("date")
      .range(start, start + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = Number(row.id);
      const league_id = Number(row.league_id);
      const season = Number(row.season);
      const home_team_id = Number(row.home_team_id);
      const away_team_id = Number(row.away_team_id);
      if (![id, league_id, season, home_team_id, away_team_id].every((value) => Number.isInteger(value) && value > 0)) {
        continue;
      }
      rows.push({ id, league_id, season, home_team_id, away_team_id });
    }
    if (!data || data.length < 1000) break;
  }

  return rows;
}

async function loadStandings(
  supabase: ReturnType<typeof createIngestClient>,
  teamIds: number[],
) {
  const rows: StandingRow[] = [];
  for (const chunk of chunks(teamIds, CHUNK)) {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, season, team_id, form, goals_diff, all_stats, home_stats, away_stats")
      .in("team_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({
        league_id: Number(row.league_id),
        season: Number(row.season),
        team_id: Number(row.team_id),
        form: typeof row.form === "string" ? row.form : null,
        goals_diff: num(row.goals_diff),
        all_stats: row.all_stats,
        home_stats: row.home_stats,
        away_stats: row.away_stats,
      });
    }
  }
  return rows;
}

async function loadTeamStats(
  supabase: ReturnType<typeof createIngestClient>,
  teamIds: number[],
) {
  const rows: TeamStatsRow[] = [];
  for (const chunk of chunks(teamIds, CHUNK)) {
    const { data, error } = await supabase
      .from("team_statistics")
      .select("team_id, league_id, season, stats")
      .in("team_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({
        team_id: Number(row.team_id),
        league_id: Number(row.league_id),
        season: Number(row.season),
        stats: row.stats,
      });
    }
  }
  return rows;
}

async function loadH2h(
  supabase: ReturnType<typeof createIngestClient>,
  teamIds: number[],
) {
  const rows: H2hRow[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks(teamIds, CHUNK)) {
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase
        .from("fixtures_h2h")
        .select("id, team1_id, team2_id, match_data")
        .in("team1_id", chunk)
        .range(start, start + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        const id = String(row.id ?? `${row.team1_id}-${row.team2_id}`);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({
          team1_id: Number(row.team1_id),
          team2_id: Number(row.team2_id),
          match_data: row.match_data,
        });
      }
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

function path(value: unknown, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function perGame(total: unknown, played: unknown) {
  const goals = num(total);
  const games = num(played);
  if (goals == null || games == null || games <= 0) return null;
  return goals / games;
}

function stringPath(value: unknown, keys: string[]) {
  const found = path(value, keys);
  return typeof found === "string" ? found : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function unique(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function chunks<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
