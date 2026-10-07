import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fixtureDateLabel,
  fixtureDateOptions,
  groupFixturesByLeague,
  hasFixtureOdds,
  sortFixtureMatches,
} from "./board-utils";
import type { FixtureMatch } from "./types";

function match(id: number, extra: Partial<FixtureMatch> = {}): FixtureMatch {
  return {
    id,
    leagueId: 39,
    season: 2026,
    league: "Premier League",
    leagueLogo: null,
    kickoff: "15:00",
    kickoffAt: "2026-10-10T15:00:00Z",
    status: "NS",
    bucket: "upcoming",
    home: { id: 1, name: "Home", logo: null, form: null },
    away: { id: 2, name: "Away", logo: null, form: null },
    goalsHome: null,
    goalsAway: null,
    minute: null,
    prices: {
      home: null,
      draw: null,
      away: null,
      bttsYes: null,
      bttsNo: null,
      over25: null,
      under25: null,
    },
    ...extra,
  };
}

describe("fixture board dates", () => {
  it("starts with yesterday and covers tomorrow plus the next five days", () => {
    assert.deepEqual(fixtureDateOptions("2026-10-10"), [
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
  });

  it("labels yesterday, today, and tomorrow", () => {
    assert.equal(fixtureDateLabel("2026-10-09", "2026-10-10"), "Yesterday");
    assert.equal(fixtureDateLabel("2026-10-10", "2026-10-10"), "Today");
    assert.equal(fixtureDateLabel("2026-10-11", "2026-10-10"), "Tomorrow");
  });
});

describe("fixture board ordering", () => {
  it("puts live matches before upcoming and finished matches", () => {
    const sorted = sortFixtureMatches([
      match(3, { bucket: "finished", kickoffAt: "2026-10-10T15:00:00Z" }),
      match(1, { bucket: "upcoming", kickoffAt: "2026-10-10T18:00:00Z" }),
      match(2, { bucket: "live", kickoffAt: "2026-10-10T14:00:00Z" }),
    ]);
    assert.deepEqual(sorted.map((row) => row.id), [2, 1, 3]);
  });

  it("orders league groups by the product competition priority", () => {
    const groups = groupFixturesByLeague([
      match(1, { leagueId: 140, league: "La Liga" }),
      match(2, { leagueId: 39, league: "Premier League" }),
    ]);
    assert.deepEqual(groups.map((group) => group.id), [39, 140]);
  });
});

describe("hasFixtureOdds", () => {
  it("detects any priced stored market", () => {
    assert.equal(hasFixtureOdds(match(1)), false);
    assert.equal(hasFixtureOdds(match(1, {
      prices: { ...match(1).prices, bttsYes: 1.8 },
    })), true);
  });
});
