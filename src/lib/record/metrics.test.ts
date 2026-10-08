import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calibrationBins, cumulativeCurve, drawdown, priceVsResult, type SettledTip } from "./metrics";

const tip = (at: string, odds: number, modelProb: number, won: boolean): SettledTip => ({
  at,
  odds,
  modelProb,
  won,
  profit: won ? odds - 1 : -1,
});

describe("model record metrics", () => {
  it("accumulates profit in time order regardless of input order", () => {
    const curve = cumulativeCurve([
      tip("2026-10-02T00:00:00Z", 2, 0.5, false),
      tip("2026-10-01T00:00:00Z", 3, 0.4, true),
    ]);
    assert.deepEqual(
      curve.map((point) => point.cumulative),
      [2, 1],
    );
  });

  it("bins calibration by model probability and skips empty bins", () => {
    const bins = calibrationBins([
      tip("a", 2, 0.55, true),
      tip("b", 2, 0.6, false),
      tip("c", 5, 0.15, false),
    ]);
    assert.equal(bins.length, 2);
    assert.equal(bins[0].label, "0–20%");
    assert.equal(bins[1].n, 2);
    assert.equal(bins[1].actual, 0.5);
  });

  it("measures peak-to-trough drawdown", () => {
    const curve = cumulativeCurve([
      tip("2026-10-01T00:00:00Z", 3, 0.4, true),
      tip("2026-10-02T00:00:00Z", 2, 0.5, false),
      tip("2026-10-03T00:00:00Z", 2, 0.5, false),
    ]);
    assert.equal(drawdown(curve), 2);
  });

  it("compares implied price probability to realised rate", () => {
    const result = priceVsResult([tip("a", 2, 0.5, true), tip("b", 4, 0.3, false)]);
    assert.ok(result);
    assert.equal(result.implied, (0.5 + 0.25) / 2);
    assert.equal(result.actual, 0.5);
    assert.equal(priceVsResult([]), null);
  });
});
