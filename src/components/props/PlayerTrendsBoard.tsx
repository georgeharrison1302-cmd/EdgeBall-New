"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/assets";
import type { PlayerProp } from "@/components/PlayerPropsBuilder";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { FormDots } from "@/components/stats/FormDots";
import { isPriced } from "@/components/stats/types";
import { trendRows } from "@/lib/stats/prop-hunter";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";

const STREAK_FILTERS = [3, 4, 5] as const;

/**
 * Player Trends — active consecutive-hit streaks at the player's
 * stored clear line, ranked longest-first.
 */
export function PlayerTrendsBoard({ props }: { props: PlayerProp[] }) {
  const [market, setMarket] = useState<string>("all");
  const [minStreak, setMinStreak] = useState<number>(3);

  const rows = useMemo(() => trendRows(props, minStreak), [props, minStreak]);
  const markets = useMemo(
    () => [...new Set(rows.map((row) => row.prop.market))],
    [rows],
  );
  const visible = rows.filter(
    (row) => market === "all" || row.prop.market === market,
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={market === "all"} onClick={() => setMarket("all")}>
          All stats · {rows.length}
        </FilterChip>
        {markets.map((name) => (
          <FilterChip key={name} active={market === name} onClick={() => setMarket(name)}>
            {name} · {rows.filter((row) => row.prop.market === name).length}
          </FilterChip>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        {STREAK_FILTERS.map((n) => (
          <FilterChip key={n} active={minStreak === n} onClick={() => setMinStreak(n)}>
            {n}+ in a row
          </FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyReason
          title="No active streaks"
          detail={`No player has hit ${minStreak}+ in a row at a stored line in the last 5 match logs`}
          source="fixture_player_statistics"
        />
      ) : visible.length === 0 ? (
        <EmptyReason
          title="No streaks in this market"
          detail={`No ${market} streaks of ${minStreak}+ in the last 5 match logs`}
          source="fixture_player_statistics"
        />
      ) : (
        <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {visible.map((row) => (
            <TrendCard key={row.key} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TrendCard({ row }: { row: ReturnType<typeof trendRows>[number] }) {
  const { prop, streak } = row;
  const threshold = prop.formThreshold ?? prop.line ?? 1;
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
    <li className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <PlayerHeadshot
          src={prop.playerImg}
          playerId={prop.playerId}
          playerName={prop.player}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{prop.player}</p>
          <p className="truncate text-xs text-muted">
            <Link
              href={prop.fixtureId ? `/fixtures/${prop.fixtureId}` : "/"}
              className="hover:text-cobalt"
            >
              {prop.match}
            </Link>
          </p>
        </div>
        <span className="rounded-full bg-cobalt px-2.5 py-1 text-[11px] font-extrabold text-white">
          {streak} in a row
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-faint uppercase">
            {prop.selection} · {prop.market}
          </p>
          <div className="mt-1.5">
            <FormDots counts={prop.formCounts ?? []} threshold={threshold} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {prop.formHitPct != null ? (
            <p className="text-xs font-bold text-ink">
              {prop.formHitPct}%{" "}
              <span className="font-semibold text-faint">L{row.games}</span>
            </p>
          ) : null}
          <AddToSlipButton
            selectionId={prop.id}
            marketName={`${prop.player} ${prop.selection}`}
            decimalOdds={prop.odds}
            label={isPriced(prop.odds) ? `@ ${prop.odds.toFixed(2)}` : undefined}
            match={prop.match}
            player={prop.player}
            fixtureId={prop.fixtureId ?? undefined}
            marketKind={classified.marketKind}
            line={classified.line}
          />
        </div>
      </div>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-cobalt bg-cobalt text-white"
          : "border-line bg-white text-ink hover:border-cobalt"
      }`}
    >
      {children}
    </button>
  );
}
