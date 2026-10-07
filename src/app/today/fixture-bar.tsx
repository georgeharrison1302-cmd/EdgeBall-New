"use client";

import { useEffect, useRef } from "react";

import type { TodayFixture } from "./load";

export function FixtureBar({
  fixtures,
  selectedId,
  onSelect,
}: {
  fixtures: TodayFixture[];
  selectedId: number | null;
  onSelect: (fixtureId: number) => void;
}) {
  const buttons = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (selectedId === null) return;
    buttons.current.get(selectedId)?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [selectedId]);

  if (fixtures.length === 0) {
    return <p className="text-sm text-[#64748b]">No Nations League matches today.</p>;
  }

  return (
    <div className="flex snap-x gap-3 overflow-x-auto hide-scrollbar">
      {fixtures.map((fixture) => {
        const selected = fixture.id === selectedId;
        return (
          <button
            key={fixture.id}
            type="button"
            ref={(node) => {
              if (node) buttons.current.set(fixture.id, node);
              else buttons.current.delete(fixture.id);
            }}
            onClick={() => onSelect(fixture.id)}
            className={`w-[78%] shrink-0 snap-start rounded-2xl border bg-white px-4 py-3 text-left ${
              selected ? "border-[#2563eb]" : "border-[#e2e8f0]"
            }`}
          >
            <p className="text-sm font-semibold text-[#0f172a]">
              {fixture.home} v {fixture.away}
            </p>
            <p className="mt-1 text-sm text-[#64748b]">{fixture.time}</p>
          </button>
        );
      })}
    </div>
  );
}
