"use client";

import type { PropBoardRow } from "@/app/fixtures/[id]/hub-load";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { FormStrip } from "@/components/stats/FormStrip";
import { PoissonVsBook } from "@/components/stats/PoissonVsBook";
import { SeasonProofBadges } from "@/components/stats/SeasonProofBadges";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";

/**
 * Match Hub prop selection card — season proof stays free;
 * Poisson +Edge% and Last-5 FormStrip sit behind Pro.
 */
export function PropCard({
  row,
  fixtureId,
  unlocked,
}: {
  row: PropBoardRow;
  fixtureId: number;
  unlocked: boolean;
}) {
  const slip = useBetSlip();
  const selectionId = `prop:${fixtureId}:${row.marketKey}:${row.playerId}:${row.line ?? "na"}:${row.market}`;
  const selectionLabel = `${row.player} ${row.market}`;
  const added = slip?.hasLeg(selectionId) ?? false;
  const classified = classifySlipMarket(row.market, { marketKey: row.marketKey });

  return (
    <li className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--canvas)]/80 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--ink)]">{row.player}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{row.matchup}</p>
        </div>
        {row.teamLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={row.teamLogo} alt="" className="h-6 w-6 shrink-0 object-contain" />
        ) : null}
      </div>

      <p className="mt-2 text-[11px] font-extrabold tracking-wide text-[var(--cobalt)] uppercase">
        {row.market}
      </p>

      <div className="mt-2">
        <SeasonProofBadges
          market={row.marketKey === "other" ? "other" : row.marketKey}
          proof={{
            appearances: row.appearances,
            yellows: row.yellows,
            goals: row.goals,
            foulsPer90: row.foulsPer90,
            tacklesPer90: row.tacklesPer90,
            sotPer90: row.sotPer90,
          }}
        />
      </div>

      <div className="mt-3 flex-1 space-y-2">
        <PremiumPaywall unlocked={unlocked}>
          <PoissonVsBook
            modelProb={row.modelProb}
            decimalOdds={row.odd ?? undefined}
            edgePct={row.edgePct}
          />
        </PremiumPaywall>
        <PremiumPaywall unlocked={unlocked} tease="Unlock Last-5 form strips">
          <FormStrip
            outcomes={row.lastFive}
            label={row.marketKey === "cards" ? "Booked" : "Over"}
          />
        </PremiumPaywall>
      </div>

      <div className="mt-3">
        <AddToSlipButton
          selectionId={selectionId}
          marketName={selectionLabel}
          decimalOdds={row.odd ?? undefined}
          label={selectionLabel}
          match={row.matchup}
          player={row.player}
          fixtureId={fixtureId}
          marketKind={classified.marketKind}
          line={classified.line}
          added={added}
        />
      </div>
    </li>
  );
}