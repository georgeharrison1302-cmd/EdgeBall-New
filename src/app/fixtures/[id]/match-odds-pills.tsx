"use client";

import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

import type { MatchHubOdds } from "./hub-load";

type MarketSelection = {
  key: string;
  label: string;
  odd: number | null;
  marketKind: SlipMarketKind;
  line?: number;
};

/** Clean sportsbook market groups wired into the global Bet Slip. */
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
  const groups: Array<{ title: string; columns: string; selections: MarketSelection[] }> = [
    {
      title: "Full Time Result (1X2)",
      columns: "grid-cols-3",
      selections: [
        { key: "home", label: home, odd: odds.home, marketKind: "home_win" },
        { key: "draw", label: "Draw", odd: odds.draw, marketKind: "draw" },
        { key: "away", label: away, odd: odds.away, marketKind: "away_win" },
      ],
    },
    {
      title: "Both Teams to Score",
      columns: "grid-cols-2",
      selections: [
        { key: "btts-yes", label: "Yes", odd: odds.bttsYes, marketKind: "btts_yes" },
        { key: "btts-no", label: "No", odd: odds.bttsNo, marketKind: "btts_no" },
      ],
    },
    {
      title: "Total Goals 2.5",
      columns: "grid-cols-2",
      selections: [
        { key: "over25", label: "Over 2.5", odd: odds.over25, marketKind: "over_goals", line: 2.5 },
        { key: "under25", label: "Under 2.5", odd: odds.under25, marketKind: "under_goals", line: 2.5 },
      ],
    },
  ];
  const pricedGroups = groups
    .map((group) => ({
      ...group,
      selections: group.selections.filter((selection) => selection.odd != null && selection.odd > 1),
    }))
    .filter((group) => group.selections.length > 0);

  if (pricedGroups.length === 0) {
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
    <div className="mt-4 space-y-4">
      {pricedGroups.map((group) => (
        <section key={group.title}>
          <p className="mb-2 text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">{group.title}</p>
          <div className={`grid gap-2 ${group.columns}`}>
            {group.selections.map((selection) => (
              <AddToSlipButton
                key={selection.key}
                selectionId={`match:${fixtureId}:${selection.key}`}
                marketName={selection.label}
                decimalOdds={selection.odd}
                label={selection.label}
                match={match}
                fixtureId={fixtureId}
                marketKind={selection.marketKind}
                line={selection.line}
                size="lg"
                variant="card"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
