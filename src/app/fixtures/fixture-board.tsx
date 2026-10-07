"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  liveFieldsFromRow,
  subscribeFixtureUpdates,
  type FixtureRealtimeRow,
} from "@/hooks/useFixturesRealtime";
import { LeagueLogo, TeamBadge } from "@/components/assets";
import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { KickoffText } from "@/components/display/KickoffText";
import { CardMeter } from "@/components/stats/CardMeter";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { GameScriptBadge } from "@/components/stats/GameScriptBadge";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";

import { fixtureBucket } from "./bucket";
import type { FixtureMatch } from "./types";

export default function FixtureBoard({ matches }: { matches: FixtureMatch[] }) {
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
    if (!needle) return liveMatches;
    return liveMatches.filter((match) => `${match.home.name} ${match.away.name} ${match.league}`.toLowerCase().includes(needle));
  }, [liveMatches, query]);
  const open = shown[0] ?? null;
  const groups = group === "time" ? [{ id: "time", name: "", logo: null, matches: shown }] : groupByLeague(shown);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full bg-gray-100 p-1">
            <button type="button" onClick={() => setGroup("league")} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${group === "league" ? "bg-blue-600 text-white" : "text-gray-600"}`}>
              By league
            </button>
            <button type="button" onClick={() => setGroup("time")} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${group === "time" ? "bg-blue-600 text-white" : "text-gray-600"}`}>
              By time
            </button>
          </div>
          <p className="text-sm text-gray-500">{shown.length} matches</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search team or competition"
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600"
        />
        {shown.length === 0 ? <p className="mt-4 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No fixtures stored for this day.</p> : null}
        <div className="mt-4 space-y-4">
          {groups.map((league) => (
            <div key={league.id}>
              {league.name ? (
                <div className="mb-2 flex items-center gap-2">
                  <LeagueLogo
                    src={league.logo}
                    leagueId={Number(league.id) || null}
                    leagueName={league.name}
                    size={20}
                  />
                  <h2 className="text-sm font-semibold text-slate-900">{league.name}</h2>
                </div>
              ) : null}
              <div className="space-y-3">
                {league.matches.map((match) => (
                  <MatchCard key={match.id} match={match} open={match.id === open?.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <SidePanel match={open} />
    </div>
  );
}

function MatchCard({ match, open }: { match: FixtureMatch; open: boolean }) {
  const scored = match.bucket === "finished" || match.bucket === "live";
  const centre =
    scored && match.goalsHome != null && match.goalsAway != null ? (
      `${match.goalsHome}–${match.goalsAway}`
    ) : (
      <KickoffText utc={match.kickoffAt} fallback={match.kickoff || "Kickoff TBC"} />
    );
  const status =
    match.bucket === "live" && match.minute != null
      ? `${match.status} ${match.minute}'`
      : scored
        ? match.status
        : "Kickoff";
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide side={match.home} align="left" />
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-900">{centre}</p>
          <p className="text-[10px] tracking-wide text-gray-500 uppercase">{status}</p>
        </div>
        <TeamSide side={match.away} align="right" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StrictRefBadgeFromProfile profile={match.strictRef} />
        <GameScriptBadge script={match.gameScript} />
      </div>
      <div className="mt-3">
        <CardMeter
          home={match.homeYellowsPerGame}
          away={match.awayYellowsPerGame}
          homeName={match.home.name}
          awayName={match.away.name}
        />
      </div>
      {open ? <OpenMatch match={match} /> : null}
      {open ? null : (
        <Link href={`/fixtures/${match.id}`} className="mt-3 block text-center text-sm font-semibold text-blue-600">
          Open match
        </Link>
      )}
    </article>
  );
}

function OpenMatch({ match }: { match: FixtureMatch }) {
  const { formatOdds } = useDisplayPrefs();
  const hasModel = match.homePct != null && match.drawPct != null && match.awayPct != null;
  const hasPrices = match.homeOdd != null && match.drawOdd != null && match.awayOdd != null;
  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      {hasModel ? (
        <>
          <p className="text-[10px] tracking-wide text-gray-500 uppercase">Stored API model</p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="bg-blue-600" style={{ width: `${match.homePct}%` }} />
            <div className="bg-blue-300" style={{ width: `${match.drawPct}%` }} />
            <div className="bg-slate-900" style={{ width: `${match.awayPct}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 text-xs text-gray-500">
            <p>{match.home.name} {Math.round(match.homePct!)}%</p>
            <p className="text-center">Draw {Math.round(match.drawPct!)}%</p>
            <p className="text-right">{match.away.name} {Math.round(match.awayPct!)}%</p>
          </div>
        </>
      ) : (
        <EmptyReason
          className="text-sm"
          detail="No stored win-probability model for this match"
          source="predictions"
        />
      )}
      {hasPrices ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <PricePill label="Home" odd={match.homeOdd!} formatOdds={formatOdds} />
          <PricePill label="Draw" odd={match.drawOdd!} formatOdds={formatOdds} />
          <PricePill label="Away" odd={match.awayOdd!} formatOdds={formatOdds} />
        </div>
      ) : (
        <EmptyReason
          className="mt-4"
          detail="No Bet365 1X2 price stored for this fixture"
          source="prematch_odds"
        />
      )}
      {match.underOver || match.goalsLine ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {match.underOver ? (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-[10px] tracking-wide text-gray-500 uppercase">API under/over</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{match.underOver}</p>
            </div>
          ) : null}
          {match.goalsLine ? (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-[10px] tracking-wide text-gray-500 uppercase">API goals line</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {match.goalsLine.home} – {match.goalsLine.away}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <Link href={`/fixtures/${match.id}`} className="mt-4 block rounded-full bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
        Match Hub
      </Link>
    </div>
  );
}

function SidePanel({ match }: { match: FixtureMatch | null }) {
  const { formatOdds } = useDisplayPrefs();
  if (!match) {
    return (
      <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Prices</p>
        <EmptyReason className="mt-3" detail="No match on this day" source="fixtures" />
      </aside>
    );
  }
  const hasPrices = match.homeOdd != null && match.drawOdd != null && match.awayOdd != null;
  return (
    <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Bet365 1X2</p>
      <div className="mt-1 flex items-center gap-2">
        <TeamBadge src={match.home.logo} teamId={match.home.id} teamName={match.home.name} size={24} />
        <TeamBadge src={match.away.logo} teamId={match.away.id} teamName={match.away.name} size={24} />
        <h2 className="min-w-0 text-sm font-semibold text-slate-900">
          {match.home.name} v {match.away.name}
        </h2>
      </div>
      <p className="text-xs text-gray-500">
        <KickoffText utc={match.kickoffAt} fallback={match.kickoff || "Kickoff TBC"} />
      </p>
      {hasPrices ? (
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex justify-between">
            <span>Home</span>
            <span className="font-semibold text-blue-600">{formatOdds(match.homeOdd) ?? "—"}</span>
          </li>
          <li className="flex justify-between">
            <span>Draw</span>
            <span className="font-semibold text-blue-600">{formatOdds(match.drawOdd) ?? "—"}</span>
          </li>
          <li className="flex justify-between">
            <span>Away</span>
            <span className="font-semibold text-blue-600">{formatOdds(match.awayOdd) ?? "—"}</span>
          </li>
        </ul>
      ) : (
        <EmptyReason
          className="mt-4"
          detail="No Bet365 1X2 price stored for this fixture"
          source="prematch_odds"
        />
      )}
      {match.lock ? (
        <div className="mt-4 border-t border-gray-200 pt-4 text-sm">
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Card lock</p>
          <p className="mt-2 text-slate-900">{match.lock.referee}</p>
          <p className="text-gray-500">{match.lock.cards.toFixed(2)} yellows</p>
          <p className="mt-2 text-slate-900">{match.lock.player}</p>
          <p className="text-gray-500">{match.lock.fouls.toFixed(2)} fouls committed</p>
        </div>
      ) : null}
    </aside>
  );
}

function TeamSide({ side, align }: { side: FixtureMatch["home"]; align: "left" | "right" }) {
  const end = align === "right";
  return (
    <div className={end ? "text-right" : "text-left"}>
      <div className={`flex items-center gap-2 ${end ? "flex-row-reverse" : ""}`}>
        <TeamBadge src={side.logo} teamId={side.id} teamName={side.name} size={28} />
        <p className="truncate text-sm font-semibold text-slate-900">{side.name}</p>
      </div>
      <FormDots form={side.form} align={align} />
    </div>
  );
}

function PricePill({
  label,
  odd,
  formatOdds,
}: {
  label: string;
  odd: number;
  formatOdds: (value: number | null | undefined) => string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 px-2 py-2 text-center">
      <p className="text-[10px] tracking-wide text-gray-500 uppercase">{label}</p>
      <p className="text-sm font-semibold text-blue-600">{formatOdds(odd) ?? "—"}</p>
    </div>
  );
}

function FormDots({ form, align }: { form: string | null; align: "left" | "right" }) {
  const letters = (form ?? "").toUpperCase().replace(/[^WDL]/g, "").slice(-5).split("");
  if (letters.length === 0) return null;
  return (
    <div className={`mt-1 flex gap-1 ${align === "right" ? "justify-end" : ""}`}>
      {letters.map((letter, index) => (
        <span key={`${letter}-${index}`} className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${letter === "W" ? "bg-blue-600 text-white" : letter === "L" ? "bg-slate-900 text-white" : "bg-gray-100 text-slate-900"}`}>
          {letter}
        </span>
      ))}
    </div>
  );
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

function groupByLeague(matches: FixtureMatch[]) {
  const order: string[] = [];
  const map = new Map<string, { id: string; name: string; logo: string | null; matches: FixtureMatch[] }>();
  for (const match of matches) {
    const key = String(match.leagueId);
    const existing = map.get(key);
    if (existing) existing.matches.push(match);
    else {
      order.push(key);
      map.set(key, { id: key, name: match.league, logo: match.leagueLogo, matches: [match] });
    }
  }
  return order.map((id) => map.get(id)!);
}
