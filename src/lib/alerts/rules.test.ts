import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alertsFor, relevantFixtures, type FixtureState, type WatchItem } from "./rules";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const fixture = (over: Partial<FixtureState> = {}): FixtureState => ({
  id: 1,
  label: "A vs B",
  kickoff: "2026-10-10T12:30:00Z",
  homeTeamId: 10,
  awayTeamId: 20,
  status: "NS",
  lineupsConfirmed: false,
  tips: [],
  ...over,
});
const watch = (kind: WatchItem["kind"], entityId: number): WatchItem => ({
  kind,
  entityId,
  createdAt: "2026-10-09T00:00:00Z",
});

describe("alert rules", () => {
  it("matches fixtures by followed fixture or either team", () => {
    const fixtures = [fixture({ id: 1 }), fixture({ id: 2, homeTeamId: 30, awayTeamId: 40 })];
    assert.deepEqual(relevantFixtures([watch("team", 20)], fixtures).map((f) => f.id), [1]);
    assert.deepEqual(relevantFixtures([watch("fixture", 2)], fixtures).map((f) => f.id), [2]);
    assert.equal(relevantFixtures([watch("team", 99)], fixtures).length, 0);
  });

  it("raises a kickoff alert only inside the final hour", () => {
    const soon = alertsFor([watch("team", 10)], [fixture()], NOW);
    assert.deepEqual(soon.map((a) => a.dedupeKey), ["kickoff:1"]);
    const later = alertsFor([watch("team", 10)], [fixture({ kickoff: "2026-10-10T15:00:00Z" })], NOW);
    assert.equal(later.length, 0);
  });

  it("raises a lineup alert once and never for started matches", () => {
    const ready = alertsFor([watch("fixture", 1)], [fixture({ lineupsConfirmed: true, kickoff: "2026-10-10T18:00:00Z" })], NOW);
    assert.deepEqual(ready.map((a) => a.dedupeKey), ["lineup:1"]);
    const live = alertsFor([watch("fixture", 1)], [fixture({ lineupsConfirmed: true, status: "1H" })], NOW);
    assert.equal(live.length, 0);
  });

  it("only alerts on tips generated after the user started watching", () => {
    const tips = [
      { key: "old", selection: "Draw", edgePct: 12, generatedAt: "2026-10-08T00:00:00Z" },
      { key: "new", selection: "A win", edgePct: 9.5, generatedAt: "2026-10-10T08:00:00Z" },
    ];
    const alerts = alertsFor([watch("fixture", 1)], [fixture({ kickoff: "2026-10-11T12:00:00Z", tips })], NOW);
    assert.deepEqual(alerts.map((a) => a.dedupeKey), ["tip:new"]);
  });
});
