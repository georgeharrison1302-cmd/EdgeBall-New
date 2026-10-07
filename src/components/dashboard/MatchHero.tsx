import { connection } from "next/server";

import { KickoffText } from "@/components/display/KickoffText";
import { OddsText } from "@/components/display/OddsText";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { TeamLogo } from "@/components/TeamLogo";
import { loadTopPositiveProp, type RankedProp } from "@/app/today/load";
import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { BOOK_IDS, latestOddsSnapshots, matchWinnerOdds, pickBookmaker } from "@/utils/odds-api-io/stored";
import { createClient } from "@/utils/supabase/server";

const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"]);
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

type HeroMatch = {
  id: number;
  league: string;
  leagueLogo: string | null;
  kickoff: string;
  time: string;
  status: string | null;
  minute: number | null;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  homeLogo: string | null;
  awayLogo: string | null;
  homeOdd: number | null;
  drawOdd: number | null;
  awayOdd: number | null;
};

export default async function MatchHero({ matchId, league }: { matchId: string; league?: string }) {
  await connection();
  const match = await loadHeroMatch(matchId, league);
  if (!match) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-6">
        <EmptyReason
          variant="panel"
          title="No featured match"
          detail={
            league
              ? `No upcoming fixture stored today for ${league}`
              : "No upcoming fixture stored for today's target leagues"
          }
          source="fixtures"
        />
      </section>
    );
  }
  const prop = await loadTopPositiveProp(match.id);

  return (
    <>
      <style>{`
        .text-edge-black { color: #0f172a; }
        .text-ball-blue { color: #2563eb; }
        .bg-ball-blue { background-color: #2563eb; }
        .border-ball-blue\\/30 { border-color: rgb(37 99 235 / 0.3); }
      `}</style>
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-12">
        <article className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {match.leagueLogo ? <TeamLogo src={match.leagueLogo} name={match.league} size={16} /> : null}
              <span>{match.league}</span>
              <span>{statusLabel(match)}</span>
            </p>
            <div className="mt-8 flex items-center justify-between gap-4">
              <Side name={match.home} logo={match.homeLogo} />
              <p className="text-sm font-semibold text-slate-500">
                <KickoffText utc={match.kickoff} fallback={match.time} />
              </p>
              <Side name={match.away} logo={match.awayLogo} />
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <OddPill label="Home" odd={match.homeOdd} />
            <OddPill label="Draw" odd={match.drawOdd} />
            <OddPill label="Away" odd={match.awayOdd} />
          </div>
        </article>
        <EdgeCard match={match} prop={prop} />
      </section>
    </>
  );
}

function EdgeCard({ match, prop }: { match: HeroMatch; prop: RankedProp | null }) {
  return (
    <article className="relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-ball-blue/30 bg-white p-6 shadow-sm lg:col-span-5">
      <span className="absolute top-0 left-0 h-1 w-full bg-ball-blue" />
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-ball-blue">TOP STATISTICAL EDGE</span>
          <span className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{match.league}</span>
        </div>
        {prop ? (
          <>
            <h2 className="mt-5 text-lg font-bold text-edge-black">{prop.player}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {teamName(match, prop.teamId)} · {prop.label}
            </p>
            <div className="mt-6 flex items-end justify-between gap-4">
              <p className="text-3xl font-extrabold text-ball-blue">{formatEdge(prop.edge)}</p>
              <p className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                HIT {prop.hits}/{prop.games}
              </p>
            </div>
          </>
        ) : (
          <EmptyReason
            className="mt-6"
            detail="No priced prop has a positive edge for this match"
            source="prematch_odds"
          />
        )}
      </div>
      {prop ? (
        <button type="button" className="mt-6 flex items-center justify-between rounded-xl bg-ball-blue px-4 py-3 text-center font-semibold text-white shadow-sm">
          <span>Add to Slip</span>
          <span>
            <OddsText decimal={prop.odds} prefix="@ " />
          </span>
        </button>
      ) : null}
    </article>
  );
}

function Side({ name, logo }: { name: string; logo: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <TeamLogo src={logo} name={name} size={48} />
      <p className="text-xl font-bold text-edge-black">{name}</p>
    </div>
  );
}

function OddPill({ label, odd }: { label: string; odd: number | null }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-full border border-slate-200 px-3 py-2 hover:shadow-md">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-800">
        <OddsText decimal={odd} prefix="" />
      </span>
    </div>
  );
}

function teamName(match: HeroMatch, teamId: number) {
  if (teamId === match.homeId) return match.home;
  if (teamId === match.awayId) return match.away;
  return "Team";
}

function formatEdge(edge: number) {
  const points = edge * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(1)}%`;
}

function statusLabel(match: HeroMatch) {
  if (match.status && LIVE.has(match.status)) return match.minute === null ? "Live" : `${match.minute}'`;
  if (match.status && FINISHED.has(match.status)) return "FT";
  return match.time;
}

async function loadHeroMatch(matchId: string, league?: string): Promise<HeroMatch | null> {
  const requested = Number(matchId);
  if (Number.isInteger(requested)) {
    const match = await fetchMatch(requested);
    if (match && (!league || match.league === league)) return match;
  }
  const upcomingId = await firstUpcomingId(league);
  return upcomingId === null ? null : fetchMatch(upcomingId);
}

async function fetchMatch(id: number): Promise<HeroMatch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select(
      "id, date, status_short, elapsed, home_team_id, away_team_id, league:leagues!league_id(name, logo), home:teams!home_team_id(name, logo), away:teams!away_team_id(name, logo)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as HeroQuery;
  const home = one(row.home);
  const away = one(row.away);
  if (!home?.name || !away?.name) return null;
  const prices = await loadWinnerOdds(id);
  const kickoff = String(row.date ?? "");
  return {
    id: row.id,
    league: one(row.league)?.name ?? "Competition",
    leagueLogo: one(row.league)?.logo ?? null,
    kickoff,
    time: kickoff.match(/(\d{2}:\d{2})/)?.[1] ?? "",
    status: row.status_short,
    minute: row.elapsed,
    home: home.name,
    away: away.name,
    homeId: row.home_team_id ?? 0,
    awayId: row.away_team_id ?? 0,
    homeLogo: home.logo,
    awayLogo: away.logo,
    homeOdd: prices.Home,
    drawOdd: prices.Draw,
    awayOdd: prices.Away,
  };
}

async function loadWinnerOdds(fixtureId: number) {
  const prices = { Home: null as number | null, Draw: null as number | null, Away: null as number | null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prematch_odds")
    .select("fixture_id, bookmaker_id, odds_data, updated_at")
    .eq("fixture_id", fixtureId)
    .in("bookmaker_id", [...BOOK_IDS])
    .order("updated_at", { ascending: false });
  if (error || !data) return prices;
  const chosen = pickBookmaker(latestOddsSnapshots(data)).get(fixtureId);
  const winner = matchWinnerOdds(chosen?.odds_data);
  return { Home: winner.home, Draw: winner.draw, Away: winner.away };
}

async function firstUpcomingId(league?: string) {
  const today = londonDate(0);
  const tomorrow = londonDate(1);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, league:leagues!league_id(name)")
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .gte("date", `${today}T00:00:00`)
    .lt("date", `${tomorrow}T00:00:00`)
    .order("date");
  if (error || !data || data.length === 0) return null;
  const rows = league
    ? data.filter((row) => {
        const joined = row.league as { name?: string } | { name?: string }[] | null;
        const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;
        return name === league;
      })
    : data;
  if (rows.length === 0) return null;
  const upcoming = rows.find((row) => !LIVE.has(row.status_short ?? "") && !FINISHED.has(row.status_short ?? ""));
  return (upcoming ?? rows[0]).id;
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

type Named = { name: string; logo: string | null };
type HeroQuery = {
  id: number;
  date: string | null;
  status_short: string | null;
  elapsed: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  league: { name: string; logo: string | null } | { name: string; logo: string | null }[] | null;
  home: Named | Named[] | null;
  away: Named | Named[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
