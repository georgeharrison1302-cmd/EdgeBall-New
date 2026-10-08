import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confidenceFor,
  edgePct,
  isPlausibleEdge,
  MODEL_WEIGHT,
  noVigProbs,
  shrinkProb,
} from "./probability";

describe("model probability hardening", () => {
  it("removes the margin so market probabilities sum to 1", () => {
    const probs = noVigProbs([2.0, 3.5, 4.0]);
    assert.ok(probs);
    assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(probs[0] > probs[1] && probs[1] > probs[2]);
  });

  it("returns null when any price is unusable", () => {
    assert.equal(noVigProbs([2, 1, 3]), null);
    assert.equal(noVigProbs([2]), null);
  });

  it("shrinks a wild model back towards the market", () => {
    const market = 0.06;
    const rawModel = 0.5;
    const shrunk = shrinkProb(rawModel, market);
    assert.ok(shrunk < rawModel && shrunk > market);
    assert.equal(shrunk, MODEL_WEIGHT * rawModel + (1 - MODEL_WEIGHT) * market);
  });

  it("a 17.0 draw priced against a 50% raw model no longer looks like a 750% edge", () => {
    const raw = edgePct(0.5, 17);
    const shrunk = edgePct(shrinkProb(0.5, 1 / 17), 17);
    assert.ok(raw > 700);
    assert.ok(shrunk < raw / 2);
  });

  it("flags implausible edges and grades confidence", () => {
    assert.equal(isPlausibleEdge(25), true);
    assert.equal(isPlausibleEdge(120), false);
    assert.equal(confidenceFor(12, 0.45, 0.4), "high");
    assert.equal(confidenceFor(8, 0.5, 0.35), "medium");
    assert.equal(confidenceFor(6, 0.6, 0.3), "low");
  });
});
