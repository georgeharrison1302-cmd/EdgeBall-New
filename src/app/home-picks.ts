import "server-only";

import { PREMIER_LEAGUE_ID, TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import {
  betIdFromPrematchPayload,
  prematchBets,
  type PrematchBetId,
} from "@/utils/api-football/bet-catalogs";
import { BOOK_IDS, betsFromOddsData, latestOddsSnapshots, pickBookmaker, type StoredOddsRow } from "@/utils/odds-api-io/stored";
import { expandOddsValues } from "@/utils/odds-values";
import { loadPlayerDirectory } from "@/utils/players/directory";
import { fixtureGoals, isMissingRelation, nestNumber, predictionPercents } from "@/utils/pyth";
import { loadRefereeRates, normalizeReferee } from "@/utils/stats/referees";
import { createAdminClient } from "@/utils/supabase/admin";

const WINDOW_DAYS = 10;
const MIN_SAMPLE = 5;
const HIT_LINE = 0.55;
const CARD_LINE = 5.5;
const FOUL_LINE = 1.8;
const MIN_CARD_MATCHES = 10;
const GOAL_LINES = [1.5, 2.5, 3.5];
const TEAM_LINES = [0.5, 1.5, 2.5];
const PLAYER_MARKETS: Partial<
  Record<
    PrematchBetId,
    { label: string; stat: "shots_total" | "shots_on" | "fouls_committed" | "tackles"; side: "home" | "away" | "either" }
  >
> = {
  [prematchBets.homePlayerShots]: { label: "Shots", stat: "shots_total", side: "home" },
  [prematchBets.awayPlayerShots]: { label: "Shots", stat: "shots_total", side: "away" },
  [prematchBets.awayPlayerShotsTotal]: { label: "Shots", stat: "shots_total", side: "away" },
  [prematchBets.homePlayerShotsOnTarget]: { label: "Shots on target", stat: "shots_on", side: "home" },
  [prematchBets.awayPlayerShotsOnTarget]: { label: "Shots on target", stat: "shots_on", side: "away" },
  [prematchBets.playerFoulsCommitted]: { label: "Fouls committed", stat: "fouls_committed", side: "either" },
  [prematchBets.homePlayerFoulsCommitted]: { label: "Fouls committed", stat: "fouls_committed", side: "home" },
  [prematchBets.awayPlayerFoulsCommitted]: { label: "Fouls committed", stat: "fouls_committed", side: "away" },
  [prematchBets.homePlayerTackles]: { label: "Tackles", stat: "tackles", side: "home" },
  [prematchBets.awayPlayerTackles]: { label: "Tackles", stat: "tackles", side: "away" },
};

export type GoalPill = { label: string; rate: number | null };
export type BuilderLeg = { label: string; price: string | null; hits: number; sample: number; note: string };
export type Projection = {
  home: number | null;
  draw: number | null;
  away: number | null;
  homeOdd: string | null;
  drawOdd: string | null;
  awayOdd: string | null;
};
export type FeaturedMatch = {
  id: number;
  competition: string;
  premier: boolean;
  when: string;
  kickoffAt: string | null;
  home: { name: string; logo: string | null };
  away: { name: string; logo: string | null };
  matchPills: GoalPill[];
  homePills: GoalPill[];
  awayPills: GoalPill[];
  builder: BuilderLeg[];
  projection: Projection;
};
export type PlayerLeg = {
  id: string;
  name: string;
  photo: string | null;
  team: string;
  match: string;
  note: string;
  price: string | null;
};
export type CardPick = {
  name: string;
  photo: string | null;
  team: string;
  match: string;
  fouls: number;
  matches: number;
  referee: string;
  cards: number;
};
export type HomePicks = {
  featured: FeaturedMatch[];
  playerBuilder: PlayerLeg[];
  crossBuilder: PlayerLeg[];
  treble: BuilderLeg[];
  cardWatch: CardPick | null;
  cardDouble: { sameMatch: boolean; players: [CardPick, CardPick] } | null;
};

type FixtureRow = {
  id: number;
  season: number;
  league_id: number;
  date: string | null;
  referee: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  league: { name: string | null } | null;
  home: { name: string | null; logo: string | null } | null;
  away: { name: string | null; logo: string | null } | null;
};

export async function loadHomePicks(): Promise<HomePicks> {
  const supabase = createAdminClient();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const fixtureSelect = "id, season, league_id, date, referee, home_team_id, away_team_id";
  const [{ data: premier, error: premierError }, { data: other, error }] = await Promise.all([
    supabase.from("fixtures").select(fixtureSelect).eq("league_id", PREMIER_LEAGUE_ID).eq("status_short", "NS").gte("date", from).lt("date", to).order("date").limit(20),
    supabase.from("fixtures").select(fixtureSelect).in("league_id", TARGET_LEAGUE_IDS.filter((id) => id !== PREMIER_LEAGUE_ID)).eq("status_short", "NS").gte("date", from).lt("date", to).order("date").limit(80),
  ]);
  if (premierError) {
    if (isMissingRelation(premierError)) return emptyPicks();
    throw premierError;
  }
  if (error) {
    if (isMissingRelation(error)) return emptyPicks();
    throw error;
  }
  const raw = [...new Map([...((premier ?? []) as Omit<FixtureRow, "league" | "home" | "away">[]), ...((other ?? []) as Omit<FixtureRow, "league" | "home" | "away">[])].map((fixture) => [fixture.id, fixture])).values()];
  const ids = raw.map((fixture) => fixture.id);
  if (ids.length === 0) return emptyPicks();

  const teamIdsAll = [...new Set(raw.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter((id): id is number => id != null))];
  const leagueIdsAll = [...new Set(raw.map((fixture) => fixture.league_id))];
  const [{ data: clubs }, { data: competitions }, { data: priced, error: oddsError }] = await Promise.all([
    teamIdsAll.length === 0 ? Promise.resolve({ data: [] }) : supabase.from("teams").select("id, name, logo").in("id", teamIdsAll),
    leagueIdsAll.length === 0 ? Promise.resolve({ data: [] }) : supabase.from("leagues").select("id, name").in("id", leagueIdsAll),
    supabase.from("prematch_odds").select("fixture_id").in("bookmaker_id", [...BOOK_IDS]).in("fixture_id", ids).limit(1000),
  ]);
  if (oddsError) {
    if (isMissingRelation(oddsError)) return emptyPicks();
    throw oddsError;
  }
  const clubById = new Map((clubs ?? []).map((club) => [club.id, club]));
  const leagueById = new Map((competitions ?? []).map((row) => [row.id, row]));
  const fixtures: FixtureRow[] = raw.map((fixture) => ({
    ...fixture,
    league: { name: leagueById.get(fixture.league_id)?.name ?? null },
    home: clubById.get(fixture.home_team_id ?? 0) ? { name: clubById.get(fixture.home_team_id ?? 0)?.name ?? null, logo: clubById.get(fixture.home_team_id ?? 0)?.logo ?? null } : null,
    away: clubById.get(fixture.away_team_id ?? 0) ? { name: clubById.get(fixture.away_team_id ?? 0)?.name ?? null, logo: clubById.get(fixture.away_team_id ?? 0)?.logo ?? null } : null,
  }));
  const withPrice = new Set((priced ?? []).map((row) => row.fixture_id));
  const featuredFixtures = fixtures
    .filter((fixture) => withPrice.has(fixture.id) && fixture.home_team_id != null && fixture.away_team_id != null)
    .sort((left, right) => Number(right.league_id === PREMIER_LEAGUE_ID) - Number(left.league_id === PREMIER_LEAGUE_ID) || (left.date ?? "").localeCompare(right.date ?? ""))
    .slice(0, 8);
  if (featuredFixtures.length === 0) return emptyPicks();

  const leagueSeasons = [...new Map(featuredFixtures.map((fixture) => [`${fixture.league_id}:${fixture.season}`, fixture])).values()];
  const teamIds = [...new Set(featuredFixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter((id): id is number => id != null))];
  const [
    { data: results, error: resultError },
    { data: markets, error: marketError },
    { data: forecasts, error: forecastError },
    { data: seasons, error: seasonError },
  ] = await Promise.all([
    supabase
      .from("fixtures")
      .select(
        "league_id, season, date, home_team_id, away_team_id, home_goals, away_goals, score",
      )
      .in(
        "league_id",
        leagueSeasons.map((fixture) => fixture.league_id),
      )
      .in("season", [...new Set(leagueSeasons.map((fixture) => fixture.season))])
      .in("status_short", ["FT", "AET", "PEN"])
      .order("date", { ascending: false })
      .limit(5000),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .in("bookmaker_id", [...BOOK_IDS])
      .in(
        "fixture_id",
        featuredFixtures.map((fixture) => fixture.id),
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("predictions")
      .select("fixture_id, percent")
      .in(
        "fixture_id",
        featuredFixtures.map((fixture) => fixture.id),
      ),
    supabase
      .from("player_season_stats")
      .select("player_id, team_id, league_id, season, appearances, stats_data")
      .in("team_id", teamIds)
      .in(
        "league_id",
        leagueSeasons.map((fixture) => fixture.league_id),
      )
      .gt("appearances", 0)
      .limit(2000),
  ]);
  if (resultError) {
    if (isMissingRelation(resultError)) return emptyPicks();
    throw resultError;
  }
  if (marketError) {
    if (isMissingRelation(marketError)) return emptyPicks();
    throw marketError;
  }
  if (forecastError) {
    if (isMissingRelation(forecastError)) return emptyPicks();
    throw forecastError;
  }
  if (seasonError) {
    if (!isMissingRelation(seasonError)) throw seasonError;
  }

  const fouls = ((seasons ?? []) as Array<{
    player_id: number;
    team_id: number;
    appearances: number | null;
    stats_data: unknown;
  }>).flatMap((row) => {
    const apps = Number(row.appearances);
    const committed = nestNumber(row.stats_data, "fouls", "committed");
    if (!Number.isFinite(apps) || apps < MIN_CARD_MATCHES || committed == null) return [];
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
  const refRates = await loadRefereeRates(
    featuredFixtures
      .map((fixture) => normalizeReferee(fixture.referee))
      .filter((name): name is string => name != null),
  );
  const referees = [...refRates.values()]
    .filter((ref) => ref.matches >= MIN_CARD_MATCHES && ref.avg >= CARD_LINE)
    .map((ref) => ({
      referee_name: ref.name,
      matches_officiated: ref.matches,
      avg_yellow_cards: ref.avg,
    }));

  const history = ((results ?? []) as Array<{
    league_id: number;
    season: number;
    date: string | null;
    home_team_id: number | null;
    away_team_id: number | null;
    home_goals: number | null;
    away_goals: number | null;
    score: unknown;
  }>).flatMap((row) => {
    if (!leagueSeasons.some((fixture) => fixture.league_id === row.league_id && fixture.season === row.season)) return [];
    if (row.home_team_id == null || row.away_team_id == null) return [];
    const goals = fixtureGoals(row);
    if (goals.home == null || goals.away == null) return [];
    return [{
      league_id: row.league_id,
      season: row.season,
      kickoff_at: row.date,
      home_team_id: row.home_team_id,
      away_team_id: row.away_team_id,
      goals_home: goals.home,
      goals_away: goals.away,
    }];
  });
  const prices = new Map<number, Map<number, ReturnType<typeof expandOddsValues>>>();
  for (const row of pickBookmaker(latestOddsSnapshots((markets ?? []) as StoredOddsRow[])).values()) {
    const bets = betsFromOddsData(row.odds_data);
    if (!bets) continue;
    const byFixture = prices.get(row.fixture_id) ?? new Map();
    for (const [betId, bet] of bets) {
      byFixture.set(
        betId,
        (bet.values ?? []).flatMap((value) => {
          const odd = Number(value.odd);
          if (!Number.isFinite(odd)) return [];
          return [{ value: String(value.value ?? ""), odd }];
        }),
      );
    }
    prices.set(row.fixture_id, byFixture);
  }
  const playerIds = [...new Set((fouls ?? []).map((row) => row.player_id))];
  const seasonPlayerIds = [...new Set((seasons ?? []).map((row) => Number(row.player_id)))];
  const seasonTeamIds = [...new Set((seasons ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const foulTeamIds = [...new Set((fouls ?? []).map((row) => Number(row.team_id)).filter((id) => Number.isFinite(id) && id > 0))];
  const directory = await loadPlayerDirectory(
    supabase,
    [...playerIds, ...seasonPlayerIds],
    { teamIds: [...seasonTeamIds, ...foulTeamIds] },
  );
  const personById = new Map(
    [...directory].map(([id, person]) => [id, { id, name: person.name, photo: person.photo }]),
  );

  const forecastById = new Map((forecasts ?? []).map((row) => [row.fixture_id, predictionPercents(row.percent)]));
  const seasonRows: SeasonRow[] = ((seasons ?? []) as Array<{
    player_id: number;
    team_id: number;
    league_id: number;
    season: number;
    appearances: number | null;
    stats_data: unknown;
  }>).map((row) => ({
    player_id: row.player_id,
    team_id: row.team_id,
    league_id: row.league_id,
    season: row.season,
    shots_total: nestNumber(row.stats_data, "shots", "total"),
    shots_on: nestNumber(row.stats_data, "shots", "on"),
    fouls_committed: nestNumber(row.stats_data, "fouls", "committed"),
    tackles: nestNumber(row.stats_data, "tackles", "total"),
    appearances: row.appearances,
    player: { name: personById.get(row.player_id)?.name ?? null, photo_url: personById.get(row.player_id)?.photo ?? null },
  }));
  const featured = featuredFixtures.map((fixture) => buildFeatured(fixture, history, prices.get(fixture.id) ?? new Map(), forecastById.get(fixture.id)));
  const playerLegs = featuredFixtures.flatMap((fixture) => playerLegsFor(fixture, seasonRows, prices.get(fixture.id) ?? new Map()));
  const byMatch = new Map<number, PlayerLeg[]>();
  for (const leg of playerLegs) {
    const list = byMatch.get(leg.fixtureId) ?? [];
    list.push(leg);
    byMatch.set(leg.fixtureId, list);
  }
  const playerBuilder = [...byMatch.values()].sort((left, right) => right.length - left.length)[0]?.slice(0, 4) ?? [];
  const seenPlayers = new Set<string>();
  const crossBuilder = featuredFixtures.flatMap((fixture) => {
    const leg = (byMatch.get(fixture.id) ?? []).find((item) => !seenPlayers.has(item.name));
    if (!leg) return [];
    seenPlayers.add(leg.name);
    return [leg];
  }).slice(0, 4);
  const cards = cardPicks(featuredFixtures, fouls, referees, personById);
  return {
    featured,
    playerBuilder: playerBuilder.map(stripFixture),
    crossBuilder: crossBuilder.map(stripFixture),
    treble: featured.flatMap((match) => match.builder.slice(0, 1).map((leg) => ({ ...leg, label: `${match.home.name} v ${match.away.name} · ${leg.label}` }))).slice(0, 3),
    cardWatch: cards[0] ?? null,
    cardDouble: cards.length >= 2 ? { sameMatch: cards[0].match === cards[1].match, players: [cards[0], cards[1]] } : null,
  };
}

function emptyPicks(): HomePicks {
  return { featured: [], playerBuilder: [], crossBuilder: [], treble: [], cardWatch: null, cardDouble: null };
}

function buildFeatured(
  fixture: FixtureRow,
  history: HistoryRow[],
  markets: Map<number, ReturnType<typeof expandOddsValues>>,
  forecast?: { home: string | null; draw: string | null; away: string | null },
): FeaturedMatch {
  const homeId = fixture.home_team_id ?? 0;
  const awayId = fixture.away_team_id ?? 0;
  const leagueGames = history.filter((row) => row.league_id === fixture.league_id && row.season === fixture.season);
  const homeGames = leagueGames.filter((row) => row.home_team_id === homeId);
  const awayGames = leagueGames.filter((row) => row.away_team_id === awayId);
  const matchPills = linePills(GOAL_LINES, (line) => rate(leagueGames, (row) => (row.goals_home ?? 0) + (row.goals_away ?? 0) >= line + 0.5), MIN_SAMPLE);
  const homePills = linePills(TEAM_LINES, (line) => rate(homeGames, (row) => (row.goals_home ?? 0) >= line + 0.5), 3);
  const awayPills = linePills(TEAM_LINES, (line) => rate(awayGames, (row) => (row.goals_away ?? 0) >= line + 0.5), 3);
  const builder = [
    goalLeg(markets.get(5) ?? [], leagueGames),
    bttsLeg(markets.get(8) ?? [], leagueGames),
    teamLeg("Home", markets.get(16) ?? [], homeGames, "goals_home"),
    teamLeg("Away", markets.get(17) ?? [], awayGames, "goals_away"),
  ].flatMap((leg) => (leg ? [leg] : []));
  return {
    id: fixture.id,
    competition: fixture.league?.name ?? "Competition",
    premier: fixture.league_id === PREMIER_LEAGUE_ID,
    when: whenLabel(fixture.date),
    home: { name: fixture.home?.name ?? "Home", logo: fixture.home?.logo ?? null },
    away: { name: fixture.away?.name ?? "Away", logo: fixture.away?.logo ?? null },
    matchPills,
    homePills,
    awayPills,
    builder: builder.slice(0, 3),
    kickoffAt: fixture.date,
    projection: {
      home: percentNumber(forecast?.home),
      draw: percentNumber(forecast?.draw),
      away: percentNumber(forecast?.away),
      homeOdd: oneX2(markets.get(1) ?? [], "home"),
      drawOdd: oneX2(markets.get(1) ?? [], "draw"),
      awayOdd: oneX2(markets.get(1) ?? [], "away"),
    },
  };
}

function oneX2(prices: ReturnType<typeof expandOddsValues>, side: "home" | "draw" | "away") {
  const price = prices.find((item) => item.value.toLowerCase() === side);
  if (!price || price.odd <= 1.35) return null;
  return price.odd.toFixed(2);
}

function percentNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function goalLeg(prices: ReturnType<typeof expandOddsValues>, games: HistoryRow[]): BuilderLeg | null {
  const choice = chooseLine(GOAL_LINES, (line) => rate(games, (row) => (row.goals_home ?? 0) + (row.goals_away ?? 0) >= line + 0.5));
  if (!choice) return null;
  const price = prices.find((item) => item.value.toLowerCase() === `over ${choice.line}` && item.odd > 1.35);
  if (!price) return null;
  return { label: `Over ${choice.line} goals`, price: price.odd.toFixed(2), hits: choice.hits, sample: choice.sample, note: `Last ${choice.sample} stored matches` };
}

function bttsLeg(prices: ReturnType<typeof expandOddsValues>, games: HistoryRow[]): BuilderLeg | null {
  const result = rate(games, (row) => (row.goals_home ?? 0) > 0 && (row.goals_away ?? 0) > 0);
  if (result.sample < MIN_SAMPLE) return null;
  const yes = result.hit >= 0.5;
  const price = prices.find((item) => item.value.toLowerCase() === (yes ? "yes" : "no") && item.odd > 1.35);
  if (!price) return null;
  const hits = yes ? result.hits : result.sample - result.hits;
  return { label: yes ? "Both teams to score" : "Both teams not to score", price: price.odd.toFixed(2), hits, sample: result.sample, note: `Last ${result.sample} stored matches` };
}

function teamLeg(side: string, prices: ReturnType<typeof expandOddsValues>, games: HistoryRow[], key: "goals_home" | "goals_away"): BuilderLeg | null {
  const choice = chooseLine(TEAM_LINES, (line) => rate(games, (row) => (row[key] ?? 0) >= line + 0.5), 3);
  if (!choice) return null;
  const price = prices.find((item) => item.value.toLowerCase() === `over ${choice.line}` && item.odd > 1.35);
  if (!price) return null;
  return { label: `${side} over ${choice.line} goals`, price: price.odd.toFixed(2), hits: choice.hits, sample: choice.sample, note: `Last ${choice.sample} ${side.toLowerCase()} matches` };
}

function chooseLine(lines: number[], measure: (line: number) => { hit: number; hits: number; sample: number }, minimum = MIN_SAMPLE) {
  const measured = lines.map((line) => ({ line, ...measure(line) })).filter((row) => row.sample >= minimum);
  const clear = measured.filter((row) => row.hit >= HIT_LINE);
  return clear.sort((left, right) => right.line - left.line)[0] ?? null;
}

function linePills(lines: number[], measure: (line: number) => { hit: number; sample: number }, minimum: number): GoalPill[] {
  return lines.flatMap((line) => {
    const over = measure(line);
    const ready = over.sample >= minimum;
    return [
      { label: `Over ${line}`, rate: ready ? Math.round(over.hit * 100) : null },
      { label: `Under ${line}`, rate: ready ? Math.round((1 - over.hit) * 100) : null },
    ];
  });
}

function rate(games: HistoryRow[], test: (row: HistoryRow) => boolean) {
  const recent = [...games].sort((left, right) => (right.kickoff_at ?? "").localeCompare(left.kickoff_at ?? "")).slice(0, 10);
  if (recent.length === 0) return { hit: 0, hits: 0, sample: 0 };
  const hits = recent.filter(test).length;
  return { hit: hits / recent.length, hits, sample: recent.length };
}

type HistoryRow = {
  league_id: number;
  season: number;
  kickoff_at: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  goals_home: number | null;
  goals_away: number | null;
};

type SeasonRow = {
  player_id: number;
  team_id: number;
  league_id: number;
  season: number;
  shots_total: number | null;
  shots_on: number | null;
  fouls_committed: number | null;
  tackles: number | null;
  appearances: number | null;
  player: { name: string | null; photo_url: string | null } | { name: string | null; photo_url: string | null }[] | null;
};

function playerLegsFor(fixture: FixtureRow, seasons: SeasonRow[], markets: Map<number, ReturnType<typeof expandOddsValues>>) {
  const squad = seasons.filter((row) => {
    const home = row.team_id === fixture.home_team_id;
    const away = row.team_id === fixture.away_team_id;
    return (home || away) && row.league_id === fixture.league_id && row.season === fixture.season;
  });
  const legs: Array<PlayerLeg & { fixtureId: number }> = [];
  for (const [marketId, meta] of Object.entries(PLAYER_MARKETS)) {
    if (!meta) continue;
    const prematchId = betIdFromPrematchPayload(Number(marketId));
    for (const price of markets.get(prematchId) ?? []) {
      if (price.odd <= 1.35) continue;
      const player = squad.find((row) => {
        const home = row.team_id === fixture.home_team_id;
        if (meta.side === "home" && !home) return false;
        if (meta.side === "away" && home) return false;
        return nameMatch(one(row.player)?.name ?? "", price.value);
      });
      if (!player) continue;
      const average = player[meta.stat];
      if (average == null || average <= 0 || (player.appearances ?? 0) < MIN_SAMPLE) continue;
      const name = one(player.player)?.name ?? price.value;
      legs.push({
        fixtureId: fixture.id,
        id: `${fixture.id}-${marketId}-${player.player_id}`,
        name,
        photo: one(player.player)?.photo_url ?? null,
        team: player.team_id === fixture.home_team_id ? fixture.home?.name ?? "Home" : fixture.away?.name ?? "Away",
        match: `${fixture.home?.name ?? "Home"} v ${fixture.away?.name ?? "Away"}`,
        note: `${meta.label} · ${average} in ${player.appearances} appearances`,
        price: price.odd.toFixed(2),
      });
    }
  }
  return legs.sort((left, right) => Number(right.note.match(/· (\d+)/)?.[1] ?? 0) - Number(left.note.match(/· (\d+)/)?.[1] ?? 0)).filter((leg, index, list) => list.findIndex((item) => item.name === leg.name) === index);
}

function cardPicks(
  fixtures: FixtureRow[],
  fouls: Array<{ player_id: number; team_id: number | null; matches_played: number | null; avg_fouls_committed: number | null }>,
  referees: Array<{ referee_name: string; matches_officiated: number; avg_yellow_cards: number | null }>,
  people: Map<number, { name: string | null; photo?: string | null; photo_url?: string | null }>,
): CardPick[] {
  const picks: Array<CardPick & { score: number }> = [];
  for (const fixture of fixtures) {
    const refereeName = normalizeReferee(fixture.referee);
    const referee = referees.find(
      (row) => row.referee_name.toLowerCase() === (refereeName ?? "").toLowerCase(),
    );
    if (!referee || Number(referee.avg_yellow_cards) < CARD_LINE) continue;
    const candidates = fouls.filter((row) => row.team_id === fixture.home_team_id || row.team_id === fixture.away_team_id);
    for (const player of candidates) {
      const person = people.get(player.player_id);
      picks.push({
        score: Number(player.avg_fouls_committed),
        name: person?.name ?? `Player ${player.player_id}`,
        photo: person?.photo ?? person?.photo_url ?? null,
        team: player.team_id === fixture.home_team_id ? fixture.home?.name ?? "Home" : fixture.away?.name ?? "Away",
        match: `${fixture.home?.name ?? "Home"} v ${fixture.away?.name ?? "Away"}`,
        fouls: Number(player.avg_fouls_committed),
        matches: player.matches_played ?? MIN_CARD_MATCHES,
        referee: referee.referee_name,
        cards: Number(referee.avg_yellow_cards),
      });
    }
  }
  picks.sort((left, right) => right.score - left.score);
  const unique = picks.filter((pick, index, list) => list.findIndex((item) => item.name === pick.name) === index);
  const same = unique.filter((pick) => pick.match === unique[0]?.match);
  if (same.length >= 2) return same.slice(0, 2);
  const split = unique.filter((pick) => fixtures.some((fixture) => fixture.league_id === PREMIER_LEAGUE_ID && `${fixture.home?.name ?? "Home"} v ${fixture.away?.name ?? "Away"}` === pick.match));
  return (split.length >= 2 ? split : unique).slice(0, 2);
}

function stripFixture(leg: PlayerLeg & { fixtureId?: number }): PlayerLeg {
  const { fixtureId: _fixtureId, ...rest } = leg as PlayerLeg & { fixtureId?: number };
  return rest;
}

function nameMatch(stored: string, price: string) {
  const left = stored.toLowerCase();
  const right = price.toLowerCase();
  if (left === "" || right === "") return false;
  if (left === right || right.includes(left) || left.includes(right)) return true;
  const last = left.split(" ").filter((part) => part.length > 3).at(-1);
  return last != null && right.includes(last);
}

function whenLabel(kickoff: string | null) {
  if (!kickoff) return "";
  return `${kickoff.slice(0, 10)} ${kickoff.slice(11, 16)}`;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
