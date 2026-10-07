"use client";

import { useState } from "react";

import { AnalyticsTabs } from "./analytics-tabs";
import { FixtureBar } from "./fixture-bar";
import { HeroSection } from "./hero-section";
import { MatchupCard } from "./matchup-card";
import type { RankedProp, TodayBoard } from "./load";
import { combinedOdds, legKey } from "./markets";

export function TodayView({ board, notice }: { board: TodayBoard; notice?: string }) {
  const [selectedId, setSelectedId] = useState(board.featuredFixtureId);
  const [slip, setSlip] = useState<RankedProp[]>([]);
  const selected = board.fixtures.find((item) => item.fixture.id === selectedId) ?? board.fixtures[0] ?? null;
  const combined = combinedOdds(slip.map((leg) => leg.odds));
  const suggestion = [...slip]
    .reverse()
    .map((leg) => leg.correlation)
    .find((leg) => leg && !slip.some((item) => legKey(item) === legKey(leg))) ?? null;

  function toggleLeg(prop: RankedProp) {
    setSlip((current) => {
      const key = legKey(prop);
      if (current.some((leg) => legKey(leg) === key)) return current.filter((leg) => legKey(leg) !== key);
      return [...current, prop];
    });
  }

  return (
    <main className={`mx-auto flex max-w-lg flex-col gap-6 px-4 py-6 ${slip.length > 0 ? "pb-52" : ""}`}>
      <section>
        <p className="mb-3 text-sm text-[#64748b]">{board.dateLabel}</p>
        <FixtureBar
          fixtures={board.fixtures.map((item) => item.fixture)}
          selectedId={selected?.fixture.id ?? null}
          onSelect={setSelectedId}
        />
      </section>
      {selected ? (
        <>
          <HeroSection prop={selected.featured} />
          <MatchupCard matchup={selected.matchup} />
          {notice ? <p className="text-sm text-[#64748b]">{notice}</p> : null}
          <AnalyticsTabs
            props={selected.props}
            headToHead={selected.headToHead}
            home={selected.fixture.home}
            away={selected.fixture.away}
            propsLocked={selected.propsLocked}
            headToHeadLocked={selected.headToHeadLocked}
            refereeCards={selected.refereeCards}
            slipKeys={slip.map(legKey)}
            onToggleLeg={toggleLeg}
          />
        </>
      ) : null}
      {slip.length > 0 ? (
        <div className="fixed inset-x-4 bottom-4 z-20 rounded-xl bg-zinc-800 px-4 py-3 text-white shadow-lg">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-zinc-300">{slip.length === 1 ? "1 leg" : `${slip.length} legs`}</p>
            <p className="text-2xl font-semibold tracking-tight">{combined.toFixed(2)}</p>
          </div>
          <ul className="mt-2 flex max-h-24 flex-col gap-1 overflow-y-auto text-sm">
            {slip.map((leg) => (
              <li key={legKey(leg)} className="flex items-baseline justify-between gap-3">
                <span>
                  {leg.player} {leg.label}
                </span>
                <span className="font-semibold">{leg.odds.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {suggestion ? (
            <div className="mt-3 border-t border-zinc-700 pt-3">
              <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Suggested correlation</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-200">
                  {suggestion.player} {suggestion.label}
                  <span className="text-zinc-400"> {suggestion.odds.toFixed(2)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => toggleLeg(suggestion)}
                  className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                >
                  Add to slip
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
