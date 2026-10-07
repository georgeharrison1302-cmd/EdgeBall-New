import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";
import type { UserBetRow } from "@/utils/portfolio/types";

export type PerformanceInsight = {
  kind: "strength" | "leak" | "watch";
  title: string;
  detail: string;
  marketLabel: string;
  hitRatePct: number;
  roiPct: number;
  sampleSize: number;
};

type Bucket = {
  label: string;
  bets: number;
  wins: number;
  stake: number;
  profit: number;
};

const MIN_SAMPLE = 3;

/**
 * Coach from settled user_bets — strengths to double down, leaks to cut.
 */
export function buildPerformanceInsights(settled: UserBetRow[]): PerformanceInsight[] {
  const decided = settled.filter((bet) => bet.status === "won" || bet.status === "lost");
  if (decided.length < MIN_SAMPLE) return [];

  const buckets = new Map<string, Bucket>();

  for (const bet of decided) {
    const key = bucketKeyForBet(bet);
    const current = buckets.get(key) ?? {
      label: bucketLabel(key),
      bets: 0,
      wins: 0,
      stake: 0,
      profit: 0,
    };
    current.bets += 1;
    if (bet.status === "won") current.wins += 1;
    current.stake += bet.stake;
    current.profit += bet.profit ?? 0;
    buckets.set(key, current);
  }

  const insights: PerformanceInsight[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.bets < MIN_SAMPLE || bucket.stake <= 0) continue;
    const hitRatePct = Math.round((bucket.wins / bucket.bets) * 100);
    const roiPct = Math.round((bucket.profit / bucket.stake) * 1000) / 10;
    const kind: PerformanceInsight["kind"] =
      roiPct >= 5 && hitRatePct >= 50
        ? "strength"
        : roiPct <= -8
          ? "leak"
          : "watch";

    insights.push({
      kind,
      marketLabel: bucket.label,
      hitRatePct,
      roiPct,
      sampleSize: bucket.bets,
      title:
        kind === "strength"
          ? `Double down on ${bucket.label}`
          : kind === "leak"
            ? `Leak detected: ${bucket.label}`
            : `Watch list: ${bucket.label}`,
      detail: insightDetail(kind, bucket.label, hitRatePct, roiPct, bucket.bets),
    });
  }

  return insights.sort((left, right) => {
    const rank = { strength: 0, leak: 1, watch: 2 } as const;
    return (
      rank[left.kind] - rank[right.kind] ||
      Math.abs(right.roiPct) - Math.abs(left.roiPct) ||
      right.sampleSize - left.sampleSize
    );
  });
}

function insightDetail(
  kind: PerformanceInsight["kind"],
  label: string,
  hitRatePct: number,
  roiPct: number,
  n: number,
): string {
  const roiText = `${roiPct >= 0 ? "+" : ""}${roiPct}% ROI`;
  if (kind === "strength") {
    return `You hit ${hitRatePct}% on ${label} across ${n} settled slips with ${roiText}. Size up when the edge is stored.`;
  }
  if (kind === "leak") {
    return `You have a ${hitRatePct}% hit rate on ${label}, but ${roiText} across ${n} slips. Cut volume or wait for clearer +Edge%.`;
  }
  return `${hitRatePct}% hit rate and ${roiText} on ${label} (${n} slips). Neutral so far — keep tracking.`;
}

export type MarketBreakdownRow = {
  key: string;
  label: string;
  bets: number;
  wins: number;
  hitRatePct: number;
  stake: number;
  profit: number;
  roiPct: number;
  avgOdds: number | null;
};

/** Per-market-bucket record across decided slips — the depth table behind the coach. */
export function buildMarketBreakdown(settled: UserBetRow[]): MarketBreakdownRow[] {
  const buckets = new Map<
    string,
    { label: string; bets: number; wins: number; stake: number; profit: number; odds: number[] }
  >();
  for (const bet of settled) {
    if (bet.status !== "won" && bet.status !== "lost") continue;
    const key = bucketKeyForBet(bet);
    const bucket = buckets.get(key) ?? {
      label: bucketLabel(key),
      bets: 0,
      wins: 0,
      stake: 0,
      profit: 0,
      odds: [],
    };
    bucket.bets += 1;
    if (bet.status === "won") bucket.wins += 1;
    bucket.stake += bet.stake;
    bucket.profit += bet.profit ?? 0;
    if (Number.isFinite(bet.combined_odds) && bet.combined_odds > 1) {
      bucket.odds.push(bet.combined_odds);
    }
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      bets: bucket.bets,
      wins: bucket.wins,
      hitRatePct: Math.round((bucket.wins / bucket.bets) * 100),
      stake: bucket.stake,
      profit: bucket.profit,
      roiPct: bucket.stake > 0 ? Math.round((bucket.profit / bucket.stake) * 1000) / 10 : 0,
      avgOdds:
        bucket.odds.length === 0
          ? null
          : bucket.odds.reduce((sum, odd) => sum + odd, 0) / bucket.odds.length,
    }))
    .sort((left, right) => right.stake - left.stake || right.bets - left.bets);
}

function bucketKeyForBet(bet: UserBetRow): string {
  const leg = bet.legs[0];
  if (!leg) return "other";
  const kind =
    leg.marketKind ??
    classifySlipMarket(leg.marketName || leg.label, undefined).marketKind;
  return marketBucket(kind, `${leg.marketName} ${leg.label}`);
}

function marketBucket(kind: SlipMarketKind, text: string): string {
  if (kind === "player_card" || /card|booked|yellow/i.test(text)) return "player_cards";
  if (kind === "player_fouls" || /foul/i.test(text)) return "player_fouls";
  if (kind === "player_shots" || /shot/i.test(text)) return "player_shots";
  if (
    kind === "over_goals" ||
    kind === "under_goals" ||
    kind === "btts_yes" ||
    kind === "btts_no" ||
    /over\s*2\.5|under\s*2\.5|btts|goals/i.test(text)
  ) {
    return "goals_markets";
  }
  if (kind === "home_win" || kind === "away_win" || kind === "draw") return "match_result";
  return "other";
}

function bucketLabel(key: string): string {
  switch (key) {
    case "player_cards":
      return "Player Card props";
    case "player_fouls":
      return "Player Foul props";
    case "player_shots":
      return "Shots props";
    case "goals_markets":
      return "Over/Under Goals & BTTS";
    case "match_result":
      return "Match Result";
    default:
      return "Other markets";
  }
}
