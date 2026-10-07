"use client";

import Link from "next/link";

import { FactorBadge } from "@/components/factors/FactorBadge";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

import type { FactorFeedData, FactorFeedGroup, FactorScreenerMatch } from "./load";

const MARKET_META: Record<
  string,
  { marketKind: SlipMarketKind; line?: number; selection: string }
> = {
  over_2_5_goals: {
    marketKind: "over_goals",
    line: 2.5,
    selection: "Over 2.5 Goals",
  },
  over_3_5_cards: {
    marketKind: "other",
    line: 3.5,
    selection: "Over 3.5 Cards",
  },
  btts_yes: {
    marketKind: "btts_yes",
    selection: "BTTS Yes",
  },
};

/** Smart feed — curated factor cards, swipeable match rails, big Add to Slip. */
export function FactorsBoard({ data }: { data: FactorFeedData }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--cobalt)] uppercase">
          Smart feed
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--ink)]">
          Fixture Factors
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          We push the high-value setups to you — Disciplinary Storm, Fatigue Gap, Form Clash —
          with historical hit rates and one-tap slip adds.
        </p>
        {data.totalMatches > 0 ? (
          <p className="mt-3 text-sm font-semibold text-[#0f172a]">
            {data.totalMatches} live setup{data.totalMatches === 1 ? "" : "s"} across{" "}
            {data.groups.length} factor{data.groups.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </header>

      {data.groups.length === 0 ? (
        <EmptyReason
          variant="center"
          title="Feed is quiet"
          detail="No upcoming fixtures currently trigger a stored factor — check back after the next odds sync"
          source="fixtures"
        />
      ) : (
        data.groups.map((group) => <FactorFeedSection key={group.factorId} group={group} />)
      )}
    </div>
  );
}

export function FactorFeedSection({ group }: { group: FactorFeedGroup }) {
  const { backtest } = group;

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
          {group.badgeLabel}
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-[#0f172a]">
          {group.headline}
        </h2>
        <p className="mt-1 text-sm text-[#64748b]">{group.description}</p>
        {backtest.totalSamples > 0 ? (
          <p className="mt-3 text-sm font-semibold text-[#0f172a]">
            Historical: {backtest.hitRatePct}% hit on {group.marketLabel}
            <span className="font-medium text-[#64748b]">
              {" "}
              · n={backtest.totalSamples}
              {backtest.flatRoiPct != null
                ? ` · flat ROI ${backtest.flatRoiPct >= 0 ? "+" : ""}${backtest.flatRoiPct}%`
                : ""}
            </span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-[#64748b]">
            Historical backtest not settleable yet for {group.marketLabel}
          </p>
        )}
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
        {group.matches.map((match) => (
          <FeedMatchCard key={`${group.factorId}:${match.fixtureId}`} match={match} />
        ))}
      </div>
    </section>
  );
}

export function FeedMatchCard({ match }: { match: FactorScreenerMatch }) {
  const slip = useBetSlip();
  const meta = MARKET_META[match.market] ?? {
    marketKind: "other" as const,
    selection: match.marketLabel,
  };
  const matchLabel = `${match.home.name} vs ${match.away.name}`;
  const selectionId = `factor:${match.fixtureId}:${match.market}`;
  const selectionLabel = meta.selection;
  const added = slip?.hasLeg(selectionId) ?? false;
  const priced = match.marketOdd != null && match.marketOdd > 1;

  return (
    <article className="flex w-[min(100%,320px)] shrink-0 snap-start flex-col rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
        {match.competition} · {match.kickoff}
      </p>

      <Link href={match.hubHref} className="mt-3 flex items-center gap-3 hover:opacity-90">
        <TeamChip name={match.home.name} logo={match.home.logo} />
        <span className="text-xs font-bold text-[#64748b]">vs</span>
        <TeamChip name={match.away.name} logo={match.away.logo} />
      </Link>

      <div className="mt-4">
        <FactorBadge evaluation={match.evaluation} />
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-[#334155]">
        {match.evaluation.summary}
      </p>

      <div className="mt-4 rounded-xl border border-[#e2e8f0] bg-[#eef3f9] px-3 py-2.5">
        <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
          Suggested market
        </p>
        <p className="mt-0.5 text-sm font-bold text-[#0f172a]">{match.marketLabel}</p>
        {priced ? (
          <p className="mt-0.5 text-xs font-semibold text-[#2563eb]">
            Bet365 @{match.marketOdd!.toFixed(2)}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-[#94a3b8]">No Book Odds stored for this market</p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {priced ? (
          <button
            type="button"
            disabled={added || !slip}
            onClick={() => {
              if (!slip || added) return;
              slip.addLeg({
                id: selectionId,
                marketName: selectionLabel,
                decimalOdds: match.marketOdd!,
                label: selectionLabel,
                match: matchLabel,
                fixtureId: match.fixtureId,
                marketKind: meta.marketKind,
                line: meta.line,
              });
              slip.setOpen(true);
            }}
            className={`w-full rounded-full px-4 py-3.5 text-base font-black shadow-sm transition ${
              added
                ? "border-2 border-[#2563eb] bg-blue-50 text-[#2563eb]"
                : "bg-[#2563eb] text-white shadow-blue-600/20 hover:bg-[#1d4ed8]"
            }`}
          >
            {added ? "On slip" : `Add to Slip · @${match.marketOdd!.toFixed(2)}`}
          </button>
        ) : (
          <AddToSlipButton
            selectionId={selectionId}
            marketName={selectionLabel}
            decimalOdds={null}
            label={selectionLabel}
            size="lg"
          />
        )}
        <Link
          href={match.hubHref}
          className="block rounded-full border border-[#e2e8f0] px-4 py-2.5 text-center text-sm font-bold text-[#2563eb] hover:border-[#2563eb]"
        >
          Open match
        </Link>
      </div>
    </article>
  );
}

function TeamChip({ name, logo }: { name: string; logo: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-8 w-8 object-contain" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[10px] font-bold">
          {name.slice(0, 1)}
        </span>
      )}
      <span className="truncate text-sm font-bold text-[var(--ink)]">{name}</span>
    </span>
  );
}
