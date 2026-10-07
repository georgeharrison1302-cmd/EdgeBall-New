import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasActivePropModel, isSupportedPlayerPropLine } from "./prop-line-policy";

describe("isSupportedPlayerPropLine", () => {
  it("allows standard fouls lines and rejects ladders", () => {
    for (const line of [1, 2, 3]) assert.equal(isSupportedPlayerPropLine("fouls", "Fouls Committed", line), true);
    for (const line of [4, 7, 8]) assert.equal(isSupportedPlayerPropLine("fouls", "Fouls Committed", line), false);
  });

  it("allows SOT 0.5/1.5 only", () => {
    assert.equal(isSupportedPlayerPropLine("sot", "Shots on Target", 1), true);
    assert.equal(isSupportedPlayerPropLine("sot", "Shots on Target", 2), true);
    assert.equal(isSupportedPlayerPropLine("sot", "Shots on Target", 3), false);
  });

  it("allows total shots 0.5/1.5/2.5", () => {
    for (const line of [1, 2, 3]) assert.equal(isSupportedPlayerPropLine("sot", "Total Shots", line), true);
    assert.equal(isSupportedPlayerPropLine("sot", "Total Shots", 4), false);
  });

  it("keeps cards and goalscorers, rejects generic specials", () => {
    assert.equal(isSupportedPlayerPropLine("cards", "To Be Carded", null), true);
    assert.equal(isSupportedPlayerPropLine("goals", "Anytime Goalscorer", null), true);
    assert.equal(isSupportedPlayerPropLine("other", "Player Special", 1), false);
  });
});

describe("hasActivePropModel", () => {
  it("accepts probabilities strictly between zero and one", () => {
    assert.equal(hasActivePropModel(0.62), true);
    assert.equal(hasActivePropModel(null), false);
    assert.equal(hasActivePropModel(0), false);
    assert.equal(hasActivePropModel(1), false);
  });
});
