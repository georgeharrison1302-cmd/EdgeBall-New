"use client";

import Link from "next/link";

import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { FormStrip } from "@/components/stats/FormStrip";
import { HitRateStrip } from "@/components/stats/HitRateStrip";
import { PoissonVsBook } from "@/components/stats/PoissonVsBook";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import type { EdgeDashboardData, SeasonProof, ValueBetCard } from "@/app/dashboard/load";
import { booleansToOutcomes } from "@/lib/stats/last-five";

export default function EdgeDashboard({
  data,
  unlocked = false,
}: {
  data: EdgeDashboardData;
  unlocked?: boolean;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white px-6 py-8 shadow-sm sm:px-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(34,211,238,0.18), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 20%, rgba(37,99,235,0.14), transparent 50%)",
          }}
        />
        <div className="relative">
          <p className="text-xs font-extrabold tracking-[0.18em] text-[#2563eb] uppercase">
            EdgeBall Dashboard
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
            Stop guessing. Bet the stored edge.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[#64748b] sm:text-base">
            Live Poisson vs Bet365 discrepancies and hot last-5 streaks from{" "}
            {data.dateLabel}
            {data.matchCount > 0 ? ` · ${data.matchCount} pre-match fixtures` : ""}.
            No synthetic prices.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/props"
              className="rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25"
            >
              Open Prop Engine
            </Link>
            <Link
              href="/fixtures"
              className="rounded-full border border-[#e2e8f0] bg-white px-5 py-2.5 text-sm font-bold text-[#0f172a]"
            >
              Browse Match Hub
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-[#22d3ee] uppercase">
              Model vs book
            </p>
            <h2 className="text-xl font-bold text-[#0f172a]">Top Value Bets Today</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Biggest positive edge % where Bet365 price and model probability are both stored.
            </p>
          </div>
          <Link href="/props" className="text-sm font-semibold text-[#2563eb]">
            All angles →
          </Link>
        </div>

        {data.valueBets.length === 0 ? (
          <EmptyReason
            className="bg-white py-10"
            variant="center"
            title="No priced edge"
            detail="No positive value edges where Bet365 price and model probability are both stored for today's pre-match player props"
            source="prematch_odds"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.valueBets.map((bet) => (
              <article
                key={bet.id}
                className="flex flex-col rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0f172a]">{bet.player}</p>
                    <p className="truncate text-xs text-[#64748b]">{bet.selection}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#22d3ee] px-2.5 py-1 text-[11px] font-extrabold text-slate-900">
                    +{bet.edgePct.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-[#64748b]">{bet.match}</p>
                <div className="mt-3 flex min-h-[1.5rem] flex-wrap gap-1.5">
                  <SeasonProofBadges market={bet.market} proof={bet.proof} />
                </div>
                <div className="mt-3 space-y-2">
                  <PremiumPaywall unlocked={unlocked}>
                    <PoissonVsBook
                      modelProb={bet.modelProb}
                      decimalOdds={bet.odds}
                      edgePct={bet.edgePct}
                    />
                  </PremiumPaywall>
                  <PremiumPaywall unlocked={unlocked} tease="Unlock Last-5 form strips">
                    <FormStrip
                      outcomes={booleansToOutcomes(bet.form ?? [])}
                      label={/card|booked/i.test(bet.market) ? "Booked" : "Over"}
                    />
                  </PremiumPaywall>
                </div>
                <div className="mt-4">
                  <AddToSlipButton
                    selectionId={bet.id}
                    marketName={`${bet.player} ${bet.selection}`}
                    decimalOdds={bet.odds}
                    match={bet.match}
                    player={bet.player}
                    {...(() => {
                      const classified = classifySlipMarket(`${bet.selection} ${bet.market}`);
                      return {
                        marketKind: classified.marketKind,
                        line: classified.line,
                      };
                    })()}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-emerald-500 uppercase">
              Last-5 form
            </p>
            <h2 className="text-xl font-bold text-[#0f172a]">Hot Streaks</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Players hitting their prop line in at least 4 of the last 5 stored matches.
            </p>
          </div>
        </div>

        <PremiumPaywall unlocked={unlocked} tease="Unlock deep Last-5 match logs and hot streaks">
          {data.hotStreaks.length === 0 ? (
            <EmptyReason
              className="bg-white py-10"
              variant="center"
              title="No season proof"
              detail="No hot Last-5 form or season rates clear the board yet"
              source="fixture_player_statistics / player_season_stats"
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
              <ul className="divide-y divide-[#f1f5f9]">
                {data.hotStreaks.map((row) => {
                  const seasonRate =
                    row.proof.foulsPer90 ?? row.proof.sotPer90 ?? row.proof.tacklesPer90 ?? null;
                  return (
                    <li
                      key={`${row.id}-${row.selection}`}
                      className="flex flex-wrap items-center gap-4 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#0f172a]">
                          {row.player}{" "}
                          <span className="font-semibold text-[#64748b]">· {row.selection}</span>
                        </p>
                        <p className="truncate text-xs text-[#64748b]">{row.match}</p>
                      </div>
                      <HitRateStrip
                        values={row.form}
                        thresholdLabel={row.hits > 0 ? `${row.hits}/5` : "season"}
                        seasonAverage={seasonRate}
                        seasonUnit="/90"
                      />
                      {row.hits > 0 ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700">
                          {row.hits}/5 hot
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-700">
                          Season rate
                        </span>
                      )}
                      {row.odds != null && row.odds > 1 ? (
                        <AddToSlipButton
                          selectionId={row.id}
                          marketName={`${row.player} ${row.selection}`}
                          decimalOdds={row.odds}
                          match={row.match}
                          player={row.player}
                          {...(() => {
                            const classified = classifySlipMarket(`${row.selection} ${row.market}`);
                            return {
                              marketKind: classified.marketKind,
                              line: classified.line,
                            };
                          })()}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-[#64748b]">No Book Odds</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </PremiumPaywall>
      </section>
    </main>
  );
}

function SeasonProofBadges({
  market,
  proof,
}: {
  market: ValueBetCard["market"];
  proof: SeasonProof;
}) {
  const badges = seasonBadges(market, proof);
  if (badges.length === 0) {
    return (
      <span className="text-[11px] text-[#94a3b8]">
        Season proof not stored (player_season_stats)
      </span>
    );
  }
  return (
    <>
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-[#0f172a] ring-1 ring-[#e2e8f0]"
        >
          {badge}
        </span>
      ))}
    </>
  );
}

function seasonBadges(market: string, proof: SeasonProof): string[] {
  const badges: string[] = [];
  const apps = proof.appearances;
  const cardsOrFouls =
    market === "To Be Carded" || market === "Fouls Committed" || market === "Fouls Drawn";
  const shotsOrGoals = market === "Shots on Target" || market === "Total Shots";

  if (cardsOrFouls) {
    if (proof.foulsPer90 != null) badges.push(`${proof.foulsPer90.toFixed(1)} fouls/90`);
    if (proof.yellows != null && apps != null) {
      badges.push(`${proof.yellows} yellows in ${apps} apps`);
    } else if (proof.yellows != null) {
      badges.push(`${proof.yellows} yellows`);
    }
    if (proof.tacklesPer90 != null) badges.push(`${proof.tacklesPer90.toFixed(1)} tackles/90`);
  } else if (shotsOrGoals) {
    if (proof.sotPer90 != null) badges.push(`${proof.sotPer90.toFixed(1)} SOT/90`);
    if (proof.goals != null && apps != null) {
      badges.push(`${proof.goals} goals in ${apps} apps`);
    } else if (proof.goals != null) {
      badges.push(`${proof.goals} goals`);
    }
  } else {
    if (proof.foulsPer90 != null) badges.push(`${proof.foulsPer90.toFixed(1)} fouls/90`);
    if (proof.sotPer90 != null) badges.push(`${proof.sotPer90.toFixed(1)} SOT/90`);
    if (proof.yellows != null && apps != null) {
      badges.push(`${proof.yellows} yellows in ${apps} apps`);
    }
  }
  return badges;
}
