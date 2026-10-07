import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateFixtureFactors } from "./evaluator";
import type { FixtureFactorInput } from "./types";

function input(refStats: FixtureFactorInput["refStats"]): FixtureFactorInput {
  return {
    fixture: { id: 1, date: "2026-10-10T15:00:00Z", homeTeamId: 1, awayTeamId: 2 },
    homeTeamStats: { teamId: 1, goalsForPerGame: 1, goalsAgainstPerGame: 1, rank: 10, played: 10, cardsPerGame: 3 },
    awayTeamStats: { teamId: 2, goalsForPerGame: 1, goalsAgainstPerGame: 1, rank: 11, played: 10, cardsPerGame: 2.5 },
    refStats,
    playerStats: [],
  };
}

describe("disciplinary storm referee gate", () => {
  it("does not trigger from team cards when referee is null or TBC", () => {
    for (const refStats of [null, { name: "TBC", avgCardsPerMatch: null, matches: null }]) {
      const storm = evaluateFixtureFactors(1, input(refStats)).find((row) => row.factor.id === "disciplinary_storm");
      assert.equal(storm?.matched, false);
    }
  });

  it("allows team-card fallback for an assigned referee with no stored average", () => {
    const storm = evaluateFixtureFactors(1, input({ name: "Named Ref", avgCardsPerMatch: null, matches: null })).find(
      (row) => row.factor.id === "disciplinary_storm",
    );
    assert.equal(storm?.matched, true);
  });
});
