import { connection } from "next/server";
import Link from "next/link";

import { TeamLogo } from "@/components/TeamLogo";
import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import type { Database } from "@/types";
import { createClient } from "@/utils/supabase/server";

type FixtureBarProps = {
  activeMatchId?: string;
  league?: string;
};

type Phase = "live" | "upcoming" | "off" | "finished";

type MatchCard = {
  id: number;
  league: string;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  time: string;
  phase: Phase;
  status: string | null;
  minute: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  kickoff: string;
};

type FixtureQuery = Pick<
  Database["public"]["Tables"]["fixtures"]["Row"],
  "id" | "date" | "status_short" | "elapsed" | "home_goals" | "away_goals"
> & {
  league: { name: string } | { name: string }[] | null;
  home: { name: string; logo: string | null } | { name: string; logo: string | null }[] | null;
  away: { name: string; logo: string | null } | { name: string; logo: string | null }[] | null;
};

const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"]);
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const OFF: Record<string, string> = {
  PST: "Postponed",
  CANC: "Cancelled",
  SUSP: "Suspended",
  ABD: "Abandoned",
};

const cardClass =
  "min-w-[215px] max-w-[215px] p-3 rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 snap-start flex flex-col gap-3 cursor-pointer hover:shadow-md hover:border-slate-300 relative overflow-hidden";

const navClass =
  "flex gap-3 overflow-x-auto py-3.5 px-4 snap-x border-b border-slate-200 bg-slate-50 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300";

export default async function FixtureBar({ activeMatchId, league }: FixtureBarProps) {
  await connection();
  const fixtures = await loadToday();
  if (fixtures.length === 0) {
    return <p className="border-b border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">No fixtures available today.</p>;
  }

  const leagues = [...new Set(fixtures.map((match) => match.league))];
  const selectedLeague = league?.trim() || "";
  const visible = selectedLeague ? fixtures.filter((match) => match.league === selectedLeague) : fixtures;
  const selectedId = activeMatchId || (visible[0] ? String(visible[0].id) : null);

  return (
    <>
      <BrandStyles />
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 pt-3 pb-3">
        <LeaguePill label="All" href={queryHref(activeMatchId)} active={!selectedLeague} />
        {leagues.map((name) => (
          <LeaguePill
            key={name}
            label={name}
            href={queryHref(activeMatchId, name)}
            active={selectedLeague === name}
          />
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="border-b border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          No matches found for this competition today.
        </p>
      ) : (
      <nav aria-label="Today's matches" className={navClass}>
        {visible.map((match) => {
          const active = String(match.id) === selectedId;
          return (
            <Link
              key={match.id}
              href={queryHref(String(match.id), selectedLeague || undefined)}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={`${cardClass} ${active ? "border-slate-200 bg-blue-50/30 shadow-md ring-1 ring-ball-blue/40" : ""}`}
            >
              {active ? <span className="absolute inset-y-0 left-0 w-1 bg-ball-blue" /> : null}
              <span className="flex items-center">
                <span className="w-full truncate pr-14 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  {match.league}
                </span>
              </span>
              <span className="absolute top-2.5 right-2.5">
                <Status match={match} />
              </span>
              <span className="flex flex-col gap-1.5">
                <Team name={match.home} logo={match.homeLogo} score={scoreFor(match, match.homeGoals)} />
                <Team name={match.away} logo={match.awayLogo} score={scoreFor(match, match.awayGoals)} />
              </span>
            </Link>
          );
        })}
      </nav>
      )}
    </>
  );
}

function LeaguePill({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wider whitespace-nowrap uppercase transition-colors ${
        active
          ? "border-edge-black bg-edge-black text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
}

function queryHref(matchId?: string, league?: string) {
  const params = new URLSearchParams();
  if (matchId) params.set("match_id", matchId);
  if (league) params.set("league", league);
  const query = params.toString();
  return query ? `?${query}` : "?";
}

export function FixtureBarSkeleton() {
  return (
    <div aria-hidden="true" className={navClass}>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-[86px] min-w-[210px] animate-pulse rounded-xl bg-slate-200/60" />
      ))}
    </div>
  );
}

function Status({ match }: { match: MatchCard }) {
  if (match.phase === "live") {
    return (
      <span className="animate-pulse rounded bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
        {match.minute === null ? "LIVE" : `${match.minute}'`}
      </span>
    );
  }
  if (match.phase === "finished") {
    return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">FT</span>;
  }
  if (match.phase === "off") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
        {OFF[match.status ?? ""] ?? match.status}
      </span>
    );
  }
  return (
    <span className="rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm">
      {match.time}
    </span>
  );
}

function Team({ name, logo, score }: { name: string; logo: string | null; score: number | null }) {
  return (
    <span className="flex items-center gap-2">
      <TeamLogo src={logo} name={name} />
      <span className="truncate text-[13px] font-bold tracking-tight text-slate-800">{name}</span>
      {score !== null ? <span className="ml-auto text-xs font-bold text-slate-800">{score}</span> : null}
    </span>
  );
}

function scoreFor(match: MatchCard, goals: number | null) {
  if (match.phase === "upcoming" || goals === null) return null;
  return goals;
}

function BrandStyles() {
  return (
    <style>{`
      .bg-ball-blue { background-color: #2563eb; }
      .ring-ball-blue\\/40 { --tw-ring-color: rgb(37 99 235 / 0.4); }
      .bg-edge-black { background-color: #0f172a; }
      .border-edge-black { border-color: #0f172a; }
      .text-edge-black { color: #0f172a; }
    `}</style>
  );
}

async function loadToday(): Promise<MatchCard[]> {
  try {
    const today = londonDate(0);
    const tomorrow = londonDate(1);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fixtures")
      .select(
        "id, date, status_short, elapsed, home_goals, away_goals, league:leagues!league_id(name), home:teams!home_team_id(name, logo), away:teams!away_team_id(name, logo)",
      )
      .in("league_id", [...TARGET_LEAGUE_IDS])
      .gte("date", `${today}T00:00:00`)
      .lt("date", `${tomorrow}T00:00:00`)
      .order("date");
    if (error) throw error;
    return ((data ?? []) as FixtureQuery[]).flatMap(toCard).sort(byPhase);
  } catch {
    return [];
  }
}

function toCard(row: FixtureQuery): MatchCard[] {
  const home = one(row.home)?.name;
  const away = one(row.away)?.name;
  if (!home || !away) return [];
  const kickoff = String(row.date ?? "");
  return [
    {
      id: row.id,
      league: one(row.league)?.name ?? "Competition",
      home,
      away,
      homeLogo: one(row.home)?.logo ?? null,
      awayLogo: one(row.away)?.logo ?? null,
      time: kickoff.match(/(\d{2}:\d{2})/)?.[1] ?? "",
      phase: phaseOf(row.status_short),
      status: row.status_short,
      minute: row.elapsed,
      homeGoals: row.home_goals,
      awayGoals: row.away_goals,
      kickoff,
    },
  ];
}

function phaseOf(status: string | null): Phase {
  if (status && LIVE.has(status)) return "live";
  if (status && status in OFF) return "off";
  if (status && FINISHED.has(status)) return "finished";
  return "upcoming";
}

function byPhase(left: MatchCard, right: MatchCard) {
  const rank = { live: 0, upcoming: 1, off: 1, finished: 2 };
  return rank[left.phase] - rank[right.phase] || left.kickoff.localeCompare(right.kickoff);
}

function londonDate(offsetDays: number) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
