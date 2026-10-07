import "server-only";

import { loadComparison } from "@/app/rates";
import {
  betIdFromPrematchPayload,
  prematchBets,
  type PrematchBetId,
} from "@/utils/api-football/bet-catalogs";
import { BOOK_IDS, betsFromOddsData, latestOddsSnapshots, pickBookmaker, type StoredOddsRow } from "@/utils/odds-api-io/stored";
import { isMissingRelation } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

import { loadMatchups, type Matchup } from "./matchup";
import { loadRefereeCards } from "./referee";

const NATIONS_LEAGUE_ID = 5;

const MARKETS = {
  [prematchBets.anytimeGoalScorer]: "score",
  [prematchBets.homePlayerShots]: "shots",
  [prematchBets.awayPlayerShots]: "shots",
  [prematchBets.awayPlayerShotsTotal]: "shots",
  [prematchBets.homePlayerShotsOnTarget]: "shotsOn",
  [prematchBets.awayPlayerShotsOnTarget]: "shotsOn",
  [prematchBets.playerFoulsCommitted]: "foulsCommitted",
  [prematchBets.homePlayerFoulsCommitted]: "foulsCommitted",
  [prematchBets.awayPlayerFoulsCommitted]: "foulsCommitted",
  [prematchBets.playerAssists]: "assists",
  [prematchBets.homePlayerAssists]: "assists",
  [prematchBets.awayPlayerAssists]: "assists",
  [prematchBets.homePlayerTackles]: "tackles",
  [prematchBets.awayPlayerTackles]: "tackles",
} as const;

type Market = (typeof MARKETS)[keyof typeof MARKETS];

export type TodayFixture = {
  id: number;
  kickoff: string;
  time: string;
  status: string | null;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  leagueId: number;
  season: number;
};

export type HeadToHeadRow = {
  label: string;
  home: string;
  away: string;
};

export type RankedProp = {
  playerId: number;
  player: string;
  fixtureId: number;
  match: string;
  time: string;
  market: Market;
  label: string;
  line: number;
  odds: number;
  hits: number;
  games: number;
  hitRate: number;
  implied: number;
  edge: number;
  form: Array<boolean | null>;
  trend: number[];
  teamId: number;
  position: string | null;
  correlation: RankedProp | null;
};

export type FixtureBoard = {
  fixture: TodayFixture;
  featured: RankedProp | null;
  matchup: Matchup | null;
  props: RankedProp[];
  headToHead: HeadToHeadRow[];
  propsLocked: boolean;
  headToHeadLocked: boolean;
  refereeCards: number | null;
};

export type TodayBoard = {
  date: string;
  dateLabel: string;
  fixtures: FixtureBoard[];
  featuredFixtureId: number | null;
};

export async function loadNationsLeagueToday(): Promise<TodayBoard> {
  const date = londonDate();
  const next = londonDate(1);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, league_id, season, home_team_id, away_team_id")
    .eq("league_id", NATIONS_LEAGUE_ID)
    .gte("date", `${date}T00:00:00`)
    .lt("date", `${next}T00:00:00`)
    .order("date");
  if (error) {
    if (isMissingRelation(error)) {
      return { date, dateLabel: formatDate(date), fixtures: [], featuredFixtureId: null };
    }
    throw error;
  }

  const fixtures = await hydrateFixtures((data ?? []) as FixtureQuery[]);
  const ranked = await rankProps(fixtures);
  const headToHead = await loadHeadToHead(fixtures);
  const boards = fixtures.map((fixture) => {
    const props = ranked.filter((prop) => prop.fixtureId === fixture.id);
    return {
      fixture,
      featured: props[0] ?? null,
      matchup: null,
      props,
      headToHead: headToHead.get(fixture.id) ?? [],
      propsLocked: false,
      headToHeadLocked: false,
      refereeCards: null,
    };
  });
  const refereeCards = await loadRefereeCards(fixtures.map((fixture) => fixture.id));
  const matchups = await loadMatchups(
    boards.map((board) => ({
      id: board.fixture.id,
      homeId: board.fixture.homeId,
      awayId: board.fixture.awayId,
      featuredPlayerId: board.featured?.playerId ?? null,
    })),
  );
  return {
    date,
    dateLabel: formatDate(date),
    fixtures: boards.map((board) => ({
      ...board,
      matchup: matchups.get(board.fixture.id) ?? null,
      refereeCards: refereeCards.get(board.fixture.id) ?? null,
    })),
    featuredFixtureId: ranked[0]?.fixtureId ?? boards[0]?.fixture.id ?? null,
  };
}

async function loadHeadToHead(fixtures: TodayFixture[]) {
  const map = new Map<number, Array<{ label: string; home: string; away: string }>>();
  await Promise.all(
    fixtures.map(async (fixture) => {
      if (!fixture.homeId || !fixture.awayId) {
        map.set(fixture.id, []);
        return;
      }
      const comparison = await loadComparison(
        fixture.leagueId,
        fixture.season,
        fixture.homeId,
        fixture.awayId,
      );
      map.set(
        fixture.id,
        comparison.bars.map((bar) => ({ label: bar.label, home: bar.home, away: bar.away })),
      );
    }),
  );
  return map;
}

async function rankProps(fixtures: TodayFixture[]): Promise<RankedProp[]> {
  if (fixtures.length === 0) return [];
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const byFixture = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const squads = await loadSquads(fixtureIds);
  const prices = await loadPrices(fixtureIds);
  const selections = prices.flatMap((price) => {
    const market = MARKETS[price.betId as keyof typeof MARKETS];
    const parsed = market ? parseSelection(price.betId, price.value) : null;
    const squad = squads.get(price.fixtureId);
    const fixture = byFixture.get(price.fixtureId);
    if (!market || !parsed || !squad || !fixture || !(price.odd > 1)) return [];
    const player = matchPlayer(parsed.name, squad);
    if (!player) return [];
    return [{ ...price, market, line: parsed.line, player, fixture }];
  });

  const logs = await loadLogs([...new Set(selections.map((selection) => selection.player.id))]);
  const grouped = new Map<string, typeof selections>();
  for (const selection of selections) {
    const key = `${selection.fixtureId}:${selection.player.id}:${selection.market}`;
    const group = grouped.get(key) ?? [];
    group.push(selection);
    grouped.set(key, group);
  }

  const ranked: RankedProp[] = [];
  for (const group of grouped.values()) {
    const prop = scoreGroup(group, logs.get(group[0].player.id) ?? []);
    if (prop) ranked.push(prop);
  }
  return attachCorrelations(ranked).sort(
    (left, right) => right.edge - left.edge || right.hitRate - left.hitRate || left.player.localeCompare(right.player),
  );
}

export async function loadTopPositiveProp(fixtureId: number): Promise<RankedProp | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, league_id, season, home_team_id, away_team_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (error || !data) return null;
  const [fixture] = await hydrateFixtures([data as FixtureQuery]);
  if (!fixture) return null;
  const ranked = await rankProps([fixture]);
  return ranked.find((prop) => prop.edge > 0) ?? null;
}

function attachCorrelations(props: RankedProp[]) {
  return props.map((prop) => {
    const shot = prop.market === "shots" || prop.market === "shotsOn";
    const attacker = prop.position === "Attacker" || prop.position === "Midfielder";
    if (!shot || !attacker) return prop;
    const defenderFouls = props
      .filter(
        (other) =>
          other.fixtureId === prop.fixtureId &&
          other.market === "foulsCommitted" &&
          other.position === "Defender" &&
          other.teamId !== prop.teamId,
      )
      .sort((left, right) => right.edge - left.edge);
    const best = defenderFouls[0];
    if (!best) return prop;
    return { ...prop, correlation: { ...best, correlation: null } };
  });
}

function scoreGroup(
  group: Array<{
    market: Market;
    line: number;
    odd: number;
    player: SquadPlayer;
    fixture: TodayFixture;
    fixtureId: number;
  }>,
  games: LoggedGame[],
): RankedProp | null {
  const market = group[0].market;
  const sample = games.map((game) => game[market] ?? 0);
  if (sample.length < 2) return null;

  const chosen = chooseLine(market, sample, group);
  if (!chosen) return null;
  const hits = sample.filter((value) => value >= chosen.line).length;
  const hitRate = hits / sample.length;
  const implied = 1 / chosen.odd;
  const recent = sample.slice(0, 5).reverse().map((value) => value >= chosen.line);
  const form: Array<boolean | null> = [...Array(5 - recent.length).fill(null), ...recent];
  const trend = [...sample].reverse();
  return {
    playerId: group[0].player.id,
    player: group[0].player.name,
    fixtureId: group[0].fixtureId,
    match: `${group[0].fixture.home} v ${group[0].fixture.away}`,
    time: group[0].fixture.time,
    market,
    label: propLabel(market, chosen.line),
    line: chosen.line,
    odds: chosen.odd,
    hits,
    games: sample.length,
    hitRate,
    implied,
    edge: hitRate - implied,
    form,
    trend,
    teamId: group[0].player.teamId,
    position: group[0].player.position,
    correlation: null,
  };
}

function chooseLine(market: Market, sample: number[], group: Array<{ line: number; odd: number }>) {
  const unique = [...new Map(group.map((item) => [item.line, item])).values()];
  if (market === "score") {
    const scored = sample.reduce((sum, value) => sum + value, 0);
    return scored > 0 ? unique.find((item) => item.line === 1) ?? null : null;
  }
  const perGame = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  return unique
    .filter((item) => item.line >= 1 && item.line <= perGame + 1e-9)
    .sort((left, right) => right.line - left.line)[0] ?? null;
}

function propLabel(market: Market, line: number) {
  if (market === "score") return "to score";
  const name = {
    shots: "shots",
    shotsOn: "shots on target",
    foulsCommitted: "fouls committed",
    foulsWon: "fouls won",
    tackles: "tackles",
    assists: "assists",
  }[market];
  return `${line}+ ${name}`;
}

async function loadSquads(fixtureIds: number[]) {
  const supabase = createAdminClient();
  const { data: fixtureTeams, error: teamError } = await supabase
    .from("fixtures")
    .select("id, home_team_id, away_team_id")
    .in("id", fixtureIds);
  if (teamError) throw teamError;
  const teamIds = [...new Set((fixtureTeams ?? []).flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id !== null))];
  const { data, error } = await supabase
    .from("team_squads")
    .select("team_id, position, player_id, player_name")
    .in("team_id", teamIds)
    .limit(1000);
  if (error) {
    if (isMissingRelation(error)) return new Map();
    throw error;
  }

  const byTeam = new Map<number, SquadPlayer[]>();
  for (const row of data ?? []) {
    const name = row.player_name;
    if (!name) continue;
    const list = byTeam.get(row.team_id) ?? [];
    list.push({ id: Number(row.player_id), name, teamId: row.team_id, position: row.position });
    byTeam.set(row.team_id, list);
  }
  const byFixture = new Map<number, SquadPlayer[]>();
  for (const row of fixtureTeams ?? []) {
    byFixture.set(row.id, [...(byTeam.get(row.home_team_id ?? -1) ?? []), ...(byTeam.get(row.away_team_id ?? -1) ?? [])]);
  }
  return byFixture;
}

async function loadPrices(fixtureIds: number[]) {
  if (fixtureIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prematch_odds")
    .select("fixture_id, bookmaker_id, odds_data, updated_at")
    .in("fixture_id", fixtureIds)
    .in("bookmaker_id", [...BOOK_IDS])
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const rows: PriceRow[] = [];
  const wanted = new Set(
    [
      prematchBets.anytimeGoalScorer,
      prematchBets.homePlayerShots,
      prematchBets.awayPlayerShots,
      prematchBets.awayPlayerShotsTotal,
      prematchBets.homePlayerShotsOnTarget,
      prematchBets.awayPlayerShotsOnTarget,
      prematchBets.playerFoulsCommitted,
      prematchBets.homePlayerFoulsCommitted,
      prematchBets.awayPlayerFoulsCommitted,
      prematchBets.playerAssists,
      prematchBets.homePlayerAssists,
      prematchBets.awayPlayerAssists,
      prematchBets.homePlayerTackles,
      prematchBets.awayPlayerTackles,
    ].map((id) => betIdFromPrematchPayload(id)),
  );
  for (const row of pickBookmaker(latestOddsSnapshots((data ?? []) as StoredOddsRow[])).values()) {
    const bets = betsFromOddsData(row.odds_data);
    if (!bets) continue;
    for (const [rawBetId, bet] of bets) {
      const betId = betIdFromPrematchPayload(Number(rawBetId));
      if (!wanted.has(betId)) continue;
      for (const value of bet.values ?? []) {
        const odd = Number(value.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        rows.push({
          fixtureId: row.fixture_id,
          betId,
          value: String(value.value ?? ""),
          odd,
        });
      }
    }
  }
  return rows;
}

async function loadLogs(_playerIds: number[]) {
  // Per-game logs need fixture_player_statistics (currently empty on PYTH).
  // Callers fall back to season averages from player_season_stats.
  return new Map<number, LoggedGame[]>();
}

function parseSelection(betId: PrematchBetId, value: string) {
  if (betId === prematchBets.anytimeGoalScorer) return { name: value.trim(), line: 1 };
  const match = value.trim().match(/^(.*)\s-\s(\d+)$/);
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return null;
  return { name: match[1].trim(), line };
}

function matchPlayer(bookName: string, squad: SquadPlayer[]) {
  const target = fold(bookName);
  const exact = squad.filter((player) => fold(player.name) === target);
  if (exact.length === 1) return exact[0];
  const tokens = target.split(" ").filter(Boolean);
  const contained = squad.filter((player) => {
    const nameTokens = new Set(fold(player.name).split(" "));
    return tokens.every((token) => nameTokens.has(token));
  });
  return contained.length === 1 ? contained[0] : null;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function hydrateFixtures(rows: FixtureQuery[]): Promise<TodayFixture[]> {
  if (rows.length === 0) return [];
  const supabase = createAdminClient();
  const teamIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null))];
  const { data: clubs, error } = teamIds.length === 0
    ? { data: [], error: null }
    : await supabase.from("teams").select("id, name").in("id", teamIds);
  if (error) throw error;
  const byId = new Map((clubs ?? []).map((club) => [club.id, club.name as string]));
  return rows.map((row) => {
    const kickoff = String(row.date ?? "");
    return {
      id: row.id,
      kickoff,
      time: kickoff.match(/(\d{2}:\d{2})/)?.[1] ?? "",
      status: row.status_short,
      home: byId.get(row.home_team_id ?? 0) ?? "Home",
      away: byId.get(row.away_team_id ?? 0) ?? "Away",
      homeId: row.home_team_id ?? 0,
      awayId: row.away_team_id ?? 0,
      leagueId: row.league_id,
      season: row.season,
    };
  });
}

function londonDate(offsetDays = 0) {
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

type SquadPlayer = { id: number; name: string; teamId: number; position: string | null };
type PriceRow = { fixtureId: number; betId: PrematchBetId; value: string; odd: number };
type LoggedGame = {
  kickoff: string;
  score: number;
  shots: number | null;
  shotsOn: number | null;
  foulsCommitted: number | null;
  foulsWon: number | null;
  tackles: number | null;
  assists: number | null;
};
type FixtureQuery = {
  id: number;
  date: string | null;
  status_short: string | null;
  league_id: number;
  season: number;
  home_team_id: number | null;
  away_team_id: number | null;
};
