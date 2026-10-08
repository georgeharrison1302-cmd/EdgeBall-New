import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calibrationBins, closingLineValue, cumulativeCurve, drawdown, priceVsResult, type SettledTip } from "./metrics";

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

  it("computes closing-line value only over stamped tips", () => {
    const result = closingLineValue([
      { ...tip("a", 2.1, 0.5, true), closingOdds: 1.95 },
      { ...tip("b", 2.0, 0.5, false), closingOdds: 2.4 },
      tip("c", 3, 0.3, false), // no closing price — excluded
    ]);
    assert.equal(result.priced, 2);
    assert.equal(result.beatClose, 1); // only the 2.10→1.95 tip beat the close
    // (2.1/1.95 - 1 + 2.0/2.4 - 1) / 2 = (0.0769 - 0.1667) / 2 ≈ -0.0449
    assert.ok(Math.abs(result.avgClv! - -0.0449) < 0.001);
    assert.equal(closingLineValue([tip("x", 2, 0.5, true)]).avgClv, null);
  });
});
