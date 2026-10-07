"use client";

import { useState } from "react";

import { EmptyReason } from "@/components/stats/EmptyReason";

import { EdgeBar } from "./edge-bar";
import { FormTracker } from "./form-tracker";
import { Sparkline } from "./sparkline";
import type { HeadToHeadRow, RankedProp } from "./load";
import { MARKET_FILTERS, legKey, propsForFilter, type MarketFilterId } from "./markets";

export function AnalyticsTabs({
  props,
  headToHead,
  home,
  away,
  propsLocked,
  headToHeadLocked,
  slipKeys,
  onToggleLeg,
  refereeCards,
}: {
  props: RankedProp[];
  headToHead: HeadToHeadRow[];
  home: string;
  away: string;
  propsLocked: boolean;
  headToHeadLocked: boolean;
  slipKeys: string[];
  onToggleLeg: (prop: RankedProp) => void;
  refereeCards: number | null;
}) {
  const [activeTab, setActiveTab] = useState<"playerProps" | "matchBetBuilder">("playerProps");
  const [filter, setFilter] = useState<MarketFilterId>("goals");
  const locked = activeTab === "playerProps" ? propsLocked : headToHeadLocked;
  const visibleProps = propsForFilter(props, filter);
  const activeFilter = MARKET_FILTERS.find((item) => item.id === filter);

  return (
    <section>
      <div className="flex gap-2">
        <TabButton active={activeTab === "playerProps"} onClick={() => setActiveTab("playerProps")}>
          Player props
        </TabButton>
        <TabButton active={activeTab === "matchBetBuilder"} onClick={() => setActiveTab("matchBetBuilder")}>
          Head to head
        </TabButton>
      </div>

      {activeTab === "playerProps" ? (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
            {MARKET_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-full px-4 py-1 text-sm font-semibold ${
                  filter === item.id ? "bg-[#2563eb] text-white" : "border border-[#e2e8f0] bg-white text-[#334155]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <PlayerPropsTable
            props={visibleProps}
            locked={propsLocked}
            emptyLabel={activeFilter?.label ?? "market"}
            slipKeys={slipKeys}
            onToggleLeg={onToggleLeg}
            refereeCards={refereeCards}
          />
        </>
      ) : null}
      {activeTab === "matchBetBuilder" ? (
        <HeadToHeadTable rows={headToHead} home={home} away={away} locked={headToHeadLocked} />
      ) : null}
      {locked ? <UnlockButton /> : null}
    </section>
  );
}

function UnlockButton() {
  return (
    <form action="/api/checkout" method="POST" className="mt-4 flex justify-center">
      <button type="submit" className="rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white">
        Unlock the rest
      </button>
    </form>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        active ? "bg-[#2563eb] text-white" : "bg-white text-[#334155] border border-[#e2e8f0]"
      }`}
    >
      {children}
    </button>
  );
}

function PlayerPropsTable({
  props,
  locked,
  emptyLabel,
  slipKeys,
  onToggleLeg,
  refereeCards,
}: {
  props: RankedProp[];
  locked: boolean;
  emptyLabel: string;
  slipKeys: string[];
  onToggleLeg: (prop: RankedProp) => void;
  refereeCards: number | null;
}) {
  if (props.length === 0) {
    return (
      <EmptyReason
        className="mt-4"
        title="No Book Odds"
        detail={
          emptyLabel === "Cards"
            ? "No priced card props are stored for this match"
            : `No priced ${emptyLabel.toLowerCase()} props are stored for this match`
        }
        source="prematch_odds"
      />
    );
  }

  const highestHitRate = Math.max(...props.map((prop) => prop.hitRate));

  return (
    <div className="relative mt-4">
      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-[#e2e8f0] text-[#64748b]">
            <th className="px-3 py-2 font-medium">Player</th>
            <th className="px-3 py-2 font-medium">Prop</th>
            <th className="px-3 py-2 font-medium">Odds</th>
            <th className="px-3 py-2 font-medium">Hit rate</th>
            <th className="px-3 py-2 font-medium">Last 5</th>
            <th className="px-3 py-2 font-medium">Last 10</th>
            <th className="px-3 py-2 font-medium">Edge</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => {
            const points = prop.edge * 100;
            const signed = `${points > 0 ? "+" : ""}${points.toFixed(1)}%`;
            return (
              <tr
                key={`${prop.fixtureId}-${prop.playerId}-${prop.market}-${prop.label}-${prop.line}`}
                onClick={() => onToggleLeg(prop)}
                className={`cursor-pointer border-b border-[#e2e8f0] last:border-b-0 ${
                  slipKeys.includes(legKey(prop)) ? "bg-[#eff6ff]" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[#0f172a]">{prop.player}</span>
                    {refereeCards !== null ? <RefereeBadge cardsPerGame={refereeCards} /> : null}
                  </p>
                  <p className="text-[#64748b]">{prop.match}</p>
                </td>
                <td className="px-3 py-2 text-[#0f172a]">{prop.label}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[#0f172a]">
                  {prop.odds.toFixed(2)} ({(prop.implied * 100).toFixed(0)}%)
                </td>
                <td className="min-w-28 px-3 py-2">
                  <HitRateBar hitRate={prop.hitRate} highest={highestHitRate} />
                </td>
                <td className="px-3 py-2">
                  <FormTracker form={prop.form} />
                </td>
                <td className="px-3 py-2">
                  <Sparkline values={prop.trend} />
                </td>
                <td className="min-w-28 px-3 py-2">
                  <p className={`font-semibold ${points > 0 ? "text-[#2563eb]" : "text-[#0f172a]"}`}>{signed}</p>
                  <div className="mt-1">
                    <EdgeBar implied={prop.implied} hitRate={prop.hitRate} compact />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {locked ? <div className="pointer-events-none absolute inset-x-0 -bottom-px h-8 bg-gradient-to-t from-white to-transparent" /> : null}
    </div>
  );
}

function RefereeBadge({ cardsPerGame }: { cardsPerGame: number }) {
  return (
    <span className="group/badge relative inline-flex">
      <span className="rounded-full border border-[#e2e8f0] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
        Strict referee
      </span>
      <span className="pointer-events-none absolute top-full left-0 z-30 mt-1 w-max max-w-52 rounded-lg bg-zinc-800 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover/badge:opacity-100">
        Referee averages {cardsPerGame.toFixed(1)} cards per game.
      </span>
    </span>
  );
}

function HitRateBar({ hitRate, highest }: { hitRate: number; highest: number }) {
  const width = highest > 0 ? (hitRate / highest) * 100 : 0;
  return (
    <div>
      <p className="font-semibold text-[#0f172a]">{(hitRate * 100).toFixed(0)}%</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function HeadToHeadTable({
  rows,
  home,
  away,
  locked,
}: {
  rows: HeadToHeadRow[];
  home: string;
  away: string;
  locked: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyReason
        className="mt-4"
        detail="Season rates are not stored for both sides"
        source="player_season_stats"
      />
    );
  }

  return (
    <div className="mt-4">
      <div className="relative">
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-[#64748b]">
              <th className="px-3 py-2 font-medium">Rate</th>
              <th className="px-3 py-2 font-medium">{home}</th>
              <th className="px-3 py-2 font-medium">{away}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-[#e2e8f0] last:border-b-0">
                <td className="px-3 py-2 text-[#0f172a]">{row.label}</td>
                <td className="px-3 py-2 font-semibold text-[#0f172a]">{row.home}</td>
                <td className="px-3 py-2 font-semibold text-[#0f172a]">{row.away}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {locked ? <div className="pointer-events-none absolute inset-x-0 -bottom-px h-8 bg-gradient-to-t from-white to-transparent" /> : null}
      </div>
      <p className="mt-2 text-sm text-[#64748b]">Season rates. Not a predicted score.</p>
    </div>
  );
}
