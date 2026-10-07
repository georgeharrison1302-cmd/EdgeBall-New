"use client";

import { useEffect, useState } from "react";

import { OddsText } from "@/components/display/OddsText";
import { TeamLogo } from "@/components/TeamLogo";
import {
  liveFieldsFromRow,
  subscribeFixtureUpdates,
  type FixtureRealtimeRow,
} from "@/hooks/useFixturesRealtime";

const LIVE_STATUSES = new Set([
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "LIVE",
  "INT",
  "SUSP",
]);

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

export type LiveTeam = {
  id?: number | null;
  name: string;
  logo?: string | null;
};

export type LiveScore = {
  home: number | null;
  away: number | null;
};

export type MatchWinnerOdds = {
  home: number | null;
  draw: number | null;
  away: number | null;
};

export type LiveMatchFixture = {
  id?: number;
  home_team: LiveTeam | string;
  away_team: LiveTeam | string;
  current_score: LiveScore | string;
  match_minute: number | null;
  status: string;
  kickoff?: string | null;
  stadium?: string | null;
  league?: string | null;
  odds?: MatchWinnerOdds | null;
};

export type LiveMatchCardProps = {
  fixture: LiveMatchFixture;
  /** Optional override so live odds can stream independently of the fixture row. */
  odds?: MatchWinnerOdds | null;
  selectedMarket?: "home" | "draw" | "away" | null;
  onSelectMarket?: (market: "home" | "draw" | "away") => void;
  className?: string;
};

/**
 * Live card. Subscribes to `fixtures` UPDATE events and merges minute, score, and status.
 */
export default function LiveMatchCard({
  fixture,
  odds,
  selectedMarket = null,
  onSelectMarket,
  className = "",
}: LiveMatchCardProps) {
  const [live, setLive] = useState(fixture);
  const [seenFixture, setSeenFixture] = useState(fixture);

  if (seenFixture !== fixture) {
    setSeenFixture(fixture);
    setLive(fixture);
  }

  useEffect(() => {
    const fixtureId = fixture.id;
    if (fixtureId == null) return;
    return subscribeFixtureUpdates((row) => {
      setLive((current) => applyFixtureRealtime(current, row));
    }, fixtureId);
  }, [fixture.id]);

  const home = toTeam(live.home_team);
  const away = toTeam(live.away_team);
  const score = toScore(live.current_score);
  const prices = odds ?? live.odds ?? null;
  const liveStatus = LIVE_STATUSES.has(live.status);
  const finished = FINISHED_STATUSES.has(live.status);
  const showScore = liveStatus || finished || score.home != null || score.away != null;
  const meta = [live.league, formatKickoff(live.kickoff), live.stadium]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <p className="min-w-0 truncate text-xs text-slate-500">{meta || "Match"}</p>
        <StatusBadge
          live={liveStatus}
          finished={finished}
          status={live.status}
          minute={live.match_minute}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-5">
        <TeamBlock team={home} align="right" />
        <div className="min-w-[4.5rem] text-center">
          <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {showScore ? `${score.home ?? 0}–${score.away ?? 0}` : "vs"}
          </p>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
            {liveStatus
              ? live.match_minute == null
                ? "Live"
                : `${live.match_minute}'`
              : finished
                ? live.status
                : "Kickoff"}
          </p>
        </div>
        <TeamBlock team={away} align="left" />
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
        <p className="mb-2 text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          Match Winner 1X2
        </p>
        <div className="grid grid-cols-3 gap-2">
          <OddsPill
            label="1"
            name={home.name}
            odd={prices?.home ?? null}
            active={selectedMarket === "home"}
            onClick={onSelectMarket ? () => onSelectMarket("home") : undefined}
          />
          <OddsPill
            label="X"
            name="Draw"
            odd={prices?.draw ?? null}
            active={selectedMarket === "draw"}
            onClick={onSelectMarket ? () => onSelectMarket("draw") : undefined}
          />
          <OddsPill
            label="2"
            name={away.name}
            odd={prices?.away ?? null}
            active={selectedMarket === "away"}
            onClick={onSelectMarket ? () => onSelectMarket("away") : undefined}
          />
        </div>
      </div>
    </article>
  );
}

function TeamBlock({ team, align }: { team: LiveTeam; align: "left" | "right" }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : "text-left"}`}
    >
      <TeamLogo src={team.logo ?? null} name={team.name} size={40} />
      <p className="truncate text-sm font-semibold text-slate-900">{team.name}</p>
    </div>
  );
}

function StatusBadge({
  live,
  finished,
  status,
  minute,
}: {
  live: boolean;
  finished: boolean;
  status: string;
  minute: number | null;
}) {
  if (live) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-600 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
        </span>
        {minute == null ? "LIVE" : `${minute}'`}
      </span>
    );
  }

  return (
    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
      {finished ? status : status || "NS"}
    </span>
  );
}

function OddsPill({
  label,
  name,
  odd,
  active,
  onClick,
}: {
  label: string;
  name: string;
  odd: number | null;
  active: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`flex min-w-0 flex-col items-center rounded-full border px-2 py-2 transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-900 hover:border-blue-600/40"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <span className={`text-[10px] font-semibold tracking-wide uppercase ${active ? "text-blue-100" : "text-slate-500"}`}>
        {label}
      </span>
      <span className="max-w-full truncate text-[11px]">{name}</span>
      <span className={`text-sm font-semibold tabular-nums ${active ? "text-white" : "text-blue-600"}`}>
        <OddsText decimal={odd} prefix="" fallback="–" />
      </span>
    </Tag>
  );
}

function toTeam(value: LiveTeam | string): LiveTeam {
  if (typeof value === "string") return { name: value };
  return value;
}

function toScore(value: LiveScore | string): LiveScore {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d+)\s*[-–:]\s*(\d+)$/);
    if (!match) return { home: null, away: null };
    return { home: Number(match[1]), away: Number(match[2]) };
  }
  return value;
}

function formatKickoff(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Merge a `fixtures` Realtime UPDATE row into card state without remounting. */
export function applyFixtureRealtime(
  current: LiveMatchFixture,
  row: FixtureRealtimeRow | Record<string, unknown>,
): LiveMatchFixture {
  const patch = liveFieldsFromRow(row);
  const score = toScore(current.current_score);
  return {
    ...current,
    current_score: {
      home: patch.current_score.home ?? score.home,
      away: patch.current_score.away ?? score.away,
    },
    match_minute: patch.match_minute ?? current.match_minute,
    status: patch.status ?? current.status,
  };
}
