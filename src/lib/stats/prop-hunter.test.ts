import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlayerProp } from "@/components/PlayerPropsBuilder";

import { currentStreak, hunterRows, trendRows } from "./prop-hunter";

function prop(id: number, extra: Partial<PlayerProp> = {}): PlayerProp {
  return {
    id,
    competition: "Premier League",
    player: `Player ${id}`,
    match: "Home vs Away",
    playerImg: "",
    homeTeamImg: "",
    awayTeamImg: "",
    selection: "2+ Fouls",
    market: "Fouls Committed",
    odds: null,
    hitRate: 0,
    edgeScore: 0,
    ...extra,
  };
}

describe("hunterRows", () => {
  it("keeps only priced props with a positive edge", () => {
    const rows = hunterRows([
      prop(1, { odds: 2.5, edgePct: 12 }),
      prop(2, { odds: null, edgePct: 40 }),
      prop(3, { odds: 1.8, edgePct: -3 }),
      prop(4, { odds: 2.0, edgePct: null, edgeScore: 0 }),
      prop(5, { odds: 3.1, edgePct: 6.5 }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      [1, 5],
    );
  });

  it("dedupes player × market × fixture to the best edge and sorts desc", () => {
    const rows = hunterRows([
      prop(1, { playerId: 10, odds: 2.0, edgePct: 5 }),
      prop(2, { playerId: 10, odds: 2.4, edgePct: 11 }),
      prop(3, { playerId: 20, odds: 1.9, edgePct: 20 }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      [3, 2],
    );
  });
});

describe("currentStreak", () => {
  it("counts trailing hits, skipping nulls", () => {
    assert.equal(currentStreak([true, null, true, true]), 3);
    assert.equal(currentStreak([true, true, false]), 0);
    assert.equal(currentStreak([false, true, true, true]), 3);
    assert.equal(currentStreak([null, null]), 0);
    assert.equal(currentStreak([]), 0);
    assert.equal(currentStreak(undefined), 0);
  });
});

describe("trendRows", () => {
  it("keeps players on streaks at the minimum and orders by streak", () => {
    const rows = trendRows([
      prop(1, { playerId: 1, form: [true, true, true], formHitPct: 100 }),
      prop(2, { playerId: 2, form: [true, false, true, true], formHitPct: 75 }),
      prop(3, { playerId: 3, form: [true, true, true, true, true], formHitPct: 100 }),
      prop(4, { playerId: 4, form: [] }),
    ]);
    assert.deepEqual(
      rows.map((row) => [row.prop.id, row.streak]),
      [
        [3, 5],
        [1, 3],
      ],
    );
  });

  it("dedupes to the longest streak per player × market", () => {
    const rows = trendRows([
      prop(1, { playerId: 7, market: "Tackles", form: [true, true, true] }),
      prop(2, { playerId: 7, market: "Tackles", form: [true, true] }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.prop.id, 1);
  });
});
