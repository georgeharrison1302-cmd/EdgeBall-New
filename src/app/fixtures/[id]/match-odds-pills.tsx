"use client";

import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

import type { MatchHubOdds } from "./hub-load";

const PILL_META: Record<
  string,
  { marketKind: SlipMarketKind; line?: number }
> = {
  home: { marketKind: "home_win" },
  draw: { marketKind: "draw" },
  away: { marketKind: "away_win" },
  "btts-yes": { marketKind: "btts_yes" },
  "btts-no": { marketKind: "btts_no" },
  over25: { marketKind: "over_goals", line: 2.5 },
  under25: { marketKind: "under_goals", line: 2.5 },
};

/** Match-line odds pills wired into the global Bet Slip. */
export function MatchOddsPills({
  odds,
  home,
  away,
  fixtureId,
}: {
  odds: MatchHubOdds;
  home: string;
  away: string;
  fixtureId: number;
}) {
  const match = `${home} vs ${away}`;
  const pills = [
    { key: "home", label: `${home} win`, odd: odds.home },
    { key: "draw", label: "Draw", odd: odds.draw },
    { key: "away", label: `${away} win`, odd: odds.away },
    { key: "btts-yes", label: "BTTS Yes", odd: odds.bttsYes },
    { key: "btts-no", label: "BTTS No", odd: odds.bttsNo },
    { key: "over25", label: "Over 2.5", odd: odds.over25 },
    { key: "under25", label: "Under 2.5", odd: odds.under25 },
  ];
  const priced = pills.filter((pill) => pill.odd != null && pill.odd > 1);
  if (priced.length === 0) {
    return (
      <EmptyReason
        className="mt-3"
        title="No Book Odds"
        detail="No 1X2 / BTTS / Over-Under prices stored for this match"
        source="prematch_odds"
      />
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {priced.map((pill) => {
        const meta = PILL_META[pill.key] ?? { marketKind: "other" as const };
        return (
          <AddToSlipButton
            key={pill.key}
            selectionId={`match:${fixtureId}:${pill.key}`}
            marketName={pill.label}
            decimalOdds={pill.odd}
            label={pill.label}
            match={match}
            fixtureId={fixtureId}
            marketKind={meta.marketKind}
            line={meta.line}
          />
        );
      })}
    </div>
  );
}
