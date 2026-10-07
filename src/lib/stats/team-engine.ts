import { asNumber, asRecord, nestNumber } from "@/utils/pyth";

/**
 * Team stats engine — FootyStats-style percentages from stored rows only.
 *
 * Input: finished `fixtures` (goals, half-time score) + `fixture_statistics`
 * team sheets (corners, cards, shots, xG). Every rate carries its own sample
 * size, and sheet-based metrics use only matches that have sheets, so missing
 * data surfaces as `pct: null` instead of a fake 0%.
 */

export const FINISHED_STATUSES = ["FT", "AET", "PEN"] as const;
export const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;
export const CORNER_LINES = [7.5, 8.5, 9.5, 10.5, 11.5] as const;
export const CARD_LINES = [2.5, 3.5, 4.5, 5.5] as const;

export type Venue = "home" | "away";
export type VenueSplit = "all" | Venue;
export type Result = "W" | "D" | "L";

export type FixtureInput = {
  id: number;
  date: string | null;
  league_id: number | null;
  season: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
  status_short: string | null;
};

export type SheetInput = {
  fixture_id: number;
  team_id: number;
  statistics: unknown;
};

export type TeamSheet = {
  corners: number;
  yellows: number;
  reds: number;
  shots: number | null;
  shotsOnTarget: number | null;
  fouls: number | null;
  xg: number | null;
};

/** One finished match from a single team's point of view. */
export type TeamMatch = {
  fixtureId: number;
  date: string;
  leagueId: number;
  season: number;
  teamId: number;
  opponentId: number;
  venue: Venue;
  goalsFor: number;
  goalsAgainst: number;
  htFor: number | null;
  htAgainst: number | null;
  /** Both sheets are needed so match totals (corners, cards) are complete. */
  sheet: { for: TeamSheet; against: TeamSheet } | null;
};

export type Rate = { hits: number; n: number; pct: number | null };
export type Average = { total: number; n: number; avg: number | null };

export type TeamStatSummary = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  ppg: number | null;
  /** Oldest → newest. */
  form: Result[];
  goals: {
    forAvg: Average;
    againstAvg: Average;
    matchAvg: Average;
    btts: Rate;
    cleanSheet: Rate;
    failedToScore: Rate;
    /** Total match goals over each line, keyed "0.5" … "4.5". */
    over: Record<string, Rate>;
    htOver: { "0.5": Rate; "1.5": Rate };
  };
  /** Only matches with both team sheets stored. */
  sheets: {
    n: number;
    cornersFor: Average;
    cornersAgainst: Average;
    cornersMatch: Average;
    cornersOver: Record<string, Rate>;
    cardsFor: Average;
    cardsAgainst: Average;
    cardsMatch: Average;
    cardsOver: Record<string, Rate>;
    shotsFor: Average;
    shotsOnTargetFor: Average;
    xgFor: Average;
    xgAgainst: Average;
  };
};

export type TeamStreaks = {
  unbeaten: number;
  winning: number;
  winless: number;
  scoring: number;
  btts: number;
  over25: number;
  cleanSheet: number;
};

const LINE_KEY = (line: number) => line.toFixed(1);

/** Explode finished fixtures into per-team matches, newest first. */
export function buildTeamMatches(fixtures: FixtureInput[], sheets: SheetInput[]): TeamMatch[] {
  const sheetByKey = new Map<string, TeamSheet>();
  for (const row of sheets) {
    const parsed = parseSheet(row.statistics);
    if (parsed) sheetByKey.set(`${row.fixture_id}:${row.team_id}`, parsed);
  }

  const matches: TeamMatch[] = [];
  for (const fixture of fixtures) {
    if (!FINISHED_STATUSES.includes(fixture.status_short as (typeof FINISHED_STATUSES)[number])) continue;
    const homeId = fixture.home_team_id;
    const awayId = fixture.away_team_id;
    const goals = regulationGoals(fixture);
    if (homeId == null || awayId == null || !goals || !fixture.date) continue;
    if (fixture.league_id == null || fixture.season == null) continue;
    const ht = halftimeGoals(fixture.score);
    const homeSheet = sheetByKey.get(`${fixture.id}:${homeId}`) ?? null;
    const awaySheet = sheetByKey.get(`${fixture.id}:${awayId}`) ?? null;
    const base = { fixtureId: fixture.id, date: fixture.date, leagueId: fixture.league_id, season: fixture.season };
    matches.push(
      {
        ...base,
        teamId: homeId,
        opponentId: awayId,
        venue: "home",
        goalsFor: goals.home,
        goalsAgainst: goals.away,
        htFor: ht?.home ?? null,
        htAgainst: ht?.away ?? null,
        sheet: homeSheet && awaySheet ? { for: homeSheet, against: awaySheet } : null,
      },
      {
        ...base,
        teamId: awayId,
        opponentId: homeId,
        venue: "away",
        goalsFor: goals.away,
        goalsAgainst: goals.home,
        htFor: ht?.away ?? null,
        htAgainst: ht?.home ?? null,
        sheet: homeSheet && awaySheet ? { for: awaySheet, against: homeSheet } : null,
      },
    );
  }
  return matches.sort((left, right) => right.date.localeCompare(left.date) || right.fixtureId - left.fixtureId);
}

/** Filter one team's matches by venue, then keep the most recent `last`. Input must be newest first. */
export function selectMatches(
  matches: TeamMatch[],
  teamId: number,
  split: { venue?: VenueSplit; last?: number } = {},
): TeamMatch[] {
  const venue = split.venue ?? "all";
  const picked = matches.filter((match) => match.teamId === teamId && (venue === "all" || match.venue === venue));
  return split.last != null && split.last > 0 ? picked.slice(0, split.last) : picked;
}

export function summarizeTeam(matches: TeamMatch[]): TeamStatSummary {
  const played = matches.length;
  const results = matches.map(resultOf);
  const wins = results.filter((result) => result === "W").length;
  const draws = results.filter((result) => result === "D").length;
  const losses = played - wins - draws;
  const withHt = matches.filter((match) => match.htFor != null && match.htAgainst != null);
  const withSheet = matches.filter((match) => match.sheet != null);
  const total = (match: TeamMatch) => match.goalsFor + match.goalsAgainst;
  const htTotal = (match: TeamMatch) => (match.htFor ?? 0) + (match.htAgainst ?? 0);
  const sheet = (match: TeamMatch) => match.sheet!;
  const cards = (side: TeamSheet) => side.yellows + side.reds;

  return {
    played,
    wins,
    draws,
    losses,
    ppg: played === 0 ? null : round((wins * 3 + draws) / played),
    form: [...results].reverse(),
    goals: {
      forAvg: average(matches, (match) => match.goalsFor),
      againstAvg: average(matches, (match) => match.goalsAgainst),
      matchAvg: average(matches, total),
      btts: rate(matches, (match) => match.goalsFor > 0 && match.goalsAgainst > 0),
      cleanSheet: rate(matches, (match) => match.goalsAgainst === 0),
      failedToScore: rate(matches, (match) => match.goalsFor === 0),
      over: lineRates(GOAL_LINES, matches, total),
      htOver: {
        "0.5": rate(withHt, (match) => htTotal(match) > 0.5),
        "1.5": rate(withHt, (match) => htTotal(match) > 1.5),
      },
    },
    sheets: {
      n: withSheet.length,
      cornersFor: average(withSheet, (match) => sheet(match).for.corners),
      cornersAgainst: average(withSheet, (match) => sheet(match).against.corners),
      cornersMatch: average(withSheet, (match) => sheet(match).for.corners + sheet(match).against.corners),
      cornersOver: lineRates(CORNER_LINES, withSheet, (match) => sheet(match).for.corners + sheet(match).against.corners),
      cardsFor: average(withSheet, (match) => cards(sheet(match).for)),
      cardsAgainst: average(withSheet, (match) => cards(sheet(match).against)),
      cardsMatch: average(withSheet, (match) => cards(sheet(match).for) + cards(sheet(match).against)),
      cardsOver: lineRates(CARD_LINES, withSheet, (match) => cards(sheet(match).for) + cards(sheet(match).against)),
      shotsFor: average(withSheet, (match) => sheet(match).for.shots),
      shotsOnTargetFor: average(withSheet, (match) => sheet(match).for.shotsOnTarget),
      xgFor: average(withSheet, (match) => sheet(match).for.xg),
      xgAgainst: average(withSheet, (match) => sheet(match).against.xg),
    },
  };
}

/** Current run lengths counting back from the most recent match. Input must be newest first. */
export function currentStreaks(matches: TeamMatch[]): TeamStreaks {
  return {
    unbeaten: runLength(matches, (match) => resultOf(match) !== "L"),
    winning: runLength(matches, (match) => resultOf(match) === "W"),
    winless: runLength(matches, (match) => resultOf(match) !== "W"),
    scoring: runLength(matches, (match) => match.goalsFor > 0),
    btts: runLength(matches, (match) => match.goalsFor > 0 && match.goalsAgainst > 0),
    over25: runLength(matches, (match) => match.goalsFor + match.goalsAgainst > 2.5),
    cleanSheet: runLength(matches, (match) => match.goalsAgainst === 0),
  };
}

export function resultOf(match: TeamMatch): Result {
  if (match.goalsFor > match.goalsAgainst) return "W";
  return match.goalsFor === match.goalsAgainst ? "D" : "L";
}

/**
 * Markets settle on 90 minutes: prefer `score.fulltime` (regulation) over
 * `home_goals` / `away_goals`, which include extra time for AET / PEN.
 */
export function regulationGoals(fixture: Pick<FixtureInput, "home_goals" | "away_goals" | "score">) {
  const home = nestNumber(fixture.score, "fulltime", "home") ?? asNumber(fixture.home_goals);
  const away = nestNumber(fixture.score, "fulltime", "away") ?? asNumber(fixture.away_goals);
  return home == null || away == null ? null : { home, away };
}

function halftimeGoals(score: unknown) {
  const home = nestNumber(score, "halftime", "home");
  const away = nestNumber(score, "halftime", "away");
  return home == null || away == null ? null : { home, away };
}

/**
 * API-Football sheets store `null` for a zero count ("Red Cards": null), so
 * counts default to 0 — but only on a real sheet (possession or shots present).
 */
export function parseSheet(statistics: unknown): TeamSheet | null {
  const record = asRecord(statistics);
  if (!record) return null;
  const value = (key: string) => asNumber(record[key]);
  const shots = value("Total Shots");
  if (shots == null && value("Ball Possession") == null) return null;
  return {
    corners: value("Corner Kicks") ?? 0,
    yellows: value("Yellow Cards") ?? 0,
    reds: value("Red Cards") ?? 0,
    shots,
    shotsOnTarget: value("Shots on Goal"),
    fouls: value("Fouls"),
    xg: value("expected_goals"),
  };
}

function rate<T>(items: T[], hit: (item: T) => boolean): Rate {
  const hits = items.filter(hit).length;
  return { hits, n: items.length, pct: items.length === 0 ? null : round((hits / items.length) * 100, 1) };
}

function average<T>(items: T[], pick: (item: T) => number | null): Average {
  let total = 0;
  let n = 0;
  for (const item of items) {
    const value = pick(item);
    if (value == null) continue;
    total += value;
    n += 1;
  }
  return { total: round(total), n, avg: n === 0 ? null : round(total / n) };
}

function lineRates<T>(lines: readonly number[], items: T[], pick: (item: T) => number): Record<string, Rate> {
  return Object.fromEntries(lines.map((line) => [LINE_KEY(line), rate(items, (item) => pick(item) > line)]));
}

function runLength<T>(items: T[], keep: (item: T) => boolean) {
  let length = 0;
  for (const item of items) {
    if (!keep(item)) break;
    length += 1;
  }
  return length;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
