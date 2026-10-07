"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  liveFieldsFromRow,
  subscribeFixtureUpdates,
  type FixtureRealtimeRow,
} from "@/hooks/useFixturesRealtime";
import { LeagueLogo, TeamBadge } from "@/components/assets";
import { KickoffText } from "@/components/display/KickoffText";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { OddsPill } from "@/components/stats/OddsPill";

import { fixtureBucket } from "./bucket";
import { groupFixturesByLeague, sortFixtureMatches } from "./board-utils";
import type { FixtureMatch } from "./types";

export default function FixtureBoard({
  matches,
  emptyDetail = "No fixtures stored for this date",
}: {
  matches: FixtureMatch[];
  emptyDetail?: string;
}) {
  const [liveMatches, setLiveMatches] = useState(matches);
  const [seenMatches, setSeenMatches] = useState(matches);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"league" | "time">("league");

  if (seenMatches !== matches) {
    setSeenMatches(matches);
    setLiveMatches(matches);
  }

  useEffect(() => {
    return subscribeFixtureUpdates((row) => {
      setLiveMatches((current) => mergeBoardRow(current, row));
    });
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? liveMatches.filter((match) =>
          `${match.home.name} ${match.away.name} ${match.league}`.toLowerCase().includes(needle),
        )
      : liveMatches;
    return sortFixtureMatches(filtered);
  }, [liveMatches, query]);

  const groups =
    group === "time"
      ? [{ id: "time", name: "", logo: null, matches: shown }]
      : groupFixturesByLeague(shown);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-[#e2e8f0] bg-white p-1 shadow-sm">
          <BoardToggle active={group === "league"} onClick={() => setGroup("league")}>
            Competition
          </BoardToggle>
          <BoardToggle active={group === "time"} onClick={() => setGroup("time")}>
            Kickoff
          </BoardToggle>
        </div>
        <p className="text-sm text-[#64748b]">
          {shown.length} {shown.length === 1 ? "match" : "matches"}
        </p>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search team or competition"
        className="mt-4 w-full rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm text-[#0f172a] shadow-sm outline-none placeholder:text-[#94a3b8] focus:border-[#2563eb]"
      />

      {shown.length === 0 ? (
        <EmptyReason
          className="mt-4"
          variant="panel"
          title={query ? "No matching fixtures" : "No fixtures"}
          detail={query ? `No fixture matches “${query}” on this board` : emptyDetail}
          source="fixtures"
        />
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((league) => (
            <section key={league.id} className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
              {league.name ? (
                <Link
                  prefetch={false}
                  href={`/competitions/${league.id}`}
                  className="flex items-center gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 transition-colors hover:bg-[#eff6ff]"
                >
                  <LeagueLogo src={league.logo} leagueId={Number(league.id)} leagueName={league.name} size={20} />
                  <span className="text-sm font-bold text-[#0f172a]">{league.name}</span>
                  <span className="ml-auto text-xs font-semibold text-[#64748b]">
                    {league.matches.length} {league.matches.length === 1 ? "match" : "matches"}
                  </span>
                </Link>
              ) : null}
              <div className="divide-y divide-[#e2e8f0]">
                {league.matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchCard({ match }: { match: FixtureMatch }) {
  const scored = match.bucket === "finished" || match.bucket === "live";
  const status = statusLabel(match);
  const matchName = `${match.home.name} v ${match.away.name}`;
  const prices = match.prices;
  const hasResultOdds = prices.home != null || prices.draw != null || prices.away != null;
  const hasBtts = prices.bttsYes != null || prices.bttsNo != null;
  const hasTotals = prices.over25 != null || prices.under25 != null;

  return (
    <article className="bg-white p-4 transition-colors hover:bg-[#fbfdff]">
      <div className="grid gap-4 lg:grid-cols-[76px_minmax(0,1fr)_230px] lg:items-center">
        <div className="flex items-center gap-3 lg:block">
          <p className="text-sm font-bold text-[#0f172a]">
            <KickoffText utc={match.kickoffAt} fallback={match.kickoff || "TBC"} />
          </p>
          <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${statusClass(match)}`}>
            {status}
          </p>
        </div>

        <Link
          prefetch={false}
          href={`/fixtures/${match.id}`}
          aria-label={`Open ${matchName}`}
          className="block min-w-0 rounded-xl px-2 py-1 -m-1 transition-colors hover:bg-[#f8fafc]"
        >
          <TeamRow side={match.home} score={scored ? match.goalsHome : null} />
          <TeamRow side={match.away} score={scored ? match.goalsAway : null} />
        </Link>

        <div className="grid grid-cols-3 gap-1.5 self-center">
          {hasResultOdds ? (
            <>
              <PriceButton
                match={match}
                matchName={matchName}
                selection="home"
                label="1"
                marketName="Full Time Result"
                odd={prices.home}
                marketKind="home_win"
              />
              <PriceButton
                match={match}
                matchName={matchName}
                selection="draw"
                label="X"
                marketName="Full Time Result"
                odd={prices.draw}
                marketKind="draw"
              />
              <PriceButton
                match={match}
                matchName={matchName}
                selection="away"
                label="2"
                marketName="Full Time Result"
                odd={prices.away}
                marketKind="away_win"
              />
            </>
          ) : (
            <div className="col-span-3 flex lg:justify-end">
              <OddsPill decimalOdds={null} size="sm" />
            </div>
          )}
        </div>
      </div>

      {hasBtts || hasTotals ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e2e8f0] pt-3">
          {hasBtts ? (
            <SecondaryMarket label="BTTS">
              <PriceButton
                match={match}
                matchName={matchName}
                selection="btts-yes"
                label="Yes"
                marketName="Both Teams To Score"
                odd={prices.bttsYes}
                marketKind="btts_yes"
                compact
              />
              <PriceButton
                match={match}
                matchName={matchName}
                selection="btts-no"
                label="No"
                marketName="Both Teams To Score"
                odd={prices.bttsNo}
                marketKind="btts_no"
                compact
              />
            </SecondaryMarket>
          ) : null}
          {hasTotals ? (
            <SecondaryMarket label="Goals 2.5">
              <PriceButton
                match={match}
                matchName={matchName}
                selection="over25"
                label="Over"
                marketName="Total Goals 2.5"
                odd={prices.over25}
                marketKind="over_goals"
                line={2.5}
                compact
              />
              <PriceButton
                match={match}
                matchName={matchName}
                selection="under25"
                label="Under"
                marketName="Total Goals 2.5"
                odd={prices.under25}
                marketKind="under_goals"
                line={2.5}
                compact
              />
            </SecondaryMarket>
          ) : null}
          <Link prefetch={false} href={`/fixtures/${match.id}`} className="ml-auto text-xs font-bold text-[#2563eb]">
            Match Hub →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex justify-end">
          <Link prefetch={false} href={`/fixtures/${match.id}`} className="text-xs font-bold text-[#2563eb]">
            Match Hub →
          </Link>
        </div>
      )}
    </article>
  );
}

function PriceButton({
  match,
  matchName,
  selection,
  label,
  marketName,
  odd,
  marketKind,
  line,
  compact = false,
}: {
  match: FixtureMatch;
  matchName: string;
  selection: string;
  label: string;
  marketName: string;
  odd: number | null;
  marketKind: "home_win" | "draw" | "away_win" | "btts_yes" | "btts_no" | "over_goals" | "under_goals";
  line?: number;
  compact?: boolean;
}) {
  return (
    <AddToSlipButton
      selectionId={`match:${match.id}:${selection}`}
      marketName={marketName}
      decimalOdds={odd}
      label={label}
      match={matchName}
      fixtureId={match.id}
      marketKind={marketKind}
      line={line}
      size={compact ? "sm" : "md"}
      variant={compact ? "pill" : "card"}
    />
  );
}

function SecondaryMarket({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] p-1">
      <span className="px-2 text-[10px] font-extrabold tracking-wide text-[#64748b] uppercase">{label}</span>
      {children}
    </div>
  );
}

function TeamRow({ side, score }: { side: FixtureMatch["home"]; score: number | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-1.5">
      <TeamBadge src={side.logo} teamId={side.id} teamName={side.name} size={26} />
      <span className="min-w-0 truncate text-sm font-semibold text-[#0f172a]">{side.name}</span>
      <FormDots form={side.form} />
      <span className="ml-auto w-7 text-right text-base font-black tabular-nums text-[#0f172a]">
        {score ?? ""}
      </span>
    </div>
  );
}

function FormDots({ form }: { form: string | null }) {
  const letters = (form ?? "").toUpperCase().replace(/[^WDL]/g, "").slice(-5).split("");
  if (letters.length === 0) return null;
  return (
    <span className="hidden shrink-0 gap-1 sm:flex">
      {letters.map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
            letter === "W"
              ? "bg-[#2563eb] text-white"
              : letter === "L"
                ? "bg-[#0f172a] text-white"
                : "bg-[#e2e8f0] text-[#475569]"
          }`}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

function BoardToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-[#2563eb] text-white" : "text-[#64748b] hover:text-[#0f172a]"
      }`}
    >
      {children}
    </button>
  );
}

function statusLabel(match: FixtureMatch) {
  if (match.bucket === "live") return match.minute != null ? `Live ${match.minute}'` : "Live";
  if (match.bucket === "finished") return match.status && match.status !== "NS" ? match.status : "FT";
  if (match.bucket === "upcoming") return "Kickoff";
  return match.status || "TBC";
}

function statusClass(match: FixtureMatch) {
  if (match.bucket === "live") return "bg-red-50 text-red-600";
  if (match.bucket === "finished") return "bg-slate-100 text-slate-500";
  if (match.bucket === "upcoming") return "bg-blue-50 text-[#2563eb]";
  return "bg-slate-100 text-slate-500";
}

function mergeBoardRow(matches: FixtureMatch[], row: FixtureRealtimeRow) {
  const id = Number(row.id);
  if (!Number.isInteger(id)) return matches;
  return matches.map((match) => {
    if (match.id !== id) return match;
    const patch = liveFieldsFromRow(row);
    const status = patch.status ?? match.status;
    return {
      ...match,
      status,
      goalsHome: patch.current_score.home ?? match.goalsHome,
      goalsAway: patch.current_score.away ?? match.goalsAway,
      minute: patch.match_minute ?? match.minute,
      bucket: fixtureBucket(status, match.kickoffAt),
    };
  });
}
