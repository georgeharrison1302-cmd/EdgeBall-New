"use client";

import { TeamBadge } from "@/components/assets";
import { splitMatch } from "@/components/Media";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import type { ArbitrageOpportunity } from "@/lib/odds/arbitrage";

type Props = {
  opportunity: ArbitrageOpportunity;
  bankroll: number;
  unlocked: boolean;
};

/**
 * SureBet card — Leg 1 free with deep link; Leg 2 odds/stake/return free,
 * bookmaker + link gated behind EdgeBall Pro.
 */
export function ArbitrageCard({ opportunity, bankroll, unlocked }: Props) {
  const leg1 = opportunity.legs[0]!;
  const leg2 = opportunity.legs[1]!;
  const stake1 = stakeFor(opportunity, leg1.side, leg1.bookmaker, bankroll);
  const stake2 = stakeFor(opportunity, leg2.side, leg2.bookmaker, bankroll);
  const return1 = stake1 * leg1.odds;
  const return2 = stake2 * leg2.odds;
  const margin = opportunity.profitMarginPct;
  const [home, away] = splitMatch(opportunity.matchName);

  return (
    <article className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
            {opportunity.league}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex shrink-0 items-center">
              <TeamBadge teamName={home || opportunity.matchName} size={28} className="z-10 ring-2 ring-white" />
              {away ? (
                <TeamBadge teamName={away} size={28} className="-ml-2 ring-2 ring-white" />
              ) : null}
            </div>
            <h3 className="min-w-0 text-lg font-black tracking-tight text-[#0f172a]">
              {opportunity.matchName}
            </h3>
          </div>
          <p className="mt-1 text-sm font-semibold text-[#475569]">{opportunity.marketLabel}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm">
          +{margin.toFixed(2)}% Guaranteed Profit
        </span>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <LegPanel
          title="Leg 1"
          side={formatSide(leg1.side, leg1.label)}
          odds={leg1.odds}
          stake={stake1}
          ret={return1}
          bookmaker={leg1.bookmaker}
          directLink={leg1.directLink}
          revealBookmaker
        />

        <div className="rounded-xl border border-[#e2e8f0] bg-[#eef3f9] p-4">
          <p className="text-[10px] font-extrabold tracking-wide text-[#64748b] uppercase">
            Leg 2
          </p>
          <p className="mt-1 text-sm font-bold text-[#0f172a]">
            {formatSide(leg2.side, leg2.label)}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Odds" value={leg2.odds.toFixed(2)} />
            <Stat label="Stake" value={gbp(stake2)} />
            <Stat label="Return" value={gbp(return2)} />
          </dl>

          <div className="mt-3">
            {unlocked ? (
              <BookmakerCta bookmaker={leg2.bookmaker} directLink={leg2.directLink} />
            ) : (
              <PremiumPaywall
                unlocked={false}
                tease="Unlock EdgeBall Pro to reveal the hedging bookmaker and guarantee profit."
                className="min-h-[7.5rem]"
              >
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
                  <p className="text-sm font-bold text-[#0f172a]">{leg2.bookmaker}</p>
                  <p className="mt-2 text-xs font-semibold text-[#2563eb]">
                    Place Bet on {leg2.bookmaker}
                  </p>
                </div>
              </PremiumPaywall>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function LegPanel({
  title,
  side,
  odds,
  stake,
  ret,
  bookmaker,
  directLink,
  revealBookmaker,
}: {
  title: string;
  side: string;
  odds: number;
  stake: number;
  ret: number;
  bookmaker: string;
  directLink: string | null;
  revealBookmaker: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[#eef3f9] p-4">
      <p className="text-[10px] font-extrabold tracking-wide text-[#64748b] uppercase">{title}</p>
      {revealBookmaker ? (
        <p className="mt-1 text-sm font-extrabold text-[#0f172a]">{bookmaker}</p>
      ) : null}
      <p className="mt-0.5 text-sm font-bold text-[#475569]">{side}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Odds" value={odds.toFixed(2)} />
        <Stat label="Stake" value={gbp(stake)} />
        <Stat label="Return" value={gbp(ret)} />
      </dl>
      {revealBookmaker ? (
        <div className="mt-3">
          <BookmakerCta bookmaker={bookmaker} directLink={directLink} />
        </div>
      ) : null}
    </div>
  );
}

function BookmakerCta({
  bookmaker,
  directLink,
}: {
  bookmaker: string;
  directLink: string | null;
}) {
  const label = `Place Bet on ${bookmaker}`;
  if (!directLink) {
    return (
      <p className="rounded-full border border-[#e2e8f0] bg-white px-3 py-2 text-center text-xs font-semibold text-[#94a3b8]">
        Deep link not stored for {bookmaker}
      </p>
    );
  }
  return (
    <a
      href={directLink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-full items-center justify-center rounded-full bg-[#2563eb] px-3 py-2.5 text-sm font-bold text-white hover:bg-[#1d4ed8]"
    >
      {label}
    </a>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2">
      <dt className="text-[10px] font-bold tracking-wide text-[#94a3b8] uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold tabular-nums text-[#0f172a]">{value}</dd>
    </div>
  );
}

function stakeFor(
  opportunity: ArbitrageOpportunity,
  side: string,
  bookmaker: string,
  bankroll: number,
) {
  const match =
    opportunity.stakes.find(
      (row) =>
        row.bookmaker.toLowerCase() === bookmaker.toLowerCase() &&
        row.side.toLowerCase() === side.toLowerCase(),
    ) ??
    opportunity.stakes.find((row) => row.bookmaker.toLowerCase() === bookmaker.toLowerCase()) ??
    opportunity.stakes.find((row) => row.side.toLowerCase() === side.toLowerCase());
  const percent = match?.stakePercent ?? 1 / Math.max(opportunity.legs.length, 1);
  return bankroll * percent;
}

function formatSide(side: string, label: string | null) {
  const raw = (label ?? side).trim();
  if (!raw) return "Selection";
  const lower = raw.toLowerCase();
  if (lower === "over" || lower === "under") {
    return lower === "over" ? "Over" : "Under";
  }
  if (lower === "home" || lower === "away" || lower === "draw") {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  return raw;
}

function gbp(value: number) {
  return `£${value.toFixed(2)}`;
}
