"use client";

import Link from "next/link";
import { useState } from "react";

import type { MatchHubData, HubLineup, HubPlayer, HubH2H, HubTeam } from "@/app/match-hub/load";
import { FactorBadge } from "@/components/factors/FactorBadge";
import { PlayerAvatar, TeamBadge } from "@/components/Media";
import { CardMeter } from "@/components/stats/CardMeter";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { GameScriptBadge } from "@/components/stats/GameScriptBadge";
import { MatchupClashBadgeFromClash } from "@/components/stats/MatchupClashBadge";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";

type Tab = "overview" | "h2h" | "lineups";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "lineups", label: "Lineups" },
  { id: "h2h", label: "Head-to-Head" },
];

export default function MatchHub({
  data,
  unlocked = false,
}: {
  data: MatchHubData;
  unlocked?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const triggered = data.factors.filter((factor) => factor.matched);

  return (
    <div>
      <header className="mb-6 rounded-xl bg-slate-900 p-6 text-white">
        <div className="grid grid-cols-3 items-center gap-4">
          <TeamBlock team={data.homeTeam} align="left" />
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kick-off</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{data.time}</p>
            <p className="mt-1 text-xs text-slate-400">vs</p>
          </div>
          <TeamBlock team={data.awayTeam} align="right" />
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">
          {data.venue || "Venue not stored yet (fixtures)"}
          {data.referee ? ` · Ref: ${data.referee}` : " · Referee not stored yet (fixtures)"}
        </p>
        {triggered.length > 0 ? (
          <PremiumPaywall
            unlocked={unlocked}
            tease="Unlock deep match logs and +Edge% calculations"
            className="mt-4"
          >
            <div className="flex flex-wrap justify-center gap-2">
              {triggered.map((evaluation) => (
                <FactorBadge key={evaluation.factor.id} evaluation={evaluation} />
              ))}
            </div>
          </PremiumPaywall>
        ) : null}
      </header>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium outline-none transition-colors ${
                active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? <Overview data={data} /> : null}
      {tab === "lineups" ? (
        <Lineups
          homeName={data.homeTeam.name}
          awayName={data.awayTeam.name}
          home={data.homeLineup}
          away={data.awayLineup}
          absences={data.absences}
        />
      ) : null}
      {tab === "h2h" ? <HeadToHead rows={data.h2h} /> : null}

      <p className="mt-6 text-center text-sm text-[#64748b]">
        Looking for markets?{" "}
        <Link href="/props" className="font-semibold text-[#2563eb] hover:underline">
          Player Props
        </Link>
        {" · "}
        <Link href="/match-props" className="font-semibold text-[#2563eb] hover:underline">
          Match Props
        </Link>
        {" · "}
        <Link href="/generator" className="font-semibold text-[#2563eb] hover:underline">
          Bet Builder
        </Link>
      </p>
    </div>
  );
}

function TeamBlock({ team, align }: { team: HubTeam; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamBadge srcUrl={team.img} teamName={team.name} size="lg" />
      <p className="min-w-0 truncate text-sm font-semibold sm:text-base">{team.name}</p>
    </div>
  );
}

function Overview({ data }: { data: MatchHubData }) {
  const rows = [
    { label: `${data.homeTeam.name} win`, value: data.predictions.homeWin },
    { label: "Draw", value: data.predictions.draw },
    { label: `${data.awayTeam.name} win`, value: data.predictions.awayWin },
  ];
  const top = Math.max(0, ...rows.map((row) => row.value));
  const hasModel = rows.some((row) => row.value > 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">API-Football win probability</h2>
        {hasModel ? (
          <div className="mt-4 space-y-4">
            {rows.map((row) => {
              const lead = row.value === top;
              return (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900">{row.label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${lead ? "text-blue-600" : "text-gray-500"}`}>
                      {row.value}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${lead ? "bg-blue-600" : "bg-gray-200"}`} style={{ width: `${row.value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No stored model for this match.</p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Why this match</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <StrictRefBadgeFromProfile ref={data.strictRef} />
          <MatchupClashBadgeFromClash clash={data.clash} />
          <GameScriptBadge script={data.gameScript} />
        </div>
        {data.referee && !data.strictRef ? (
          <p className="mt-3 text-sm font-semibold text-slate-900">{data.referee}</p>
        ) : null}
        {!data.referee ? (
          <EmptyReason className="mt-3" detail="Referee is not stored for this fixture" source="fixtures" />
        ) : null}
        <div className="mt-4">
          <CardMeter
            home={data.homeYellowsPerGame}
            away={data.awayYellowsPerGame}
            homeName={data.homeTeam.name}
            awayName={data.awayTeam.name}
          />
        </div>
      </section>
    </div>
  );
}

function HeadToHead({ rows }: { rows: HubH2H[] }) {
  if (rows.length === 0) {
    return (
      <EmptyReason
        className="rounded-xl border border-gray-200 bg-white p-6"
        detail="No stored meetings for these clubs"
        source="fixtures"
      />
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Last five meetings</h2>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={`${row.date}-${row.score}-${row.home.name}`}
            className="grid grid-cols-12 items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
          >
            <div className="col-span-4 min-w-0 sm:col-span-3">
              <p className="text-xs font-medium text-slate-900">{row.date}</p>
              <p className="truncate text-[11px] text-gray-400">{row.competition}</p>
            </div>
            <div className="col-span-3 flex min-w-0 items-center justify-end gap-2">
              <span className="hidden truncate text-right text-sm text-slate-700 sm:inline">{row.home.name}</span>
              <TeamBadge srcUrl={row.home.img} teamName={row.home.name} size="sm" />
            </div>
            <p className="col-span-2 text-center text-sm font-bold tabular-nums text-slate-900">
              {row.score}
              {row.yellows != null ? <span className="block text-[10px] font-semibold text-[#64748b]">{row.yellows} yellows</span> : null}
            </p>
            <div className="col-span-3 flex min-w-0 items-center gap-2 sm:col-span-4">
              <TeamBadge srcUrl={row.away.img} teamName={row.away.name} size="sm" />
              <span className="truncate text-sm text-slate-700">{row.away.name}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Lineups({
  homeName,
  awayName,
  home,
  away,
  absences,
}: {
  homeName: string;
  awayName: string;
  home: HubLineup | null;
  away: HubLineup | null;
  absences: MatchHubData["absences"];
}) {
  if (!home && !away) {
    return (
      <EmptyReason
        className="rounded-xl border border-gray-200 bg-white p-6"
        title="Lineups not stored"
        detail="Starting XIs are not stored yet — usually published about an hour before kick-off"
        source="fixture_lineups"
      />
    );
  }

  const awayLines = away?.startingXI ?? [];
  const homeLines = home?.startingXI ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="relative flex min-h-[800px] flex-col justify-between overflow-hidden rounded-xl border-4 border-emerald-900 bg-emerald-800 p-4 lg:col-span-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t-2 border-white/20" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20"
        />
        <div>
          <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-white/60">
            {awayName}
            {away?.formation ? ` · ${away.formation}` : ""}
          </p>
          {awayLines.map((line, lineIndex) => (
            <div key={`away-${lineIndex}`} className="mb-4 flex w-full items-center justify-around">
              {line.map((player, playerIndex) => (
                <PlayerNode key={`${player.id}-${lineIndex}-${playerIndex}`} player={player} />
              ))}
            </div>
          ))}
        </div>
        <div>
          {homeLines.map((line, lineIndex) => (
            <div key={`home-${lineIndex}`} className="mt-4 flex w-full items-center justify-around">
              {line.map((player, playerIndex) => (
                <PlayerNode key={`${player.id}-${lineIndex}-${playerIndex}`} player={player} />
              ))}
            </div>
          ))}
          <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-white/60">
            {homeName}
            {home?.formation ? ` · ${home.formation}` : ""}
          </p>
        </div>
      </section>
      <aside className="lg:col-span-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Availability</h2>
          {absences.length === 0 ? (
            <EmptyReason
              className="mt-3"
              detail="No injury report stored for this match"
              source="injuries"
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {absences.map((absence) => (
                <li key={absence.id} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-50 text-[10px] font-bold text-red-600">
                    ×
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{absence.name}</p>
                    <p className="text-xs text-gray-500">
                      {absence.team} · {absence.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function PlayerNode({ player }: { player: HubPlayer }) {
  return (
    <div className="flex flex-col items-center">
      <PlayerAvatar srcUrl={player.imgUrl} playerName={player.name} size="md" />
      <span className="mt-1 max-w-[70px] truncate rounded bg-black/60 px-2 py-0.5 text-center text-[9px] text-white">
        {player.number ? `${player.number}. ` : ""}
        {lastName(player.name)}
      </span>
    </div>
  );
}
