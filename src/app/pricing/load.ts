import "server-only";

import { unstable_cache } from "next/cache";

import {
  calculateFactorHitRate,
  FACTOR_DEFAULT_MARKET,
  type FactorBacktestResult,
} from "@/lib/factors/backtester";
import { FACTOR_CATALOG, type FixtureFactorId } from "@/lib/factors/types";

export type PricingFactorSample = {
  factorId: FixtureFactorId;
  name: string;
  badgeLabel: string;
  marketLabel: string;
  backtest: FactorBacktestResult;
};

const SAMPLE_FACTORS: FixtureFactorId[] = [
  "form_clash",
  "disciplinary_storm",
  "fatigue_disparity",
];

const MARKET_LABEL: Record<string, string> = {
  over_2_5_goals: "Over 2.5 Goals",
  over_3_5_cards: "Over 3.5 Cards",
  btts_yes: "BTTS Yes",
};

/**
 * Live factor hit-rate teaser for the pricing page.
 * Cached — backtests are heavy; revalidate hourly.
 */
export async function loadPricingFactorSamples(): Promise<PricingFactorSample[]> {
  return unstable_cache(loadSamplesUncached, ["pricing-factor-samples"], {
    revalidate: 3600,
    tags: ["pricing-factor-samples"],
  })();
}

async function loadSamplesUncached(): Promise<PricingFactorSample[]> {
  const samples: PricingFactorSample[] = [];
  for (const factorId of SAMPLE_FACTORS) {
    try {
      const market = FACTOR_DEFAULT_MARKET[factorId];
      const backtest = await calculateFactorHitRate(factorId, market);
      if (backtest.totalSamples < 5) continue;
      samples.push({
        factorId,
        name: FACTOR_CATALOG[factorId].name,
        badgeLabel: FACTOR_CATALOG[factorId].badgeLabel,
        marketLabel: MARKET_LABEL[market] ?? market,
        backtest,
      });
    } catch (cause) {
      console.warn(`pricing sample failed for ${factorId}`, cause);
    }
  }
  return samples.sort(
    (left, right) =>
      right.backtest.hitRatePct - left.backtest.hitRatePct ||
      right.backtest.totalSamples - left.backtest.totalSamples,
  );
}
