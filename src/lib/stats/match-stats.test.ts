import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildHeadToHead, buildTeamPanel, opponentIds, type TeamRef } from "./match-stats";
import { buildTeamMatches, type FixtureInput } from "./team-engine";

const ARS: TeamRef = { id: 42, name: "Arsenal", logo: null };
const CHE: TeamRef = { id: 49, name: "Chelsea", logo: null };
const LIV: TeamRef = { id: 40, name: "Liverpool", logo: null };
const names = new Map([ARS, CHE, LIV].map((team) => [team.id, team]));

function fixture(id: number, day: number, home: number, away: number, goals: [number, number]): FixtureInput {
  return {
    id,
    date: `2026-08-${String(day).padStart(2, "0")}T15:00:00Z`,
    league_id: 39,
    season: 2026,
    home_team_id: home,
    away_team_id: away,
    home_goals: goals[0],
    away_goals: goals[1],
    score: { fulltime: { home: goals[0], away: goals[1] } },
    status_short: "FT",
  };
}

const matches = buildTeamMatches(
  [
    fixture(1, 1, ARS.id, LIV.id, [2, 0]),
    fixture(2, 8, CHE.id, ARS.id, [1, 1]),
    fixture(3, 15, ARS.id, CHE.id, [3, 2]),
    fixture(4, 22, LIV.id, ARS.id, [2, 1]),
  ],
  [],
);

describe("buildTeamPanel", () => {
  const panel = buildTeamPanel(matches, ARS, "home", names);

  it("builds overall, venue and last-N splits", () => {
    assert.equal(panel.splits.all.played, 4);
    assert.equal(panel.splits.venue.played, 2);
    assert.equal(panel.splits.venue.wins, 2);
    assert.equal(panel.splits.last5.played, 4);
    assert.equal(panel.splits.last10.played, 4);
  });

  it("lists recent results newest first with opponent names", () => {
    assert.deepEqual(
      panel.recent.map((match) => [match.opponent.name, match.venue, match.result, `${match.goalsFor}-${match.goalsAgainst}`]),
      [
        ["Liverpool", "away", "L", "1-2"],
        ["Chelsea", "home", "W", "3-2"],
        ["Chelsea", "away", "D", "1-1"],
        ["Liverpool", "home", "W", "2-0"],
      ],
    );
  });

  it("falls back to a labelled placeholder for unknown opponents", () => {
    const solo = buildTeamPanel(matches, ARS, "home", new Map());
    assert.equal(solo.recent[0]!.opponent.name, "Unknown team");
  });
});

describe("buildHeadToHead", () => {
  it("summarises meetings from the home team's perspective", () => {
    const meetings = matches.filter(
      (match) => (match.teamId === ARS.id || match.teamId === CHE.id) && (match.opponentId === ARS.id || match.opponentId === CHE.id),
    );
    const h2h = buildHeadToHead(meetings, ARS.id, names);
    assert.equal(h2h.meetings.length, 2);
    assert.deepEqual([h2h.summary.wins, h2h.summary.draws, h2h.summary.losses], [1, 1, 0]);
    assert.deepEqual(h2h.summary.goals.btts, { hits: 2, n: 2, pct: 100 });
  });
});

describe("opponentIds", () => {
  it("dedupes opponents across lists", () => {
    assert.deepEqual(opponentIds(matches, matches).sort(), [ARS.id, CHE.id, LIV.id].sort());
  });
});
