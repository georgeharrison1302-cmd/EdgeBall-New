"use client";

import type { PlayerProp } from "@/components/PlayerPropsBuilder";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { FormStrip } from "@/components/stats/FormStrip";
import { PoissonVsBook } from "@/components/stats/PoissonVsBook";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";
import { booleansToOutcomes } from "@/lib/stats/last-five";
import { isPriced } from "@/components/stats/types";

function edgeOf(prop: PlayerProp): number {
  return prop.edgePct ?? prop.edgeScore ?? 0;
}

/**
 * Match Hub radar — top three +Edge% props across every market.
 */
export function TopEdgePropsCarousel({
  props,
  unlocked = true,
}: {
  props: PlayerProp[];
  unlocked?: boolean;
}) {
  const slip = useBetSlip();
  const top = [...props]
    .filter((prop) => isPriced(prop.odds) && edgeOf(prop) > 0)
    .sort((left, right) => edgeOf(right) - edgeOf(left) || right.hitRate - left.hitRate)
    .slice(0, 3);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
            Top Value Angles
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-[#0f172a]">
            Highest +Edge% right now
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Thirty-second scan — the three most profitable stored edges across all markets.
          </p>
        </div>
        {top.length > 0 ? (
          <p className="text-xs font-semibold text-[#64748b]">
            {top.length} pick{top.length === 1 ? "" : "s"} · swipe →
          </p>
        ) : null}
      </div>

      {top.length === 0 ? (
        <EmptyReason
          detail="No positive +Edge% player props stored for today yet"
          source="prematch_odds + model"
        />
      ) : (
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
          {top.map((prop, index) => {
            const edge = edgeOf(prop);
            const added = slip?.hasLeg(prop.id) ?? false;
            const classified = classifySlipMarket(`${prop.selection} ${prop.market}`, {
              marketKey:
                prop.market === "To Be Carded"
                  ? "cards"
                  : prop.market === "Shots on Target" || prop.market === "Total Shots"
                    ? "shots"
                    : prop.market === "Fouls Committed" || prop.market === "Fouls Drawn"
                      ? "fouls"
                      : undefined,
            });
            return (
              <article
                key={`top-edge:${prop.id}`}
                className="flex w-[min(100%,300px)] shrink-0 snap-start flex-col rounded-3xl border border-[#e2e8f0] bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2563eb] text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span className="rounded-full bg-[#ecfeff] px-2.5 py-0.5 text-[11px] font-extrabold text-[#0e7490]">
                    +{edge.toFixed(1)}% edge
                  </span>
                </div>
                <p className="mt-3 truncate text-sm font-bold text-[#0f172a]">{prop.player}</p>
                <p className="truncate text-xs text-[#64748b]">{prop.match}</p>
                <p className="mt-2 text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
                  {prop.selection}
                </p>
                <div className="mt-3 flex-1 space-y-2">
                  {unlocked ? (
                    <>
                      <PoissonVsBook
                        modelProb={prop.modelProb}
                        decimalOdds={prop.odds ?? undefined}
                        edgePct={prop.edgePct ?? prop.edgeScore}
                      />
                      <FormStrip
                        outcomes={booleansToOutcomes(
                          (prop.form ?? []).filter((item): item is boolean => item !== null),
                        )}
                        label={/card|booked/i.test(prop.market) ? "Booked" : "Over"}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-[#94a3b8]">Pro unlocks Poisson + Last-5</p>
                  )}
                </div>
                <div className="mt-4">
                  <AddToSlipButton
                    selectionId={prop.id}
                    marketName={`${prop.player} ${prop.selection}`}
                    decimalOdds={prop.odds ?? undefined}
                    label={`${prop.player} ${prop.selection}`}
                    match={prop.match}
                    player={prop.player}
                    marketKind={classified.marketKind}
                    line={classified.line}
                    added={added}
                    size="lg"
                    onAdd={() => {
                      if (!slip || !isPriced(prop.odds) || added) return;
                      slip.addLeg({
                        id: prop.id,
                        marketName: `${prop.player} ${prop.selection}`,
                        decimalOdds: prop.odds!,
                        label: `${prop.player} ${prop.selection}`,
                        match: prop.match,
                        player: prop.player,
                        marketKind: classified.marketKind,
                        line: classified.line,
                      });
                      slip.setOpen(true);
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
