import Link from "next/link";

import { KickoffText } from "@/components/display/KickoffText";
import { OddsText } from "@/components/display/OddsText";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { BET365_BOOKMAKER_ID } from "@/utils/api-football/bet-catalogs";
import {
  latestOddsSnapshots,
  matchWinnerOdds,
  pickBookmaker,
} from "@/utils/odds-api-io/stored";
import { asNumber, asRecord, predictionPercents } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

const BOOK_IDS = [BET365_BOOKMAKER_ID] as const;
const PREMIER_LEAGUE_ID = 39;

type TableRow = {
  rank: number;
  name: string;
  logo: string | null;
  played: number | null;
  diff: number | null;
  points: number | null;
};

type Coming = {
  id: number;
  competition: string;
  home: string;
  away: string;
  kickoff: string | null;
};

type Focus = {
  id: number;
  competition: string;
  kickoff: string | null;
  home: { id: number | null; name: string; logo: string | null };
  away: { id: number | null; name: string; logo: string | null };
  homePct: number | null;
  drawPct: number | null;
  awayPct: number | null;
  homeOdd: number | null;
  drawOdd: number | null;
  awayOdd: number | null;
};

export default async function TodayDesk() {
  const [table, coming, focus] = await Promise.all([
    loadTable(PREMIER_LEAGUE_ID, 6),
    loadComing(),
    loadFocus(),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm lg:col-span-1">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Premier League table
        </p>
        {table.length === 0 ? (
          <EmptyReason className="mt-3" detail="Standings are not stored for this competition" source="standings" />
        ) : (
          <ul className="mt-3 space-y-2">
            {table.map((row) => (
              <li key={`${row.rank}-${row.name}`} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-[var(--muted)]">{row.rank}</span>
                {row.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.logo} alt="" className="h-5 w-5 object-contain" />
                ) : (
                  <span className="h-5 w-5 rounded-full bg-slate-100" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">
                  {row.name}
                </span>
                <span className="tabular-nums text-[var(--muted)]">
                  {row.played ?? "–"} · {signed(row.diff)} · {row.points ?? "–"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm lg:col-span-1">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Coming up
        </p>
        {coming.length === 0 ? (
          <EmptyReason className="mt-3" detail="No upcoming fixtures stored" source="fixtures" />
        ) : (
          <ul className="mt-3 space-y-3">
            {coming.map((match) => (
              <li key={match.id}>
                <Link href={`/fixtures/${match.id}`} className="block hover:opacity-80">
                  <p className="text-xs text-[var(--muted)]">{match.competition}</p>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {match.home} vs {match.away}
                  </p>
                  <p className="text-xs text-[var(--cobalt)]">
                    <KickoffText utc={match.kickoff} fallback="Kickoff TBC" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm lg:col-span-1">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Focus match
        </p>
        {!focus ? (
          <EmptyReason className="mt-3" detail="No focus fixture stored" source="fixtures" />
        ) : (
          <div className="mt-3 space-y-3">
            <Link href={`/fixtures/${focus.id}`} className="block hover:opacity-80">
              <p className="text-xs text-[var(--muted)]">{focus.competition}</p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {focus.home.name} vs {focus.away.name}
              </p>
              <p className="text-xs text-[var(--cobalt)]">
                <KickoffText utc={focus.kickoff} fallback="Kickoff TBC" />
              </p>
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-50 px-2 py-1 ring-1 ring-[var(--line)]">
                Home {focus.homePct == null ? "–" : `${focus.homePct}%`}
                {focus.homeOdd != null ? (
                  <>
                    {" "}
                    · <OddsText decimal={focus.homeOdd} />
                  </>
                ) : null}
              </span>
              <span className="rounded-full bg-slate-50 px-2 py-1 ring-1 ring-[var(--line)]">
                Draw {focus.drawPct == null ? "–" : `${focus.drawPct}%`}
                {focus.drawOdd != null ? (
                  <>
                    {" "}
                    · <OddsText decimal={focus.drawOdd} />
                  </>
                ) : null}
              </span>
              <span className="rounded-full bg-slate-50 px-2 py-1 ring-1 ring-[var(--line)]">
                Away {focus.awayPct == null ? "–" : `${focus.awayPct}%`}
                {focus.awayOdd != null ? (
                  <>
                    {" "}
                    · <OddsText decimal={focus.awayOdd} />
                  </>
                ) : null}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function signed(value: number | null) {
  if (value == null) return "–";
  return value > 0 ? `+${value}` : String(value);
}

async function loadTable(leagueId: number, limit: number): Promise<TableRow[]> {
  const season = await currentSeason(leagueId);
  if (season == null) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("standings")
    .select("rank, goals_diff, points, group_name, all_stats, team_id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .order("rank");
  if (error) throw error;
  const rows = data ?? [];
  const teamIds = [...new Set(rows.map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const { data: clubs } = teamIds.length
    ? await supabase.from("teams").select("id, name, logo").in("id", teamIds)
    : { data: [] as Array<{ id: number; name: string; logo: string | null }> };
  const teamById = new Map((clubs ?? []).map((club) => [club.id, club]));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.group_name ?? "";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const main = [...groups.values()].sort((left, right) => right.length - left.length)[0] ?? [];
  return main.slice(0, limit).map((row) => {
    const team = teamById.get(Number(row.team_id));
    const stats = asRecord(row.all_stats);
    return {
      rank: row.rank ?? 0,
      name: team?.name ?? "Club",
      logo: team?.logo ?? null,
      played: asNumber(stats?.played ?? stats?.games),
      diff: row.goals_diff,
      points: row.points,
    };
  });
}

async function currentSeason(leagueId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("league_seasons")
    .select("year")
    .eq("league_id", leagueId)
    .eq("current", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.year ?? null;
}

async function loadComing(): Promise<Coming[]> {
  const fixtures = await upcomingFixtures(4);
  return fixtures.map((fixture) => ({
    id: fixture.id,
    competition: one(fixture.league)?.name ?? "Competition",
    home: one(fixture.home)?.name ?? "Home",
    away: one(fixture.away)?.name ?? "Away",
    kickoff: fixture.date,
  }));
}

async function loadFocus(): Promise<Focus | null> {
  const fixtures = await upcomingFixtures(1);
  const fixture = fixtures[0];
  if (!fixture) return null;
  const supabase = createAdminClient();
  const [{ data: prediction }, { data: oddsRows }] = await Promise.all([
    supabase.from("predictions").select("percent").eq("fixture_id", fixture.id).maybeSingle(),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .eq("fixture_id", fixture.id)
      .in("bookmaker_id", [...BOOK_IDS])
      .order("updated_at", { ascending: false }),
  ]);
  const winner = matchWinnerOdds(
    pickBookmaker(latestOddsSnapshots(oddsRows ?? [])).get(fixture.id)?.odds_data,
  );
  const percents = predictionPercents(prediction?.percent);
  return {
    id: fixture.id,
    competition: one(fixture.league)?.name ?? "Competition",
    kickoff: fixture.date,
    home: {
      id: fixture.home_team_id,
      name: one(fixture.home)?.name ?? "Home",
      logo: one(fixture.home)?.logo ?? null,
    },
    away: {
      id: fixture.away_team_id,
      name: one(fixture.away)?.name ?? "Away",
      logo: one(fixture.away)?.logo ?? null,
    },
    homePct: percent(percents.home),
    drawPct: percent(percents.draw),
    awayPct: percent(percents.away),
    homeOdd: winner.home,
    drawOdd: winner.draw,
    awayOdd: winner.away,
  };
}

async function upcomingFixtures(limit: number) {
  const supabase = createAdminClient();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("fixtures")
    .select(
      "id, date, referee, home_team_id, away_team_id, league:leagues!league_id(name), home:teams!home_team_id(name, logo), away:teams!away_team_id(name, logo)",
    )
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .gte("date", from)
    .lt("date", to)
    .order("date")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

function percent(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
