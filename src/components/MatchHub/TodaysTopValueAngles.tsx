"use client";

import { FeedMatchCard } from "@/app/factors/factors-board";
import type { FactorFeedData } from "@/app/factors/load";
import { EmptyReason } from "@/components/stats/EmptyReason";

/**
 * Match Hub radar — flattened factor setups as one swipeable rail.
 */
export function TodaysTopValueAngles({ data }: { data: FactorFeedData }) {
  const cards = data.groups.flatMap((group) =>
    group.matches.map((match) => ({
      key: `${group.factorId}:${match.fixtureId}:${match.market}`,
      hitRate: group.backtest.hitRatePct,
      match,
      badge: group.badgeLabel,
    })),
  );
  cards.sort((left, right) => right.hitRate - left.hitRate);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
            Fixture Factors
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-[#0f172a]">
            Smart factor feed
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Disciplinary Storms, Fatigue Gaps, Form Clashes — swipe and add to slip.
          </p>
        </div>
        {cards.length > 0 ? (
          <p className="text-xs font-semibold text-[#64748b]">
            {cards.length} setup{cards.length === 1 ? "" : "s"} · swipe →
          </p>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <EmptyReason
          detail="No upcoming fixtures currently trigger a stored factor"
          source="fixtures"
        />
      ) : (
        <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
          {cards.slice(0, 12).map((card) => (
            <FeedMatchCard key={card.key} match={card.match} />
          ))}
        </div>
      )}
    </section>
  );
}
