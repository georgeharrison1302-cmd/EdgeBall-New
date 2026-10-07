import "server-only";

import Link from "next/link";
import { connection } from "next/server";

import type { ReactNode } from "react";

import { KickoffText } from "@/components/display/KickoffText";
import { OddsText } from "@/components/display/OddsText";
import StatBoard, { type RankItem } from "@/components/stat-board";
import { loadPlayerSeasonStats } from "@/app/competitions/data";
import { loadHomePicks } from "./home-picks";
import HomeDashboard from "./home-rail";
import { PREMIER_LEAGUE_ID, TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { getActiveSeasonYear } from "@/utils/api-football/season";
import { BOOK_IDS, betsFromOddsData, flattenBetPrices, latestOddsSnapshots, type StoredOddsRow } from "@/utils/odds-api-io/stored";
import { loadPlayerDirectory, playerLabel, playerPhoto } from "@/utils/players/directory";
import { isMissingRelation, nestNumber, standingSide } from "@/utils/pyth";
import { loadRefereeRates, normalizeReferee } from "@/utils/stats/referees";
import { createAdminClient } from "@/utils/supabase/admin";

const MIN_MATCHES = 10;
const CARD_LINE = 5.5;
const FOUL_LINE = 1.8;

type Side = { id: number | null; name: string; logo: string | null; form: string | null };
type Price = { label: string; odd: number };
type LockPlayer = { id: number; name: string; photo: string | null; team: string; fouls: number; matches: number };
type Lock = {
  id: number;
  leagueId: number;
  competition: string;
  kickoff: string | null;
  referee: string;
  cards: number;
  home: Side;
  away: Side;
  player: LockPlayer;
  prices: Price[];
};
type WindowStats = { fixtures: number; locks: number; referees: number };

export default async function HomeBoard() {
  await connection();
  const season = await getActiveSeasonYear(PREMIER_LEAGUE_ID);
  const [picks, locks, goals, assists, shots, teamGoals, teamDiff, sheets, streaks] = await Promise.all([
    orEmpty(loadHomePicks(), emptyPicks()),
    orEmpty(loadLocks(), []),
    season == null ? Promise.resolve([]) : orEmpty(topPlayers(season, "goals"), []),
    season == null ? Promise.resolve([]) : orEmpty(topPlayers(season, "assists"), []),
    season == null ? Promise.resolve([]) : orEmpty(topPlayers(season, "shots"), []),
    season == null ? Promise.resolve([]) : orEmpty(topTeams(season, "goals_for"), []),
    season == null ? Promise.resolve([]) : orEmpty(topTeams(season, "goals_diff"), []),
    season == null ? Promise.resolve(emptySheets) : orEmpty(sheetBoards(season), emptySheets),
    season == null ? Promise.resolve([]) : orEmpty(winStreaks(season), []),
  ]);
  const lock = locks[0] ?? null;
  const seasonLabel = season == null ? "Premier League" : `Premier League · ${season}`;

  return (
    <>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Football stats for every fixture</h1>
          <p className="mt-2 max-w-2xl text-gray-500">Kickoffs, stored Bet365 prices, and card edges. No profit line is shown.</p>
        </div>

        <HomeDashboard picks={picks} conviction={lock} />

        <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatBoard
            title="Player stats"
            subtitle={`${seasonLabel} · season totals`}
            href="/competitions/39"
            tabs={[
              { id: "goals", label: "Goals", rows: goals },
              { id: "assists", label: "Assists", rows: assists },
              { id: "shots", label: "Shots", rows: shots },
            ]}
          />
          <StatBoard
            title="Team stats"
            subtitle={`${seasonLabel} · league table`}
            href="/competitions/39"
            tabs={[
              { id: "goals", label: "Goals", rows: teamGoals },
              { id: "diff", label: "Goal diff", rows: teamDiff },
              { id: "xg", label: "xG", rows: sheets.xg },
              { id: "xc", label: "xC", rows: sheets.xc },
              { id: "home-corners", label: "Home corners", rows: sheets.homeCorners },
              { id: "away-corners", label: "Away corners", rows: sheets.awayCorners },
              { id: "corners", label: "Corners", rows: sheets.corners },
            ]}
          />
          <StatBoard title="Streaks" subtitle={`${seasonLabel} · current league wins`} href="/competitions/39" tabs={[{ id: "wins", label: "Wins", rows: streaks }]} />
        </section>
      </main>
    </>
  );
}

function LockHero({ lock }: { lock: Lock | null }) {
  if (!lock) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">High conviction lock</p>
        <p className="mt-3 text-sm text-gray-500">
          No fixture in the next 48 hours clears both the referee and player lines
          (fixture_statistics / player_season_stats).
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">High conviction lock</p>
        <p className="text-sm text-gray-500">{lock.competition}</p>
      </div>
      <div className="mt-6 grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
        <SideBlock side={lock.home} align="left" />
        <div className="text-center">
          <p className="text-xs tracking-wide text-gray-500 uppercase">Kickoff</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            <KickoffText utc={lock.kickoff} fallback="Kickoff TBC" />
          </p>
        </div>
        <SideBlock side={lock.away} align="right" />
      </div>
      <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-gray-200 pt-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          <Pill label="Referee yellows" value={lock.cards.toFixed(2)} />
          <Pill label="Fouls committed" value={lock.player.fouls.toFixed(2)} />
          {lock.prices.map((price) => (
            <Pill
              key={price.label}
              label={price.label}
              value={<OddsText decimal={price.odd} prefix="" />}
            />
          ))}
        </div>
        <Link href={`/fixtures/${lock.id}`} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Match page
        </Link>
      </div>
    </section>
  );
}

function TeamSpotlight({ lock }: { lock: Lock | null }) {
  if (!lock || lock.home.id == null) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Team spotlight</p>
        <p className="mt-4 text-sm text-gray-500">
          No team to spotlight — no high-conviction fixture stored in the next 48 hours
          (fixtures).
        </p>
      </section>
    );
  }
  const href = `/competitions/${lock.leagueId}/teams/${lock.home.id}`;
  const tiles = [
    { title: "Fouls committed", copy: "Fouls a player gives away." },
    { title: "Tackles", copy: "Shown when a Bet365 price is stored." },
    { title: "Shots", copy: "Season shots from the stored log." },
    { title: "Cards", copy: "Referee yellows and player fouls." },
  ];
  return (
    <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Team spotlight</p>
        <p className="text-right text-xs text-gray-500">
          vs {lock.away.name}
          <span className="mt-0.5 block">
            <KickoffText utc={lock.kickoff} />
          </span>
        </p>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Crest src={lock.home.logo} name={lock.home.name} />
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{lock.home.name}</h2>
          <FormDots form={lock.home.form} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <Link key={tile.title} href={href} className="rounded-xl border border-gray-200 p-3 hover:border-blue-600">
            <p className="text-sm font-semibold text-slate-900">{tile.title}</p>
            <p className="mt-1 text-xs text-gray-500">{tile.copy}</p>
          </Link>
        ))}
      </div>
      <Link href={href} className="mt-4 rounded-full bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
        All {lock.home.name} stats
      </Link>
    </section>
  );
}

function BetList({ lock }: { lock: Lock | null }) {
  return (
    <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Bet builder</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">{lock ? `${lock.home.name} v ${lock.away.name}` : "No lock"}</h2>
      <p className="mt-1 text-sm text-gray-500">Stored Bet365 prices only. No hit rate is added.</p>
      {lock && lock.prices.length > 0 ? (
        <ul className="mt-4 divide-y divide-gray-100">
          {lock.prices.map((price) => (
            <li key={price.label} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-slate-900">{price.label}</span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-sm font-semibold text-blue-600">
                <OddsText decimal={price.odd} prefix="" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          No Bet365 price stored for this match (prematch_odds).
        </p>
      )}
      {lock ? (
        <Link href={`/fixtures/${lock.id}`} className="mt-auto pt-4 text-center text-sm font-semibold text-blue-600">
          Open match
        </Link>
      ) : null}
    </section>
  );
}

function FeaturedPlayer({ lock }: { lock: Lock | null }) {
  if (!lock) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Featured player</p>
        <p className="mt-4 text-sm text-gray-500">
          No player clears the foul line on a hot referee
          (player_season_stats / fixture_statistics).
        </p>
      </section>
    );
  }
  const href = `/competitions/${lock.leagueId}/players/${lock.player.id}`;
  return (
    <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Featured player</p>
      <div className="mt-4 flex items-center gap-3">
        {lock.player.photo ? (
          <img src={lock.player.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-600">{lock.player.name.slice(0, 1)}</span>
        )}
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{lock.player.name}</h2>
          <p className="text-sm text-gray-500">{lock.player.team}</p>
          <p className="text-xs font-semibold text-blue-600">
            <KickoffText utc={lock.kickoff} />
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] tracking-wide text-gray-500 uppercase">Fouls committed</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">{lock.player.fouls.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{lock.player.matches} matches</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] tracking-wide text-gray-500 uppercase">Referee yellows</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">{lock.cards.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{lock.referee}</p>
        </div>
      </div>
      <Link href={href} className="mt-4 rounded-full bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
        Player page
      </Link>
    </section>
  );
}

function EdgeList({ locks }: { locks: Lock[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Card edges</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Both lines clear</h2>
      <p className="mt-1 text-sm text-gray-500">Referee yellows and fouls committed. Not a percentage edge.</p>
      {locks.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No card edges clear both lines in the next 48 hours
          (fixture_statistics / player_season_stats).
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {locks.slice(0, 4).map((lock) => (
          <li key={lock.id}>
            <Link href={`/fixtures/${lock.id}`} className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {lock.home.name} v {lock.away.name}
                </span>
                <span className="text-xs text-gray-500">{lock.player.name}</span>
              </span>
              <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">{lock.cards.toFixed(2)} yellows</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FormPicture({ lock }: { lock: Lock | null }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Form</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Stored league form</h2>
      {lock ? (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <FormSide side={lock.home} />
          <FormSide side={lock.away} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          No lock to draw form from — no high-conviction fixture stored (fixtures).
        </p>
      )}
    </section>
  );
}

function WindowCard({ stats }: { stats: WindowStats }) {
  const tiles = [
    { label: "Fixtures", value: stats.fixtures },
    { label: "Card locks", value: stats.locks },
    { label: "Hot referees", value: stats.referees },
  ];
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">This window</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Next 48 hours</h2>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-lg font-semibold text-blue-600">{tile.value}</p>
            <p className="mt-1 text-[10px] tracking-wide text-gray-500 uppercase">{tile.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-gray-500">No settled profit line is stored, so there is no ROI figure.</p>
    </section>
  );
}

function SideBlock({ side, align }: { side: Side; align: "left" | "right" }) {
  const end = align === "right";
  return (
    <div className={`flex flex-col ${end ? "items-end text-right" : "items-start"}`}>
      <div className={`flex items-center gap-3 ${end ? "flex-row-reverse" : ""}`}>
        <Crest src={side.logo} name={side.name} />
        <p className="text-2xl font-semibold text-slate-900">{side.name}</p>
      </div>
      <FormDots form={side.form} />
    </div>
  );
}

function FormSide({ side }: { side: Side }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <Crest src={side.logo} name={side.name} />
      <p className="mt-2 text-sm font-semibold text-slate-900">{side.name}</p>
      <FormDots form={side.form} />
      {side.form == null ? (
        <p className="mt-2 text-xs text-gray-500">No form stored (standings).</p>
      ) : null}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 px-3 py-1 text-xs">
      <span className="text-gray-500">{label} </span>
      <span className="font-semibold text-blue-600">{value}</span>
    </span>
  );
}

function FormDots({ form }: { form: string | null }) {
  const letters = (form ?? "").toUpperCase().replace(/[^WDL]/g, "").slice(-5).split("");
  if (letters.length === 0) return null;
  return (
    <div className="mt-2 flex gap-1">
      {letters.map((letter, index) => (
        <span key={`${letter}-${index}`} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${dotClass(letter)}`}>
          {letter}
        </span>
      ))}
    </div>
  );
}

function dotClass(letter: string) {
  if (letter === "W") return "bg-blue-600 text-white";
  if (letter === "L") return "bg-slate-900 text-white";
  return "bg-gray-100 text-slate-900";
}

function Crest({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-600">{name.slice(0, 1)}</span>;
  }
  return <img src={src} alt="" className="h-10 w-10 object-contain" />;
}

async function loadWindow(): Promise<WindowStats> {
  const supabase = createAdminClient();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("fixtures")
    .select("id", { count: "exact", head: true })
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .gte("date", from)
    .lt("date", to);
  if (error) throw error;
  const locks = await loadLocks();
  const referees = new Set(locks.map((lock) => lock.referee)).size;
  return { fixtures: count ?? 0, locks: locks.length, referees };
}

async function loadLocks(): Promise<Lock[]> {
  const supabase = createAdminClient();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, season, league_id, date, referee, home_team_id, away_team_id")
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .gte("date", from)
    .lt("date", to)
    .order("date")
    .limit(40);
  if (error) throw error;
  const unique = [...new Map((fixtures ?? []).map((fixture) => [fixture.id, fixture])).values()];
  if (unique.length === 0) return [];

  const refNames = unique
    .map((fixture) => normalizeReferee(fixture.referee))
    .filter((name): name is string => name != null);
  const refRates = await loadRefereeRates(refNames);
  const hotRefs = [...refRates.values()].filter(
    (ref) => ref.matches >= MIN_MATCHES && ref.avg >= CARD_LINE,
  );
  if (hotRefs.length === 0) return [];
  const refereeByName = new Map(hotRefs.map((ref) => [ref.name.toLowerCase(), ref]));

  const teamIds = [
    ...new Set(
      unique
        .flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id])
        .filter((id): id is number => id != null),
    ),
  ];
  const leagueIds = [
    ...new Set(
      unique.map((fixture) => fixture.league_id).filter((id): id is number => id != null),
    ),
  ];
  const [
    { data: seasons, error: seasonError },
    { data: forms, error: formError },
    { data: odds, error: oddsError },
    { data: clubs, error: clubError },
    { data: competitions, error: leagueError },
  ] = await Promise.all([
    teamIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("player_season_stats")
          .select("player_id, team_id, appearances, stats_data")
          .in("team_id", teamIds)
          .gte("appearances", MIN_MATCHES),
    supabase.from("standings").select("league_id, team_id, form").in("team_id", teamIds),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .in(
        "fixture_id",
        unique.map((fixture) => fixture.id),
      )
      .in("bookmaker_id", [...BOOK_IDS])
      .order("updated_at", { ascending: false }),
    teamIds.length === 0
      ? { data: [], error: null }
      : supabase.from("teams").select("id, name, logo").in("id", teamIds),
    leagueIds.length === 0
      ? { data: [], error: null }
      : supabase.from("leagues").select("id, name").in("id", leagueIds),
  ]);
  if (seasonError) throw seasonError;
  if (formError) throw formError;
  if (oddsError) throw oddsError;
  if (clubError) throw clubError;
  if (leagueError) throw leagueError;

  const players = (seasons ?? []).flatMap((row) => {
    const apps = Number(row.appearances);
    const committed = nestNumber(row.stats_data, "fouls", "committed");
    if (!Number.isFinite(apps) || apps < MIN_MATCHES || committed == null) return [];
    const avg = committed / apps;
    if (avg < FOUL_LINE) return [];
    return [
      {
        player_id: Number(row.player_id),
        team_id: Number(row.team_id),
        matches_played: apps,
        avg_fouls_committed: avg,
      },
    ];
  });

  const playerIds = [...new Set(players.map((player) => player.player_id))];
  const directory = await loadPlayerDirectory(supabase, playerIds, { teamIds });
  const clubById = new Map((clubs ?? []).map((club) => [club.id, club]));
  const leagueById = new Map((competitions ?? []).map((row) => [row.id, row]));
  const oddsByFixture = new Map(
    latestOddsSnapshots((odds ?? []) as StoredOddsRow[]).map((row) => [row.fixture_id, row]),
  );
  const locks: Lock[] = [];
  for (const fixture of unique) {
    const refereeName = normalizeReferee(fixture.referee);
    const referee = refereeName ? refereeByName.get(refereeName.toLowerCase()) : undefined;
    if (!referee) continue;
    const candidates = players.filter(
      (player) =>
        player.team_id === fixture.home_team_id || player.team_id === fixture.away_team_id,
    );
    const player = candidates.sort(
      (left, right) => right.avg_fouls_committed - left.avg_fouls_committed,
    )[0];
    if (!player) continue;
    const homeClub = clubById.get(fixture.home_team_id ?? 0);
    const awayClub = clubById.get(fixture.away_team_id ?? 0);
    const homeName = homeClub?.name ?? "Home";
    const awayName = awayClub?.name ?? "Away";
    const formFor = (teamId: number | null) =>
      forms?.find((row) => row.team_id === teamId && row.league_id === fixture.league_id)?.form ??
      null;
    const prices = flattenBetPrices(oddsByFixture.get(fixture.id)?.odds_data)
      .slice(0, 6)
      .map((price) => ({ label: `${price.market} · ${price.value}`, odd: Number(price.odd) }))
      .filter((price) => Number.isFinite(price.odd));
    const winner = betsFromOddsData(oddsByFixture.get(fixture.id)?.odds_data);
    const matchWinner = winner?.get(1);
    const matchPrices = (matchWinner?.values ?? []).flatMap((value) => {
      const odd = Number(value.odd);
      if (!Number.isFinite(odd)) return [];
      return [{ label: `Match Winner · ${String(value.value ?? "")}`, odd }];
    });
    if (fixture.league_id == null) continue;
    locks.push({
      id: fixture.id,
      leagueId: fixture.league_id,
      competition: leagueById.get(fixture.league_id)?.name ?? "Competition",
      kickoff: fixture.date,
      referee: referee.name,
      cards: referee.avg,
      home: {
        id: fixture.home_team_id,
        name: homeName,
        logo: homeClub?.logo ?? null,
        form: formFor(fixture.home_team_id),
      },
      away: {
        id: fixture.away_team_id,
        name: awayName,
        logo: awayClub?.logo ?? null,
        form: formFor(fixture.away_team_id),
      },
      player: {
        id: player.player_id,
        name: playerLabel(directory, player.player_id),
        photo: playerPhoto(directory, player.player_id),
        team: player.team_id === fixture.home_team_id ? homeName : awayName,
        fouls: Number(player.avg_fouls_committed.toFixed(2)),
        matches: player.matches_played,
      },
      prices: matchPrices.length > 0 ? matchPrices : prices,
    });
    if (locks.length === 4) break;
  }
  return locks;
}

async function topPlayers(season: number, column: "goals" | "assists" | "shots"): Promise<RankItem[]> {
  const players = await loadPlayerSeasonStats(PREMIER_LEAGUE_ID, season);
  return players
    .flatMap((row) => {
      const value = row[column];
      if (value == null || value <= 0) return [];
      return [{ id: `${column}-${row.id}`, name: row.name, meta: row.team, photo: row.photo, value }];
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 7);
}

const emptySheets = { xg: [], xc: [], homeCorners: [], awayCorners: [], corners: [] };

async function orEmpty<T>(run: Promise<T>, fallback: T): Promise<T> {
  try {
    return await run;
  } catch (error) {
    if (isMissingRelation(error as { message?: string; code?: string })) return fallback;
    const blob = error instanceof Error ? `${error.message} ${error.stack ?? ""}` : JSON.stringify(error);
    if (/42703|42P01|PGRST200|PGRST204|does not exist|schema cache/i.test(blob)) return fallback;
    throw error;
  }
}

function emptyPicks() {
  return { featured: [], playerBuilder: [], crossBuilder: [], treble: [], cardWatch: null, cardDouble: null };
}

async function sheetBoards(season: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("team_match_sheet_totals")
    .select("team_id, xg_per_game, xc_per_game, home_corners_per_game, away_corners_per_game, corners_per_game")
    .eq("league_id", PREMIER_LEAGUE_ID)
    .eq("season", season);
  if (error) {
    if (isMissingRelation(error)) return emptySheets;
    throw error;
  }
  const ids = (data ?? []).flatMap((row) => (row.team_id == null ? [] : [row.team_id]));
  const { data: clubs, error: clubError } = ids.length === 0 ? { data: [], error: null } : await supabase.from("teams").select("id, name, logo").in("id", ids);
  if (clubError) throw clubError;
  const names = new Map((clubs ?? []).map((club) => [club.id, club]));
  const rows = (data ?? []).flatMap((row) => {
    if (row.team_id == null) return [];
    const club = names.get(row.team_id);
    return [{ id: row.team_id, name: club?.name ?? "Club", photo: club?.logo ?? null, xg: numberOrNull(row.xg_per_game), xc: numberOrNull(row.xc_per_game), homeCorners: numberOrNull(row.home_corners_per_game), awayCorners: numberOrNull(row.away_corners_per_game), corners: numberOrNull(row.corners_per_game) }];
  });
  const rank = (key: "xg" | "xc" | "homeCorners" | "awayCorners" | "corners", meta: string): RankItem[] =>
    rows
      .flatMap((row) => {
        const value = row[key];
        if (value == null) return [];
        return [{ id: `${key}-${row.id}`, name: row.name, meta, photo: row.photo, value }];
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 7);
  return {
    xg: rank("xg", "xG per game"),
    xc: rank("xc", "Expected conceded per game"),
    homeCorners: rank("homeCorners", "Home corners per game"),
    awayCorners: rank("awayCorners", "Away corners per game"),
    corners: rank("corners", "Corners per game"),
  };
}

function numberOrNull(value: number | null) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function topTeams(season: number, column: "goals_for" | "goals_diff"): Promise<RankItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("standings")
    .select("team_id, goals_diff, all_stats")
    .eq("league_id", PREMIER_LEAGUE_ID)
    .eq("season", season);
  if (error) throw error;
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const { data: clubs, error: clubError } = teamIds.length === 0 ? { data: [], error: null } : await supabase.from("teams").select("id, name, logo").in("id", teamIds);
  if (clubError) throw clubError;
  const names = new Map((clubs ?? []).map((club) => [club.id, club]));
  return (data ?? [])
    .map((row) => {
      const stats = standingSide(row.all_stats);
      const value = column === "goals_for" ? stats.goalsFor ?? 0 : Number(row.goals_diff ?? 0);
      const club = names.get(row.team_id);
      return {
        id: `${column}-${row.team_id}`,
        name: club?.name ?? "Club",
        meta: column === "goals_for" ? "Goals" : "Goal difference",
        photo: club?.logo ?? null,
        value,
      };
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 7);
}

async function winStreaks(season: number): Promise<RankItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("standings").select("team_id, form").eq("league_id", PREMIER_LEAGUE_ID).eq("season", season);
  if (error) throw error;
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const { data: clubs, error: clubError } = teamIds.length === 0 ? { data: [], error: null } : await supabase.from("teams").select("id, name, logo").in("id", teamIds);
  if (clubError) throw clubError;
  const names = new Map((clubs ?? []).map((club) => [club.id, club]));
  return (data ?? [])
    .map((row) => {
      const club = names.get(row.team_id);
      return {
        id: `streak-${row.team_id}`,
        name: club?.name ?? "Club",
        meta: "Current league wins",
        photo: club?.logo ?? null,
        value: winStreak(row.form),
      };
    })
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 7);
}

function winStreak(form: string | null) {
  const letters = (form ?? "").toUpperCase().replace(/[^WDL]/g, "");
  let count = 0;
  for (let index = letters.length - 1; index >= 0; index -= 1) {
    if (letters[index] !== "W") break;
    count += 1;
  }
  return count;
}

