import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prematchBets } from "@/utils/api-football/bet-catalogs";

import { hasMatchMarketPrices, matchMarketPrices } from "./match-markets";

const oddsData = {
  bets: [
    {
      id: prematchBets.matchWinner,
      name: "Match Winner",
      values: [
        { value: "Home", odd: "2.10" },
        { value: "Draw", odd: "3.40" },
        { value: "Away", odd: "3.60" },
      ],
    },
    {
      id: prematchBets.bothTeamsToScore,
      name: "Both Teams To Score",
      values: [
        { value: "Yes", odd: "1.95" },
        { value: "No", odd: "1.80" },
      ],
    },
    {
      id: prematchBets.goalsOverUnder,
      name: "Goals Over/Under",
      values: [
        { value: "Over", handicap: "2.5", odd: "2.20" },
        { value: "Under", handicap: "2.5", odd: "1.65" },
        { value: "Over 3.5", odd: "3.50" },
      ],
    },
  ],
};

describe("matchMarketPrices", () => {
  it("extracts standard 1X2, BTTS, and 2.5-goal prices", () => {
    assert.deepEqual(matchMarketPrices(oddsData), {
      home: 2.1,
      draw: 3.4,
      away: 3.6,
      bttsYes: 1.95,
      bttsNo: 1.8,
      over25: 2.2,
      under25: 1.65,
    });
  });

  it("supports Over 2.5 in the value label when handicap is absent", () => {
    const prices = matchMarketPrices({
      bets: [
        {
          id: prematchBets.goalsOverUnder,
          values: [{ value: "Over 2.5", odd: "2.05" }],
        },
      ],
    });
    assert.equal(prices.over25, 2.05);
  });

  it("returns null prices for missing data", () => {
    const prices = matchMarketPrices(null);
    assert.equal(prices.home, null);
    assert.equal(hasMatchMarketPrices(prices), false);
  });
});
