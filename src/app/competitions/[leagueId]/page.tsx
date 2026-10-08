import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadBothTeamsToScore } from "../btts";
import { featuredCompetitions, leagueTitle, listSelectableSeasons, loadLeaders, loadLeague, loadPlayerSeasonStats, loadTeamSheetTotals, parseSeason, shotsPerGoal, type LeaderRow } from "../data";
import { CornersView, GoalsView, RankingsView, StreaksView, XgView, type ClubRow } from "../league-views";
import { leagueHasMatchSheets, loadTeamMatches } from "../match-logs";
import { loadLeagueFixtures, type RoundGroup } from "../rounds";
import SeasonStats, { BttsList } from "../season-stats";
import AdvancedTable from "../advanced-table";
import { loadStandingsLenses } from "../standings-load";
import { loadPlayerStreaks, type StreakStat } from "../streaks";
import { count, SeasonLinks, Stat } from "../ui";

export const dynamic = "force-dynamic";

const VIEWS = [
  ["overview", "Overview"],
  ["table", "Table"],
  ["fixtures", "Fixtures"],
  ["stats", "Stats"],
  ["rankings", "Power rankings"],
  ["xg", "Expected goals"],
  ["btts", "BTTS"],
  ["goals", "Goals"],
  ["corners", "Corners"],
  ["streaks", "Streaks"],
] as const;

type LeagueView = (typeof VIEWS)[number][0];

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ season?: string; view?: string; split?: string; window?: string; side?: string; venue?: string; games?: string; stat?: string; line?: string }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { leagueId } = await params;
  const { season } = await searchParams;
  const id = Number(leagueId);
  const years = Number.isInteger(id) ? await listSelectableSeasons(id) : [];
  const year = parseSeason(season, years);
  if (!Number.isInteger(id)) return { title: "Competition · EdgeBall" };
  const name = await leagueTitle(id);
  return { title: name ? `${name} ${year} · EdgeBall` : "Competition · EdgeBall" };
}

export default async function LeaguePage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { season: seasonParam, view: viewParam, split: splitParam, window: windowParam, side: sideParam, venue: venueParam, games: gamesParam, stat: statParam, line: lineParam } = await searchParams;
  const id = Number(leagueId);
  if (!Number.isInteger(id)) notFound();
  const years = await listSelectableSeasons(id);
  const season = parseSeason(seasonParam, years);
  const view = parseView(viewParam);
  const [league, rounds, rail] = await Promise.all([loadLeague(id, season), loadLeagueFixtures(id, season), featuredCompetitions()]);
  const teams = [...new Map(league.groups.flatMap((group) => group.rows).map((row) => [row.teamId, row])).values()];
  const clubs: ClubRow[] = teams.map((row) => ({
    teamId: row.teamId,
    team: row.team,
    logo: row.logoUrl,
    rank: row.rank,
    form: row.form,
    played: row.played,
    points: row.points,
  }));
  const streakStat = parseStreakStat(statParam);
  const streakLine = lineParam === "2" || lineParam === "3" ? Number(lineParam) : 1;
  const [lenses, leaders, players, sheets, matches, btts, streakRows, hasSheets] = await Promise.all([
    view === "overview" || view === "table" ? loadStandingsLenses(id, season, league.groups) : Promise.resolve(new Map()),
    view === "stats" ? loadLeaders(id, season) : Promise.resolve({ scorers: [], assists: [], yellow: [], red: [] }),
    view === "stats" ? loadPlayerSeasonStats(id, season) : Promise.resolve([]),
    view === "stats" ? loadTeamSheetTotals(id, season) : Promise.resolve([]),
    view === "rankings" || view === "xg" || view === "corners" || view === "goals" ? loadTeamMatches(id, season) : Promise.resolve([]),
    view === "btts" ? loadBothTeamsToScore(id, season, teams.map((row) => ({ id: row.teamId, name: row.team, logo: row.logoUrl }))) : Promise.resolve([]),
    view === "streaks" ? loadPlayerStreaks(id, season, streakStat, streakLine) : Promise.resolve([]),
    leagueHasMatchSheets(id, season),
  ]);
  const featured = rounds.find((round) => round.current) ?? rounds.at(-1) ?? null;
  const href = (nextView: string, extra?: Record<string, string>) => leagueHref(id, season, nextView, extra);
  const visibleViews = VIEWS.filter(([item]) => {
    if (item === "rankings" || item === "xg" || item === "corners") return hasSheets;
    return true;
  });

  return (
    <div>
      <nav className="flex gap-2 overflow-x-auto text-sm">
        {rail.length === 0 ? (
          <p className="text-sm text-gray-500">No stored competitions.</p>
        ) : (
          rail.map((item) => (
            <Link
              key={item.id}
              href={`/competitions/${item.id}`}
              className={`shrink-0 rounded-full px-3 py-1 ${item.id === league.id ? "bg-blue-600 font-semibold text-white" : "border border-gray-200 bg-white text-slate-900"}`}
            >
              {item.name}
            </Link>
          ))
        )}
      </nav>
      <p className="mt-4 text-sm text-muted">
        <Link href="/competitions" className="text-cobalt">
          Competitions
        </Link>
      </p>
      <div className="mt-3 flex items-center gap-3">
        {league.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={league.logoUrl} alt="" className="h-12 w-12 object-contain" />
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{league.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            {league.flagUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={league.flagUrl} alt="" className="h-3.5 w-5 rounded-sm object-cover" />
            ) : null}
            {league.country}
          </p>
        </div>
      </div>
      <div className="mt-5">
        <SeasonLinks
          href={(year) => leagueHref(league.id, year, view)}
          season={season}
          years={years}
        />
      </div>
      <nav className="mt-4 flex gap-4 overflow-x-auto border-b border-gray-200 text-sm">
        {visibleViews.map(([item, label]) => (
          <Link
            key={item}
            href={href(item)}
            className={`shrink-0 border-b-2 pb-2 font-semibold ${item === view ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "overview" || view === "table" ? (
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
      {league.groups.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-white px-4 py-6 text-sm text-muted">
          {league.standingsAvailable
            ? `No ${season} table stored (standings).`
            : "Standings are not stored for this competition (standings)."}
        </p>
      ) : (
        <AdvancedTable
          leagueId={league.id}
          season={season}
          groups={league.groups}
          lenses={Object.fromEntries(lenses)}
        />
      )}
        </div>
        {featured ? <RoundCard round={featured} /> : null}
      </div>
      ) : null}

      {view === "rankings" ? (
        <RankingsView
          title={league.name}
          clubs={clubs}
          matches={matches}
          windowDays={windowParam === "7" || windowParam === "14" || windowParam === "30" ? Number(windowParam) : null}
          href={(window) => href("rankings", { window })}
        />
      ) : null}
      {view === "xg" ? (
        <XgView
          title={league.name}
          season={season}
          clubs={clubs}
          matches={matches}
          split={splitParam === "home" || splitParam === "away" || splitParam === "last5" ? splitParam : "overall"}
          href={(split) => href("xg", { split })}
        />
      ) : null}
      {view === "corners" ? (
        <CornersView
          title={league.name}
          season={season}
          clubs={clubs}
          matches={matches}
          rounds={rounds}
          side={sideParam === "against" || sideParam === "total" ? sideParam : "for"}
          venue={venueParam === "home" || venueParam === "away" ? venueParam : "overall"}
          games={gamesParam === "last10" || gamesParam === "last5" ? gamesParam : "season"}
          href={(key, value) => href("corners", { side: sideParam ?? "for", venue: venueParam ?? "overall", games: gamesParam ?? "season", [key]: value })}
        />
      ) : null}
      {view === "goals" ? (
        <GoalsView
          title={league.name}
          season={season}
          clubs={clubs}
          matches={matches}
          rounds={rounds}
          venue={venueParam === "home" || venueParam === "away" ? venueParam : "overall"}
          games={gamesParam === "last10" || gamesParam === "last5" ? gamesParam : "season"}
          href={(key, value) => href("goals", { venue: venueParam ?? "overall", games: gamesParam ?? "season", [key]: value })}
        />
      ) : null}
      {view === "streaks" ? (
        <StreaksView
          title={league.name}
          season={season}
          rows={streakRows}
          stat={streakStat}
          line={String(streakLine)}
          href={(key, value) => href("streaks", { stat: streakStat, line: String(streakLine), [key]: value })}
        />
      ) : null}

      {view === "stats" ? (
      <>
      <SeasonStats
        season={season}
        players={players}
        teams={teams
          .map((row) => {
            const sheet = sheets.find((item) => item.teamId === row.teamId);
            return {
              teamId: row.teamId,
              team: row.team,
              logo: row.logoUrl,
              played: row.played,
              goalsFor: row.goalsFor,
              goalsAgainst: row.goalsAgainst,
              goalsDiff: row.goalsDiff,
              xg: sheet?.xg ?? null,
              homeXg: sheet?.homeXg ?? null,
              awayXg: sheet?.awayXg ?? null,
              xc: sheet?.xc ?? null,
              homeXc: sheet?.homeXc ?? null,
              awayXc: sheet?.awayXc ?? null,
              corners: sheet?.corners ?? null,
              homeCorners: sheet?.homeCorners ?? null,
              awayCorners: sheet?.awayCorners ?? null,
            };
          })
          .sort((left, right) => (right.goalsFor ?? -1) - (left.goalsFor ?? -1) || left.team.localeCompare(right.team))}
      />

      <div className="mt-8 space-y-8">
        <LeaderList
          title="Top scorers"
          empty={`Top scorers are not stored for ${season} (player_season_stats).`}
          rows={leaders.scorers}
          leagueId={league.id}
          season={season}
          line={(row) => {
            const ratio = shotsPerGoal(row.shots, row.goals);
            return [countLabel(row.goals, "goal", "goals"), countLabel(row.assists, "assist", "assists"), ratio ? `${ratio} shots per goal` : null]
              .filter(Boolean)
              .join(" · ");
          }}
        />
        <LeaderList
          title="Top assists"
          empty={`Top assists are not stored for ${season} (player_season_stats).`}
          rows={leaders.assists}
          leagueId={league.id}
          season={season}
          line={(row) => [countLabel(row.assists, "assist", "assists"), countLabel(row.goals, "goal", "goals")].filter(Boolean).join(" · ")}
        />
        <LeaderList
          title="Yellow cards"
          empty={`Top yellow cards are not stored for ${season} (player_season_stats).`}
          rows={leaders.yellow}
          leagueId={league.id}
          season={season}
          line={(row) => [countLabel(row.yellow, "yellow card", "yellow cards"), countLabel(row.red, "red card", "red cards")].filter(Boolean).join(" · ")}
        />
        <LeaderList
          title="Red cards"
          empty={`Top red cards are not stored for ${season} (player_season_stats).`}
          rows={leaders.red}
          leagueId={league.id}
          season={season}
          line={(row) => [countLabel(row.red, "red card", "red cards"), countLabel(row.yellow, "yellow card", "yellow cards")].filter(Boolean).join(" · ")}
        />
      </div>

      <h2 className="mt-8 text-lg font-semibold">League stats</h2>
      <p className="mt-1 text-sm text-muted">
        Table totals come from the standings. Player totals come from the stored player rows for {season}.
        {league.players.rows > 0 ? ` ${league.players.rows} player rows.` : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matches" value={league.tableMatches} />
        <Stat label="Goals" value={league.tableGoals} />
        <Stat label="Player goals" value={league.players.goals} />
        <Stat label="Assists" value={league.players.assists} />
        <Stat label="Shots" value={league.players.shots} />
        <Stat label="Shots on target" value={league.players.shotsOn} />
        <Stat label="Fouls committed" value={league.players.foulsCommitted} />
        <Stat label="Fouls won" value={league.players.foulsWon} />
        <Stat label="Yellow cards" value={league.players.yellow} />
        <Stat label="Red cards" value={league.players.red} />
      </div>
      </>
      ) : null}

      {view === "btts" ? (
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Both teams to score</h2>
        <p className="text-sm text-gray-500">Counted from stored results this season. The price is Bet365 Yes on the next fixture, when that price is stored.</p>
        {btts.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No finished matches are stored for {season} (fixtures).
          </p>
        ) : (
          <BttsList rows={btts} />
        )}
      </section>
      ) : null}

      {view === "fixtures" ? (
      <>
      <h2 className="mt-6 text-lg font-semibold">Fixtures</h2>
      {rounds.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Fixtures are not stored for this season (fixtures).
        </p>
      ) : (
        rounds.map((round) => (
          <section key={round.name} className="mt-4">
            <h3 className="text-sm font-semibold text-[#334155]">
              {round.name}
              {round.current ? <span className="ml-2 text-cobalt">Current</span> : null}
            </h3>
            <ul className="mt-2 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-line bg-white">
              {round.fixtures.map((fixture) => (
                <li key={fixture.id}>
                  <Link href={`/fixtures/${fixture.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="block font-semibold">{fixture.label}</span>
                      <span className={`text-xs ${fixture.called ? "font-semibold text-amber-700" : "text-muted"}`}>
                        {fixture.kickoff}
                        {fixture.statusLabel ? ` · ${fixture.statusLabel}` : fixture.status ? ` · ${fixture.status}` : ""}
                      </span>
                    </span>
                    <b>{fixture.score ?? "v"}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      </>
      ) : null}
    </div>
  );
}

function parseView(value: string | undefined): LeagueView {
  return VIEWS.some(([id]) => id === value) ? (value as LeagueView) : "overview";
}

function parseStreakStat(value: string | undefined): StreakStat {
  if (value === "sot" || value === "fouls" || value === "tackles") return value;
  return "shots";
}

function leagueHref(id: number, season: number, view: string, extra?: Record<string, string>) {
  const params = new URLSearchParams();
  params.set("season", String(season));
  if (view !== "overview") params.set("view", view);
  for (const [key, item] of Object.entries(extra ?? {})) {
    if (item) params.set(key, item);
  }
  return `/competitions/${id}?${params.toString()}`;
}

function LeaderList({
  title,
  empty,
  rows,
  leagueId,
  season,
  line,
}: {
  title: string;
  empty: string;
  rows: LeaderRow[];
  leagueId: number;
  season: number;
  line: (row: LeaderRow) => string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map((row) => (
            <li key={row.playerId}>
              <Link
                href={`/competitions/${leagueId}/players/${row.playerId}?season=${season}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="w-6 text-sm font-semibold text-muted">{row.rank}</span>
                {row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={row.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover bg-line" />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-line" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{row.name}</span>
                  <span className="block text-xs text-muted">{row.team}</span>
                </span>
                <span className="max-w-[11rem] text-right text-xs text-[#334155]">{line(row)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function countLabel(value: number | null, singular: string, plural: string) {
  if (value === null) return null;
  return `${value} ${value === 1 ? singular : plural}`;
}

function RoundCard({ round }: { round: RoundGroup }) {
  const days = new Map<string, RoundGroup["fixtures"]>();
  for (const fixture of round.fixtures) {
    const list = days.get(fixture.day) ?? [];
    list.push(fixture);
    days.set(fixture.day, list);
  }
  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{round.name}</p>
      {[...days.entries()].map(([day, fixtures]) => (
        <div key={day} className="mt-4">
          <p className="text-sm font-semibold text-slate-900">{dayHeading(day)}</p>
          <ul className="mt-2 space-y-2">
            {fixtures.map((fixture) => (
              <li key={fixture.id}>
                <Link href={`/fixtures/${fixture.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {fixture.homeLogo ? <img loading="lazy" decoding="async" src={fixture.homeLogo} alt="" className="h-5 w-5 object-contain" /> : null}
                    <span className="truncate font-medium">{fixture.home}</span>
                  </span>
                  <span className="font-semibold text-blue-600">{fixture.score ?? fixture.time}</span>
                  <span className="flex items-center justify-end gap-2">
                    <span className="truncate text-right font-medium">{fixture.away}</span>
                    {fixture.awayLogo ? <img loading="lazy" decoding="async" src={fixture.awayLogo} alt="" className="h-5 w-5 object-contain" /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function dayHeading(day: string) {
  if (!day) return "Date not stored";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, date] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  const [dayYear, dayMonth, dayDate] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(dayYear, dayMonth - 1, dayDate)));
}
