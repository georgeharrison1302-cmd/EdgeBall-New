import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTeamMatches,
  currentStreaks,
  parseSheet,
  regulationGoals,
  selectMatches,
  summarizeTeam,
  type FixtureInput,
  type SheetInput,
} from "./team-engine";

const HOME = 1;
const AWAY = 2;

function fixture(
  id: number,
  date: string,
  home: number,
  away: number,
  goals: [number, number],
  extra: Partial<FixtureInput> = {},
): FixtureInput {
  return {
    id,
    date,
    league_id: 39,
    season: 2026,
    home_team_id: home,
    away_team_id: away,
    home_goals: goals[0],
    away_goals: goals[1],
    score: { fulltime: { home: goals[0], away: goals[1] }, halftime: { home: 0, away: 0 } },
    status_short: "FT",
    ...extra,
  };
}

function sheet(fixtureId: number, teamId: number, stats: Record<string, unknown>): SheetInput {
  return { fixture_id: fixtureId, team_id: teamId, statistics: { "Ball Possession": "50%", ...stats } };
}

describe("regulationGoals", () => {
  it("prefers the 90-minute score over extra-time totals", () => {
    const aet = { home_goals: 2, away_goals: 1, score: { fulltime: { home: 1, away: 1 } } };
    assert.deepEqual(regulationGoals(aet), { home: 1, away: 1 });
  });

  it("falls back to goal columns when score JSON is missing", () => {
    assert.deepEqual(regulationGoals({ home_goals: 3, away_goals: 0, score: {} }), { home: 3, away: 0 });
  });
});

describe("parseSheet", () => {
  it("treats null counts on a real sheet as zero", () => {
    const parsed = parseSheet({ "Total Shots": 10, "Red Cards": null, "Yellow Cards": 2, "Corner Kicks": null });
    assert.equal(parsed?.reds, 0);
    assert.equal(parsed?.corners, 0);
    assert.equal(parsed?.yellows, 2);
  });

  it("rejects empty or non-sheet payloads", () => {
    assert.equal(parseSheet({}), null);
    assert.equal(parseSheet(null), null);
    assert.equal(parseSheet({ "Yellow Cards": 3 }), null);
  });

  it("keeps xG null when the league has no xG", () => {
    assert.equal(parseSheet({ "Total Shots": 5 })?.xg, null);
  });
});

describe("buildTeamMatches", () => {
  it("creates one row per side, newest first, skipping unfinished and awarded matches", () => {
    const matches = buildTeamMatches(
      [
        fixture(10, "2026-08-01T15:00:00Z", HOME, AWAY, [2, 1]),
        fixture(11, "2026-08-08T15:00:00Z", AWAY, HOME, [0, 0]),
        fixture(12, "2026-08-15T15:00:00Z", HOME, AWAY, [1, 1], { status_short: "NS" }),
        fixture(13, "2026-08-22T15:00:00Z", HOME, AWAY, [3, 0], { status_short: "AWD" }),
      ],
      [],
    );
    assert.equal(matches.length, 4);
    assert.deepEqual(
      matches.map((match) => [match.fixtureId, match.teamId, match.venue]),
      [
        [11, AWAY, "home"],
        [11, HOME, "away"],
        [10, HOME, "home"],
        [10, AWAY, "away"],
      ],
    );
    const homeWin = matches.find((match) => match.fixtureId === 10 && match.teamId === HOME)!;
    assert.equal(homeWin.goalsFor, 2);
    assert.equal(homeWin.goalsAgainst, 1);
  });

  it("only attaches sheets when both teams have one", () => {
    const matches = buildTeamMatches(
      [fixture(20, "2026-08-01T15:00:00Z", HOME, AWAY, [1, 0]), fixture(21, "2026-08-08T15:00:00Z", HOME, AWAY, [1, 0])],
      [
        sheet(20, HOME, { "Corner Kicks": 6, "Yellow Cards": 1 }),
        sheet(20, AWAY, { "Corner Kicks": 4, "Yellow Cards": 3, "Red Cards": 1 }),
        sheet(21, HOME, { "Corner Kicks": 9 }),
      ],
    );
    const full = matches.find((match) => match.fixtureId === 20 && match.teamId === AWAY)!;
    assert.equal(full.sheet?.for.corners, 4);
    assert.equal(full.sheet?.against.corners, 6);
    assert.equal(matches.find((match) => match.fixtureId === 21)!.sheet, null);
  });
});

describe("summarizeTeam", () => {
  const fixtures = [
    fixture(1, "2026-08-01T15:00:00Z", HOME, AWAY, [2, 1], { score: { fulltime: { home: 2, away: 1 }, halftime: { home: 1, away: 1 } } }),
    fixture(2, "2026-08-08T15:00:00Z", AWAY, HOME, [0, 0]),
    fixture(3, "2026-08-15T15:00:00Z", HOME, AWAY, [3, 0]),
    fixture(4, "2026-08-22T15:00:00Z", AWAY, HOME, [2, 1]),
  ];
  const sheets = [
    sheet(1, HOME, { "Corner Kicks": 7, "Yellow Cards": 2 }),
    sheet(1, AWAY, { "Corner Kicks": 3, "Yellow Cards": 1, "Red Cards": 1 }),
    sheet(3, HOME, { "Corner Kicks": 5, "Yellow Cards": 0, expected_goals: "2.10" }),
    sheet(3, AWAY, { "Corner Kicks": 2, "Yellow Cards": 1, expected_goals: "0.40" }),
  ];
  const all = buildTeamMatches(fixtures, sheets);
  const summary = summarizeTeam(selectMatches(all, HOME));

  it("computes results, PPG and oldest-first form", () => {
    assert.equal(summary.played, 4);
    assert.deepEqual([summary.wins, summary.draws, summary.losses], [2, 1, 1]);
    assert.equal(summary.ppg, 1.75);
    assert.deepEqual(summary.form, ["W", "D", "W", "L"]);
  });

  it("computes goal-market percentages with sample sizes", () => {
    assert.deepEqual(summary.goals.btts, { hits: 2, n: 4, pct: 50 });
    assert.deepEqual(summary.goals.cleanSheet, { hits: 2, n: 4, pct: 50 });
    assert.deepEqual(summary.goals.failedToScore, { hits: 1, n: 4, pct: 25 });
    assert.equal(summary.goals.over["2.5"].pct, 75);
    assert.equal(summary.goals.over["0.5"].pct, 75);
    assert.equal(summary.goals.matchAvg.avg, 2.25);
    assert.deepEqual(summary.goals.htOver["0.5"], { hits: 1, n: 4, pct: 25 });
  });

  it("uses only sheet matches for corners, cards and xG", () => {
    assert.equal(summary.sheets.n, 2);
    assert.equal(summary.sheets.cornersFor.avg, 6);
    assert.equal(summary.sheets.cornersMatch.avg, 8.5);
    assert.deepEqual(summary.sheets.cornersOver["8.5"], { hits: 1, n: 2, pct: 50 });
    assert.equal(summary.sheets.cardsMatch.avg, 2.5);
    assert.deepEqual(summary.sheets.cardsOver["3.5"], { hits: 1, n: 2, pct: 50 });
    assert.deepEqual(summary.sheets.xgFor, { total: 2.1, n: 1, avg: 2.1 });
  });

  it("filters by venue and last N", () => {
    const home = summarizeTeam(selectMatches(all, HOME, { venue: "home" }));
    assert.equal(home.played, 2);
    assert.equal(home.wins, 2);
    const lastTwo = summarizeTeam(selectMatches(all, HOME, { last: 2 }));
    assert.deepEqual(lastTwo.form, ["W", "L"]);
  });

  it("returns null percentages instead of 0% when there is no data", () => {
    const empty = summarizeTeam([]);
    assert.equal(empty.ppg, null);
    assert.equal(empty.goals.btts.pct, null);
    assert.equal(empty.sheets.cornersMatch.avg, null);
  });
});

describe("currentStreaks", () => {
  it("counts back from the most recent match", () => {
    const matches = selectMatches(
      buildTeamMatches(
        [
          fixture(1, "2026-08-01T15:00:00Z", HOME, AWAY, [0, 2]),
          fixture(2, "2026-08-08T15:00:00Z", HOME, AWAY, [1, 1]),
          fixture(3, "2026-08-15T15:00:00Z", HOME, AWAY, [2, 1]),
          fixture(4, "2026-08-22T15:00:00Z", HOME, AWAY, [3, 1]),
        ],
        [],
      ),
      HOME,
    );
    assert.deepEqual(currentStreaks(matches), {
      unbeaten: 3,
      winning: 2,
      winless: 0,
      scoring: 3,
      btts: 3,
      over25: 2,
      cleanSheet: 0,
    });
  });
});
