"use client";

import { useState } from "react";

// Headline competitions that always get a quick-filter pill when they are playing.
export const TIER_1_LEAGUES = [
  "Premier League",
  "Championship",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Champions League",
  "Europa League",
];

export function splitLeagues(availableLeagues: string[]) {
  const quickFilterLeagues = availableLeagues.filter((league) =>
    TIER_1_LEAGUES.includes(league),
  );
  const otherLeagues = availableLeagues.filter(
    (league) => !TIER_1_LEAGUES.includes(league),
  );
  return { quickFilterLeagues, otherLeagues };
}

export default function LeagueFilter({
  availableLeagues,
  selectedLeagues,
  onChange,
}: {
  availableLeagues: string[];
  selectedLeagues: string[];
  onChange: (leagues: string[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const moreOpen = hovered || pinned;
  const { quickFilterLeagues, otherLeagues } = splitLeagues(availableLeagues);
  const otherSelectedCount = otherLeagues.filter((league) =>
    selectedLeagues.includes(league),
  ).length;

  function toggle(league: string) {
    onChange(
      selectedLeagues.includes(league)
        ? selectedLeagues.filter((item) => item !== league)
        : [...selectedLeagues, league],
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <LeaguePill
        active={selectedLeagues.length === 0}
        onClick={() => onChange([])}
        tone="solid"
      >
        All Leagues
      </LeaguePill>
      {quickFilterLeagues.map((league) => (
        <LeaguePill
          key={league}
          active={selectedLeagues.includes(league)}
          onClick={() => toggle(league)}
          tone="soft"
        >
          {league}
        </LeaguePill>
      ))}
      {otherLeagues.length > 0 ? (
        <div
          className="relative"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setPinned(false);
          }}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setPinned((value) => !value)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              otherSelectedCount > 0
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            + More Leagues
            {otherSelectedCount > 0 ? ` (${otherSelectedCount})` : ""}
          </button>
          {moreOpen ? (
            <div className="absolute left-0 top-full z-30 pt-1">
              <div
                role="menu"
                className="max-h-60 w-60 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
              >
                {otherLeagues.map((league) => {
                  const checked = selectedLeagues.includes(league);
                  return (
                    <label
                      key={league}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(league)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span
                        className={checked ? "font-medium text-blue-700" : ""}
                      >
                        {league}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LeaguePill({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: "solid" | "soft";
}) {
  const activeClass =
    tone === "solid"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${active ? activeClass : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}
