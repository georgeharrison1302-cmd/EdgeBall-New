import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { BOOK_IDS, latestOddsSnapshots, matchWinnerOdds, pickBookmaker } from "@/utils/odds-api-io/stored";
import { createAdminClient } from "@/utils/supabase/admin";

import { loadComparison, type Comparison } from "../rates";

const CLOSED = new Set(["FT", "AET", "PEN", "CANC", "PST", "ABD", "AWD", "WO"]);

export type HomeFixture = {
  id: number;
  kickoff: string;
  status: string | null;
  league: string;
  leagueId: number;
  season: number;
  round: string | null;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  homeLogo: string | null;
  awayLogo: string | null;
  score: string | null;
  homeOdd: number | null;
  drawOdd: number | null;
  awayOdd: number | null;
};

export type HomeBoard = {
  dayLabel: "Today" | "Tomorrow";
  dateLabel: string;
  note: string;
  fixtures: HomeFixture[];
  featured: HomeFixture | null;
  comparison: Comparison | null;
};

export async function loadHome(): Promise<HomeBoard> {
  const today = londonDate(0);
  const tomorrow = londonDate(1);
  const dayAfter = londonDate(2);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select(
      "id, date, status_short, league_id, season, home_goals, away_goals, league:leagues!league_id(name), home:teams!home_team_id(id, name, logo), away:teams!away_team_id(id, name, logo)",
    )
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .gte("date", `${today}T00:00:00`)
    .lt("date", `${dayAfter}T00:00:00`)
    .order("date");
  if (error) throw error;

  const fixtures = ((data ?? []) as FixtureQuery[]).map(toFixture);
  const todayFixtures = fixtures.filter((fixture) => fixture.kickoff.startsWith(today));
  const tomorrowFixtures = fixtures.filter((fixture) => fixture.kickoff.startsWith(tomorrow));
  const useTomorrow = todayFixtures.length === 0 || todayFixtures.every((fixture) => CLOSED.has(fixture.status ?? ""));
  const dayFixtures = (useTomorrow ? tomorrowFixtures : todayFixtures).sort((left, right) =>
    left.kickoff.localeCompare(right.kickoff),
  );
  const prices = await loadPrices(dayFixtures.map((fixture) => fixture.id));
  const withPrices = dayFixtures.map((fixture) => ({
    ...fixture,
    homeOdd: price(prices, fixture.id, "Home"),
    drawOdd: price(prices, fixture.id, "Draw"),
    awayOdd: price(prices, fixture.id, "Away"),
  }));
  const open = withPrices.filter((fixture) => !CLOSED.has(fixture.status ?? ""));
  const featured = [...(open.length > 0 ? open : withPrices)].sort(
    (left, right) => popularity(left) - popularity(right) || favouriteOdd(left) - favouriteOdd(right),
  )[0] ?? null;
  const comparison = featured
    ? await loadComparison(featured.leagueId, featured.season, featured.homeId, featured.awayId)
    : null;

  return {
    dayLabel: useTomorrow ? "Tomorrow" : "Today",
    dateLabel: formatDate(useTomorrow ? tomorrow : today),
    note: useTomorrow ? "Today has no matches still to play, so this is tomorrow." : "Matches still to play are listed with the ones already finished.",
    fixtures: withPrices,
    featured,
    comparison,
  };
}

function toFixture(row: FixtureQuery): HomeFixture {
  const home = one(row.home);
  const away = one(row.away);
  const league = one(row.league);
  return {
    id: row.id,
    kickoff: String(row.date ?? ""),
    status: row.status_short,
    league: league?.name ?? "Competition",
    leagueId: row.league_id,
    season: row.season,
    round: null,
    home: home?.name ?? "Home",
    away: away?.name ?? "Away",
    homeId: home?.id ?? 0,
    awayId: away?.id ?? 0,
    homeLogo: home?.logo ?? null,
    awayLogo: away?.logo ?? null,
    score:
      row.home_goals === null || row.away_goals === null
        ? null
        : `${row.home_goals}–${row.away_goals}`,
    homeOdd: null,
    drawOdd: null,
    awayOdd: null,
  };
}

async function loadPrices(fixtureIds: number[]) {
  if (fixtureIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prematch_odds")
    .select("fixture_id, bookmaker_id, odds_data, updated_at")
    .in("bookmaker_id", [...BOOK_IDS])
    .in("fixture_id", fixtureIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const chosen = pickBookmaker(latestOddsSnapshots(data ?? []));
  return fixtureIds.flatMap((fixtureId) => {
    const winner = matchWinnerOdds(chosen.get(fixtureId)?.odds_data);
    return [
      { fixtureId, value: "Home", odd: winner.home },
      { fixtureId, value: "Draw", odd: winner.draw },
      { fixtureId, value: "Away", odd: winner.away },
    ].filter((row): row is { fixtureId: number; value: string; odd: number } => row.odd != null);
  });
}

function price(prices: Array<{ fixtureId: number; value: string; odd: number }>, fixtureId: number, value: string) {
  return prices.find((item) => item.fixtureId === fixtureId && item.value === value)?.odd ?? null;
}

function popularity(fixture: HomeFixture) {
  const league = fixture.league.toLowerCase();
  const round = (fixture.round ?? "").toLowerCase();
  if (league === "premier league") return 0;
  if (league.includes("champions league")) return 1;
  if (round.includes("league a")) return 2;
  if (league.includes("europa league")) return 3;
  return 4;
}

function favouriteOdd(fixture: HomeFixture) {
  const odds = [fixture.homeOdd, fixture.awayOdd].filter((odd): odd is number => odd !== null);
  return odds.length === 0 ? 99 : Math.min(...odds);
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

function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function kickoffTime(kickoff: string) {
  const match = kickoff.match(/(\d{2}:\d{2})/);
  return match?.[1] ?? "";
}

type Name = { id?: number; name: string; logo?: string | null };
type FixtureQuery = {
  id: number;
  date: string | null;
  status_short: string | null;
  league_id: number;
  season: number;
  home_goals: number | null;
  away_goals: number | null;
  league: { name: string } | { name: string }[] | null;
  home: Name | Name[] | null;
  away: Name | Name[] | null;
};

function one<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
