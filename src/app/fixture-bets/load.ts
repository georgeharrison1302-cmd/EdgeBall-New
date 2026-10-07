import "server-only";

import { prematchBets } from "@/utils/api-football/bet-catalogs";
import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { BOOK_IDS, betsFromOddsData, latestOddsSnapshots, pickBookmaker, type StoredOddsRow } from "@/utils/odds-api-io/stored";
import { isMissingRelation, standingSide } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

import { atLeast, edgeRow, fromChance, type FixtureBet } from "./math";

export async function loadFixtureBets(): Promise<FixtureBet[]> {
  const today = londonDate(0);
  const dayAfter = londonDate(2);
  const supabase = createAdminClient();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, date, league_id, season, home_team_id, away_team_id")
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .eq("status_short", "NS")
    .gte("date", `${today}T00:00:00`)
    .lt("date", `${dayAfter}T00:00:00`);
  if (error) throw error;
  const rows = (fixtures ?? []) as FixtureQuery[];
  if (rows.length === 0) return [];

  const teamIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]))];
  const leagueIds = [...new Set(rows.map((row) => row.league_id))];
  const fixtureIds = rows.map((row) => row.id);
  const [{ data: standings, error: standingsError }, { data: odds, error: oddsError }, { data: clubs, error: clubError }, { data: competitions, error: leagueError }] = await Promise.all([
    supabase
      .from("standings")
      .select("league_id, season, team_id, all_stats")
      .in("league_id", leagueIds)
      .in("team_id", teamIds),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .in("bookmaker_id", [...BOOK_IDS])
      .in("fixture_id", fixtureIds)
      .order("updated_at", { ascending: false }),
    supabase.from("teams").select("id, name").in("id", teamIds),
    supabase.from("leagues").select("id, name").in("id", leagueIds),
  ]);
  if (standingsError) throw standingsError;
  if (oddsError) {
    if (!isMissingRelation(oddsError)) throw oddsError;
  }
  if (clubError) throw clubError;
  if (leagueError) throw leagueError;

  const clubById = new Map((clubs ?? []).map((club) => [club.id, club.name as string]));
  const leagueById = new Map((competitions ?? []).map((row) => [row.id, row.name as string]));
  const record = new Map<string, { played: number; goals: number }>();
  for (const row of (standings ?? []) as StandingQuery[]) {
    const stats = standingSide(row.all_stats);
    const key = `${row.league_id}:${row.season}:${row.team_id}`;
    const current = record.get(key);
    const played = stats.played ?? 0;
    const goals = stats.goalsFor ?? 0;
    if (!current || played > current.played) {
      record.set(key, { played, goals });
    }
  }

  const wanted = new Set<number>([prematchBets.goalsOverUnder, prematchBets.bothTeamsToScore, prematchBets.totalHome, prematchBets.totalAway]);
  const prices: OddsQuery[] = [];
  for (const row of pickBookmaker(latestOddsSnapshots((odds ?? []) as StoredOddsRow[])).values()) {
    const bets = betsFromOddsData(row.odds_data);
    if (!bets) continue;
    for (const [betId, bet] of bets) {
      if (!wanted.has(betId)) continue;
      for (const value of bet.values ?? []) {
        const odd = Number(value.odd);
        if (!Number.isFinite(odd) || odd < 1.15 || odd > 6) continue;
        prices.push({
          fixture_id: row.fixture_id,
          bet_id: betId,
          value: String(value.value ?? ""),
          odd,
          bet: { name: bet.name ?? "" },
        });
      }
    }
  }

  const bets: FixtureBet[] = [];
  for (const fixture of rows) {
    const home = clubById.get(fixture.home_team_id) ?? "Home";
    const away = clubById.get(fixture.away_team_id) ?? "Away";
    fixture.leagueName = leagueById.get(fixture.league_id) ?? "Competition";
    const homeRate = record.get(`${fixture.league_id}:${fixture.season}:${fixture.home_team_id}`);
    const awayRate = record.get(`${fixture.league_id}:${fixture.season}:${fixture.away_team_id}`);
    const homeLambda = rate(homeRate);
    const awayLambda = rate(awayRate);
    for (const price of prices.filter((row) => row.fixture_id === fixture.id)) {
      const built = buildBet(fixture, home, away, homeLambda, awayLambda, homeRate, awayRate, price);
      if (built) bets.push(built);
    }
  }
  return bets.sort((left, right) => right.roi - left.roi);
}

export function trackerPicks(bets: FixtureBet[]) {
  const best = new Map<number, FixtureBet>();
  for (const bet of bets) {
    const current = best.get(bet.fixtureId);
    if (!current || bet.roi > current.roi) best.set(bet.fixtureId, bet);
  }
  return [...best.values()]
    .sort((left, right) => Number(right.games > 2) - Number(left.games > 2) || right.roi - left.roi)
    .slice(0, 6);
}

export function splitBySample(bets: FixtureBet[]) {
  const byReturn = (left: FixtureBet, right: FixtureBet) => right.roi - left.roi;
  return {
    main: bets.filter((bet) => bet.games > 2).sort(byReturn).slice(0, 12),
    short: bets.filter((bet) => bet.games <= 2).sort(byReturn).slice(0, 8),
  };
}

function buildBet(
  fixture: FixtureQuery,
  home: string,
  away: string,
  homeLambda: number | null,
  awayLambda: number | null,
  homeRate: { played: number; goals: number } | undefined,
  awayRate: { played: number; goals: number } | undefined,
  price: OddsQuery,
): FixtureBet | null {
  const name = one(price.bet)?.name ?? "";
  const parsed = parseLine(price.value);
  if (!parsed) return null;
  const base = {
    fixtureId: fixture.id,
    match: `${home} v ${away}`,
    kickoff: String(fixture.date ?? "").slice(11, 16),
    competition: fixture.leagueName ?? "Competition",
    odd: Number(price.odd),
  };
  if (name === "Total - Home" && homeLambda !== null && homeRate) {
    return edgeRow({
      ...base,
      type: "Team goals",
      pick: `${home} ${parsed.label}`,
      lambda: homeLambda,
      games: homeRate.played,
      under: parsed.under,
      line: parsed.line,
    });
  }
  if (name === "Total - Away" && awayLambda !== null && awayRate) {
    return edgeRow({
      ...base,
      type: "Team goals",
      pick: `${away} ${parsed.label}`,
      lambda: awayLambda,
      games: awayRate.played,
      under: parsed.under,
      line: parsed.line,
    });
  }
  if (name === "Goals Over/Under" && homeLambda !== null && awayLambda !== null && homeRate && awayRate) {
    return edgeRow({
      ...base,
      type: "Match goals",
      pick: parsed.label,
      lambda: homeLambda + awayLambda,
      games: Math.min(homeRate.played, awayRate.played),
      under: parsed.under,
      line: parsed.line,
    });
  }
  if (name === "Both Teams Score" && homeLambda && awayLambda && homeRate && awayRate && (price.value === "Yes" || price.value === "No")) {
    const both = atLeast(homeLambda, 1) * atLeast(awayLambda, 1);
    return fromChance({
      ...base,
      type: "BTTS",
      pick: price.value,
      games: Math.min(homeRate.played, awayRate.played),
      model: price.value === "Yes" ? both : 1 - both,
    });
  }
  return null;
}

function parseLine(value: string) {
  const match = /^(Under|Over)\s+(\d+(?:\.\d+)?)/.exec(value);
  if (!match) return null;
  return { under: match[1] === "Under", line: Number(match[2]), label: `${match[1].toLowerCase()} ${match[2]}` };
}

function rate(record: { played: number; goals: number } | undefined) {
  if (!record || record.played < 2 || record.goals <= 0) return null;
  return record.goals / record.played;
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

type Name = { name: string };

type FixtureQuery = {
  id: number;
  date: string | null;
  league_id: number;
  season: number;
  home_team_id: number;
  away_team_id: number;
  leagueName?: string;
};

type StandingQuery = {
  league_id: number;
  season: number;
  team_id: number;
  all_stats: unknown;
};

type OddsQuery = {
  fixture_id: number;
  bet_id: number;
  value: string;
  odd: number;
  bet: Name | Name[] | null;
};

function one<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
