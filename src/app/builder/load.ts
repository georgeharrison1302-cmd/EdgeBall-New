import "server-only";

import type { MatchProp } from "@/components/MatchPropsBuilder";
import type { PlayerProp } from "@/components/PlayerPropsBuilder";
import type { GeneratorProp } from "@/components/AdvancedGenerator";
import {
  BET365_BOOKMAKER_ID,
  PREMATCH_PLAYER_CARD_BET_IDS,
  PREMATCH_PLAYER_PROP_BET_IDS,
  prematchBets,
} from "@/utils/api-football/bet-catalogs";
import { formHits, formMetrics, formValues, loadMatchLogsByPlayers } from "@/app/competitions/match-log";
import type { FormStatKind } from "@/app/competitions/match-log";
import { parseTeamCards } from "@/app/rates";
import {
  lastNameInitialKey,
  normalizePlayerName,
  parsePlayerPropValue,
} from "@/utils/odds/player-prop-value";
import { lastNameToken, pickUniqueNameMatch, modelOddsFromHitRate } from "@/lib/odds/matcher";
import { tryRefreshOddsForFixtures } from "@/utils/odds-api-io/refresh";
import { loadRefereeRates, lookupReferee } from "@/utils/stats/referees";
import { asNumber, nestNumber } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

const PREMATCH = new Set(["NS", "TBD"]);
const MIN_APPS = 5;

export type OddsPayload = {
  source: "prematch_odds";
  bookmakerId: number;
  updatedAt: string | null;
  prices: Array<{
    fixtureId: number;
    playerId: number;
    player: string;
    odd: number;
    updatedAt: string | null;
  }>;
};

export type BuilderBoard = {
  date: string;
  dateLabel: string;
  liveCount: number;
  matchCount: number;
  matchProps: MatchProp[];
  playerProps: PlayerProp[];
  generatorProps: GeneratorProp[];
  oddsPayload: OddsPayload;
};

const PADDY_POWER_BOOKMAKER_ID = 38;
const EMPTY_ODDS_PAYLOAD: OddsPayload = {
  source: "prematch_odds",
  bookmakerId: BET365_BOOKMAKER_ID,
  updatedAt: null,
  prices: [],
};

type FixtureRow = {
  id: number;
  date: string | null;
  status_short: string | null;
  league_id: number;
  season: number;
  referee?: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  leagueName: string;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
};

type OddsRow = {
  fixture_id: number;
  bookmaker_id: number;
  odds_data: unknown;
  updated_at?: string | null;
  model_prob?: number | null;
  edge_pct?: number | null;
};

type PropMarketBucket = "cards" | "sot" | "shots" | "fouls" | "fouls_drawn" | "tackles" | "saves" | "goals";

type BookPropQuote = {
  odd: number;
  modelProb: number | null;
  edgePct: number | null;
  playerId: number | null;
  player: string;
  market: PropMarketBucket;
  line: number | null;
  selection: string;
};

type StandingRow = {
  team_id: number;
  league_id: number;
  season: number;
  all_stats: unknown;
  home_stats: unknown;
  away_stats: unknown;
};

type BetValue = {
  value?: string | number | null;
  odd?: string | number | null;
  handicap?: string | number | null;
  player_id?: number | null;
  label?: string | null;
  model_prob?: number | null;
  edge_pct?: number | null;
};
type Bet = { id?: number | null; name?: string | null; values?: BetValue[] | null };

export async function loadBuilderBoard(): Promise<BuilderBoard> {
  const date = londonDate();
  return assembleBoard(date, await loadTodayFixtures(date));
}

export async function loadBuilderBoardForFixture(fixtureId: number): Promise<BuilderBoard> {
  const date = londonDate();
  return assembleBoard(date, await loadFixturesByIds([fixtureId]));
}

async function assembleBoard(date: string, fixtures: FixtureRow[]): Promise<BuilderBoard> {
  if (fixtures.length === 0) {
    return {
      date,
      dateLabel: formatDate(date),
      liveCount: 0,
      matchCount: 0,
      matchProps: [],
      playerProps: [],
      generatorProps: [],
      oddsPayload: EMPTY_ODDS_PAYLOAD,
    };
  }

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter((id): id is number => id != null))];
  const supabase = createIngestClient();

  // Pull live Bet365 / Paddy prices from Odds-API.io (ODDS_API_IO_KEY) before pricing.
  const refresh = await tryRefreshOddsForFixtures(fixtureIds);
  if (refresh) {
    console.info(
      `[builder] odds-api.io matched=${refresh.matched} upserted=${refresh.upserted} playerProps=${refresh.playerProps}`,
    );
  }

  const [{ data: oddsRows, error: oddsError }, { data: models, error: modelError }, { data: standingRows, error: standingError }] = await Promise.all([
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at, model_prob, edge_pct")
      .in("fixture_id", fixtureIds)
      .in("bookmaker_id", [BET365_BOOKMAKER_ID, PADDY_POWER_BOOKMAKER_ID])
      .order("updated_at", { ascending: false }),
    supabase.from("predictions").select("fixture_id, percent, under_over").in("fixture_id", fixtureIds),
    supabase.from("standings").select("team_id, league_id, season, all_stats, home_stats, away_stats").in("team_id", teamIds),
  ]);
  if (oddsError) throw oddsError;
  if (modelError) throw modelError;
  if (standingError) throw standingError;

  const oddsList = latestOddsSnapshots((oddsRows ?? []) as OddsRow[]);
  const oddsPayload = buildOddsPayload(oddsList);
  const oddsByFixture = pickBookmaker(oddsList);
  const modelByFixture = new Map((models ?? []).map((row) => [Number(row.fixture_id), row]));
  const standings = (standingRows ?? []) as StandingRow[];

  const matchProps: MatchProp[] = [];
  for (const fixture of fixtures) {
    const bets = betsFromOdds(oddsByFixture.get(fixture.id));
    if (!bets) continue;
    const match = `${fixture.homeName} vs ${fixture.awayName}`;
    const competition = fixture.leagueName;
    const overOdd = ouOdd(bets, "over");
    const underOdd = ouOdd(bets, "under");
    const rates = buildMatchModel(
      pickStanding(standings, fixture, fixture.home_team_id),
      pickStanding(standings, fixture, fixture.away_team_id),
      overOdd,
      underOdd,
      modelByFixture.get(fixture.id),
    );

    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "Home Win", "Match Winner (1X2)", oddFor(bets, prematchBets.matchWinner, ["Home", "1"]), rates.home);
    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "Draw", "Match Winner (1X2)", oddFor(bets, prematchBets.matchWinner, ["Draw", "X"]), rates.draw);
    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "Away Win", "Match Winner (1X2)", oddFor(bets, prematchBets.matchWinner, ["Away", "2"]), rates.away);
    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "BTTS - Yes", "Both Teams to Score (BTTS)", oddFor(bets, prematchBets.bothTeamsToScore, ["Yes"]), rates.bttsYes);
    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "BTTS - No", "Both Teams to Score (BTTS)", oddFor(bets, prematchBets.bothTeamsToScore, ["No"]), rates.bttsNo);
    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "Over 2.5 Goals", "Over/Under Goals", overOdd, rates.over25);
    pushMatch(matchProps, fixture.id, competition, match, fixture.homeLogo, fixture.awayLogo, "Under 2.5 Goals", "Over/Under Goals", underOdd, rates.under25);
  }

  const playerProps = await enrichPropAngles(fixtures, [
    ...(await loadPlayerProps(fixtures, teamIds)),
    ...(await loadCardProps(fixtures, teamIds, oddsList)),
  ], oddsList);
  const generatorProps = [
    ...matchProps.flatMap(toGeneratorMatch),
    ...playerProps.flatMap(toGeneratorPlayer),
  ];

  return {
    date,
    dateLabel: formatDate(date),
    liveCount: 0,
    matchCount: fixtures.length,
    matchProps,
    playerProps,
    generatorProps,
    oddsPayload,
  };
}

async function loadTodayFixtures(date: string) {
  const supabase = createIngestClient();
  const next = shiftDate(date, 1);
  const select = "id, date, status_short, league_id, season, referee, home_team_id, away_team_id";
  const { data: today, error: todayError } = await supabase
    .from("fixtures")
    .select(select)
    .gte("date", `${date}T00:00:00`)
    .lt("date", `${next}T00:00:00`)
    .in("status_short", [...PREMATCH])
    .order("date")
    .limit(200);
  if (todayError) throw todayError;
  const now = Date.now();
  const raw = ((today ?? []) as Omit<FixtureRow, "leagueName" | "homeName" | "awayName" | "homeLogo" | "awayLogo">[]).filter(
    (row) => isUpcomingKickoff(row.date, now),
  );
  if (raw.length === 0) return [];
  return hydrateFixtures(supabase, raw);
}

async function loadFixturesByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const supabase = createIngestClient();
  const select = "id, date, status_short, league_id, season, referee, home_team_id, away_team_id";
  const { data, error } = await supabase.from("fixtures").select(select).in("id", ids);
  if (error) throw error;
  return hydrateFixtures(
    supabase,
    (data ?? []) as Omit<FixtureRow, "leagueName" | "homeName" | "awayName" | "homeLogo" | "awayLogo">[],
  );
}

async function hydrateFixtures(
  supabase: ReturnType<typeof createIngestClient>,
  raw: Array<Omit<FixtureRow, "leagueName" | "homeName" | "awayName" | "homeLogo" | "awayLogo">>,
) {

  const teamIds = [...new Set(raw.flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null))];
  const leagueIds = [...new Set(raw.map((row) => row.league_id))];
  const [{ data: teams, error: teamError }, { data: leagues, error: leagueError }] = await Promise.all([
    teamIds.length === 0 ? { data: [], error: null } : supabase.from("teams").select("id, name, logo").in("id", teamIds),
    leagueIds.length === 0 ? { data: [], error: null } : supabase.from("leagues").select("id, name").in("id", leagueIds),
  ]);
  if (teamError) throw teamError;
  if (leagueError) throw leagueError;
  const teamById = new Map((teams ?? []).map((team) => [Number(team.id), team]));
  const leagueById = new Map((leagues ?? []).map((league) => [Number(league.id), league]));
  return raw.map((row) => {
    const home = row.home_team_id == null ? null : teamById.get(row.home_team_id);
    const away = row.away_team_id == null ? null : teamById.get(row.away_team_id);
    return {
      ...row,
      leagueName: leagueById.get(row.league_id)?.name ?? "Competition",
      homeName: home?.name ?? "Home",
      awayName: away?.name ?? "Away",
      homeLogo: home?.logo ?? null,
      awayLogo: away?.logo ?? null,
    };
  });
}

async function loadPlayerProps(fixtures: FixtureRow[], teamIds: number[]): Promise<PlayerProp[]> {
  if (teamIds.length === 0) return [];
  const supabase = createIngestClient();
  const { data: squads, error: squadError } = await supabase
    .from("team_squads")
    .select("team_id, player_id, player_name, photo, position")
    .in("team_id", teamIds);
  if (squadError) throw squadError;

  const squadRows = squads ?? [];
  const squadPlayerIds = [
    ...new Set(
      squadRows
        .map((row) => Number(row.player_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  type SeasonRow = {
    player_id: number;
    team_id: number;
    appearances: number | null;
    yellow_cards: number | null;
    goals: number | null;
    stats_data: unknown;
  };
  const seasonRows: SeasonRow[] = [];

  // Club fixtures: season rows keyed by the same team_id.
  {
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, team_id, appearances, yellow_cards, goals, stats_data")
      .in("team_id", teamIds)
      .gte("appearances", MIN_APPS);
    if (error) throw error;
    for (const row of data ?? []) seasonRows.push(row as SeasonRow);
  }

  // International / cross-comp: resolve club season rates by player_id from the squad.
  for (let index = 0; index < squadPlayerIds.length; index += 80) {
    const chunk = squadPlayerIds.slice(index, index + 80);
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, team_id, appearances, yellow_cards, goals, stats_data")
      .in("player_id", chunk)
      .gte("appearances", MIN_APPS);
    if (error) throw error;
    for (const row of data ?? []) seasonRows.push(row as SeasonRow);
  }

  const seasonByTeamPlayer = new Map<string, SeasonRow>();
  const bestSeasonByPlayer = new Map<number, SeasonRow>();
  for (const row of seasonRows) {
    const playerId = Number(row.player_id);
    const teamId = Number(row.team_id);
    const apps = Number(row.appearances);
    if (!Number.isFinite(apps) || apps < MIN_APPS) continue;
    seasonByTeamPlayer.set(`${teamId}:${playerId}`, row);
    const existing = bestSeasonByPlayer.get(playerId);
    if (!existing || apps > Number(existing.appearances)) {
      bestSeasonByPlayer.set(playerId, row);
    }
  }

  const fixtureByTeam = new Map<number, FixtureRow[]>();
  for (const fixture of fixtures) {
    for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
      if (teamId == null) continue;
      const list = fixtureByTeam.get(teamId) ?? [];
      list.push(fixture);
      fixtureByTeam.set(teamId, list);
    }
  }

  const props: PlayerProp[] = [];

  for (const squad of squadRows) {
    const teamId = Number(squad.team_id);
    const playerId = Number(squad.player_id);
    const name = squad.player_name ?? null;
    if (!name || !Number.isInteger(playerId) || playerId <= 0) continue;
    const matches = fixtureByTeam.get(teamId) ?? [];
    if (matches.length === 0) continue;

    const row =
      seasonByTeamPlayer.get(`${teamId}:${playerId}`) ?? bestSeasonByPlayer.get(playerId) ?? null;
    if (!row) continue;

    const appearances = Number(row.appearances);
    if (!Number.isFinite(appearances) || appearances < MIN_APPS) continue;
    const statsData = (row.stats_data ?? {}) as Record<string, unknown>;
    const shots = nested(statsData.shots);
    const fouls = nested(statsData.fouls);
    const tackles = nested(statsData.tackles);
    const goals = nested(statsData.goals);
    const minutes = nested(statsData.games).minutes;
    const safeMinutes = minutes > 0 ? minutes : appearances * 90;
    const sotPer90 = safeMinutes > 0 && Number.isFinite(shots.on) ? (shots.on * 90) / safeMinutes : null;
    const foulsPer90 =
      safeMinutes > 0 && Number.isFinite(fouls.committed) ? (fouls.committed * 90) / safeMinutes : null;
    const tacklesPer90 =
      safeMinutes > 0 && Number.isFinite(tackles.total) ? (tackles.total * 90) / safeMinutes : null;
    const extras: Partial<PlayerProp> = {
      seasonSotPer90: sotPer90,
      foulsPerGame: Number.isFinite(fouls.committed) ? fouls.committed / appearances : undefined,
      foulsDrawnPerGame: Number.isFinite(fouls.drawn) ? fouls.drawn / appearances : undefined,
      foulsPer90: foulsPer90 != null && Number.isFinite(foulsPer90) ? Number(foulsPer90.toFixed(2)) : null,
      tacklesPer90: tacklesPer90 != null && Number.isFinite(tacklesPer90) ? Number(tacklesPer90.toFixed(2)) : null,
      appearances,
      yellows: Number(row.yellow_cards) || null,
      goals: Number(row.goals) || nestNumber(statsData, "goals", "total") || null,
      position: squad.position ?? null,
      highFoulSide: Number.isFinite(fouls.committed) && fouls.committed / appearances >= 1.8,
    };

    for (const fixture of matches) {
      const match = `${fixture.homeName} vs ${fixture.awayName}`;
      const competition = fixture.leagueName;
      const photo = squad.photo ?? "";
      const sotRate = shots.on / appearances;
      const shotRate = shots.total / appearances;
      const foulRate = fouls.committed / appearances;
      const drawnRate = fouls.drawn / appearances;
      const tackleRate = tackles.total / appearances;
      const saveRate = goals.saves / appearances;

      for (const half of [0.5, 1.5] as const) {
        const clear = Math.ceil(half);
        pushPlayer(
          props,
          fixture.id,
          playerId,
          competition,
          name,
          match,
          photo,
          fixture.homeLogo,
          fixture.awayLogo,
          `${clear}+ Shots on Target`,
          "Shots on Target",
          hitProb(sotRate, clear),
          extras,
        );
      }
      for (const half of [0.5, 1.5, 2.5] as const) {
        const clear = Math.ceil(half);
        pushPlayer(
          props,
          fixture.id,
          playerId,
          competition,
          name,
          match,
          photo,
          fixture.homeLogo,
          fixture.awayLogo,
          `${clear}+ Total Shots`,
          "Total Shots",
          hitProb(shotRate, clear),
          extras,
        );
      }
      for (const half of [0.5, 1.5, 2.5, 3.5] as const) {
        const clear = Math.ceil(half);
        pushPlayer(
          props,
          fixture.id,
          playerId,
          competition,
          name,
          match,
          photo,
          fixture.homeLogo,
          fixture.awayLogo,
          `${clear}+ Fouls Committed`,
          "Fouls Committed",
          hitProb(foulRate, clear),
          extras,
        );
        pushPlayer(
          props,
          fixture.id,
          playerId,
          competition,
          name,
          match,
          photo,
          fixture.homeLogo,
          fixture.awayLogo,
          `${clear}+ Fouls Drawn`,
          "Fouls Drawn",
          hitProb(drawnRate, clear),
          extras,
        );
        pushPlayer(
          props,
          fixture.id,
          playerId,
          competition,
          name,
          match,
          photo,
          fixture.homeLogo,
          fixture.awayLogo,
          `${clear}+ Tackles`,
          "Tackles",
          hitProb(tackleRate, clear),
          extras,
        );
      }
      if (String(squad.position ?? "").toLowerCase().includes("goal")) {
        for (const half of [1.5, 2.5, 3.5, 4.5] as const) {
          const clear = Math.ceil(half);
          pushPlayer(
            props,
            fixture.id,
            playerId,
            competition,
            name,
            match,
            photo,
            fixture.homeLogo,
            fixture.awayLogo,
            `${clear}+ Saves`,
            "GK Saves",
            hitProb(saveRate, clear),
            extras,
          );
        }
      }
    }
  }

  // Cap by ranked legs — full squad × multi-line expands well past the old 50-player / 120-leg ceiling.
  return props
    .sort((left, right) => right.hitRate - left.hitRate || right.edgeScore - left.edgeScore)
    .slice(0, 999);
}

async function loadCardProps(
  fixtures: FixtureRow[],
  teamIds: number[],
  oddsList: OddsRow[],
): Promise<PlayerProp[]> {
  if (teamIds.length === 0) return [];
  const supabase = createIngestClient();
  const cardOdds = cardBookOddsByPlayer(oddsList, {
    betIds: [...PREMATCH_PLAYER_CARD_BET_IDS],
  });

  const pricedPlayers = latestCardPrices(oddsList);
  const { data: squads, error: squadError } = await supabase
    .from("team_squads")
    .select("team_id, player_id, player_name, photo, position")
    .in("team_id", teamIds);
  if (squadError) throw squadError;

  const squadPlayerIds = [...new Set((squads ?? []).map((row) => Number(row.player_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const pricedPlayerIds = [...new Set(pricedPlayers.map((row) => row.playerId))];
  const playerIds = [...new Set([...squadPlayerIds, ...pricedPlayerIds])];
  const [profiles, stats] = await Promise.all([loadProfiles(playerIds), loadStatsByPlayer(playerIds)]);

  const profileById = new Map(profiles.map((row) => [Number(row.player_id), row]));
  const squadByPlayer = new Map((squads ?? []).map((row) => [`${row.team_id}:${row.player_id}`, row]));
  const squadById = new Map((squads ?? []).map((row) => [Number(row.player_id), row]));
  const fixtureByTeam = new Map<number, FixtureRow[]>();
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const fixture of fixtures) {
    for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
      if (teamId == null) continue;
      const list = fixtureByTeam.get(teamId) ?? [];
      list.push(fixture);
      fixtureByTeam.set(teamId, list);
    }
  }

  const conversion = cardConversion(stats);
  const statsByPlayer = new Map(stats.map((row) => [Number(row.player_id), row]));
  const ranked: Array<PlayerProp & { rankScore: number; priced: boolean }> = [];
  const seen = new Set<string>();

  function pushCard(fixture: FixtureRow, playerId: number, teamId: number | null, oddsName?: string) {
    const key = `${fixture.id}:${playerId}`;
    if (seen.has(key)) return;
    const profile = profileById.get(playerId);
    const squad = teamId != null ? squadByPlayer.get(`${teamId}:${playerId}`) : squadById.get(playerId);
    const name = profile?.name ?? squad?.player_name ?? oddsName;
    if (!name) return;
    const position = profilePosition(profile?.player_data) ?? squad?.position ?? null;
    if (String(position ?? "").toLowerCase().includes("goal")) return;
    const row = statsByPlayer.get(playerId);
    const appearances = Number(row?.appearances);
    const fouls = row ? nested((row.stats_data as Record<string, unknown> | null)?.fouls) : {};
    const tackles = row ? nested((row.stats_data as Record<string, unknown> | null)?.tackles) : {};
    const shots = row ? nested((row.stats_data as Record<string, unknown> | null)?.shots) : {};
    const games = row ? nested((row.stats_data as Record<string, unknown> | null)?.games) : {};
    const foulsPerGame =
      row && Number.isFinite(appearances) && appearances > 0 && Number.isFinite(fouls.committed)
        ? fouls.committed / appearances
        : Number.NaN;
    const foulsDrawnPerGame =
      row && Number.isFinite(appearances) && appearances > 0 && Number.isFinite(fouls.drawn)
        ? fouls.drawn / appearances
        : Number.NaN;
    const yellowsPerGame =
      row && Number.isFinite(appearances) && appearances > 0 ? (Number(row.yellow_cards) || 0) / appearances : Number.NaN;
    const rawMinutes = Number(row?.minutes) || games.minutes || 0;
    const minutes =
      Number.isFinite(appearances) && appearances > 0 && rawMinutes >= appearances * 45
        ? rawMinutes
        : Number.isFinite(appearances) && appearances > 0
          ? appearances * 90
          : 0;
    const foulsPer90 =
      minutes > 0 && Number.isFinite(fouls.committed) ? Number(((fouls.committed * 90) / minutes).toFixed(2)) : null;
    const tacklesPer90 =
      minutes > 0 && Number.isFinite(tackles.total) ? Number(((tackles.total * 90) / minutes).toFixed(2)) : null;
    const sotPer90 =
      minutes > 0 && Number.isFinite(shots.on) ? Number(((shots.on * 90) / minutes).toFixed(2)) : null;
    const cardProb = row
      ? cardHitRate(yellowsPerGame, foulsPerGame, appearances, position, conversion)
      : 0.2;
    const odds = lookupCardBookOdd(cardOdds, fixture.id, name, playerId);
    const model = lookupCardEdge(oddsList, fixture.id, playerId);
    if (odds == null && cardProb < 0.06) return;
    seen.add(key);
    const hitRate = Math.round(clamp(cardProb * 100, 1, 99));
    let edgePct = model.edgePct;
    let modelProb = model.modelProb;
    if (modelProb == null && edgePct != null && odds != null && odds > 1) {
      const derived = (1 + edgePct / 100) / odds;
      if (Number.isFinite(derived) && derived > 0 && derived < 1) modelProb = derived;
    }
    if (edgePct == null && modelProb != null && odds != null && odds > 1) {
      edgePct = Number((((odds * modelProb) - 1) * 100).toFixed(1));
    }
    ranked.push({
      id: propId(fixture.id, playerId, "To Be Carded"),
      competition: fixture.leagueName,
      player: name,
      match: `${fixture.homeName} vs ${fixture.awayName}`,
      playerImg: profile?.photo ?? squad?.photo ?? "",
      homeTeamImg: fixture.homeLogo ?? "",
      awayTeamImg: fixture.awayLogo ?? "",
      selection: "To Be Carded",
      market: "To Be Carded",
      odds,
      hitRate,
      edgeScore:
        edgePct ??
        (odds == null || modelProb == null
          ? 0
          : Number((((odds * modelProb) - 1) * 100).toFixed(1))),
      foulsPerGame: Number.isFinite(foulsPerGame) ? Number(foulsPerGame.toFixed(2)) : undefined,
      foulsDrawnPerGame: Number.isFinite(foulsDrawnPerGame) ? Number(foulsDrawnPerGame.toFixed(2)) : undefined,
      foulsPer90,
      tacklesPer90,
      seasonSotPer90: sotPer90,
      appearances: Number.isFinite(appearances) && appearances > 0 ? appearances : null,
      yellows: row?.yellow_cards != null ? Number(row.yellow_cards) || 0 : null,
      goals: row?.goals != null ? Number(row.goals) : null,
      position,
      playerId,
      modelProb,
      edgePct,
      highFoulSide: Number.isFinite(foulsPerGame) && foulsPerGame >= 1.8,
      rankScore: (odds == null ? 0 : 1000) + cardProb * 100 + (Number.isFinite(foulsPerGame) ? foulsPerGame : 0),
      priced: odds != null,
    });
  }

  for (const price of pricedPlayers) {
    const fixture = fixtureById.get(price.fixtureId);
    if (!fixture) continue;
    pushCard(fixture, price.playerId, teamForFixturePlayer(squadByPlayer, fixture, price.playerId), price.player);
  }

  for (const row of stats) {
    const playerId = Number(row.player_id);
    const teamId = Number(row.team_id);
    if (!Number.isInteger(playerId) || !Number.isInteger(teamId)) continue;
    for (const fixture of fixtureByTeam.get(teamId) ?? []) {
      pushCard(fixture, playerId, teamId);
    }
  }

  const priced = ranked.filter((prop) => prop.priced).sort((left, right) => right.rankScore - left.rankScore);
  const unpriced = ranked
    .filter((prop) => !prop.priced)
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 999);
  return [...priced, ...unpriced].map(({ rankScore: _rank, priced: _priced, ...prop }) => prop);
}

async function loadStatsByPlayer(playerIds: number[]) {
  if (playerIds.length === 0) return [];
  const supabase = createIngestClient();
  const rows: Array<{
    player_id: number;
    team_id: number;
    appearances: number | null;
    minutes: number | null;
    yellow_cards: number | null;
    goals: number | null;
    stats_data: unknown;
  }> = [];
  for (let index = 0; index < playerIds.length; index += 200) {
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, team_id, appearances, minutes, yellow_cards, goals, stats_data")
      .in("player_id", playerIds.slice(index, index + 200))
      .gte("appearances", 3);
    if (error) throw error;
    rows.push(...((data ?? []) as typeof rows));
  }
  const best = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const playerId = Number(row.player_id);
    const previous = best.get(playerId);
    if (!previous || Number(row.appearances) > Number(previous.appearances)) best.set(playerId, row);
  }
  return [...best.values()];
}

function teamForFixturePlayer(
  squadByPlayer: Map<string, { team_id?: number | null; player_id?: number | null }>,
  fixture: FixtureRow,
  playerId: number,
) {
  for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
    if (teamId == null) continue;
    if (squadByPlayer.has(`${teamId}:${playerId}`)) return teamId;
  }
  return null;
}

function isUpcomingKickoff(value: string | null, now: number) {
  if (!value) return false;
  const kickoff = Date.parse(value);
  return Number.isFinite(kickoff) && kickoff > now;
}

function profilePosition(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const position = (data as Record<string, unknown>).position;
  return typeof position === "string" && position.trim() !== "" ? position : null;
}

function positionCardWeight(position: string | null) {
  const value = (position ?? "").toLowerCase();
  if (value.includes("def")) return 1.2;
  if (value.includes("mid")) return 1.1;
  if (value.includes("att") || value.includes("forw")) return 0.85;
  return 1;
}

function cardConversion(rows: Array<{ appearances: number | null; yellow_cards: number | null; stats_data: unknown }>) {
  let yellows = 0;
  let fouls = 0;
  for (const row of rows) {
    const appearances = Number(row.appearances);
    if (!Number.isFinite(appearances) || appearances < 3) continue;
    yellows += Number(row.yellow_cards) || 0;
    fouls += nested((row.stats_data as Record<string, unknown> | null)?.fouls).committed || 0;
  }
  if (fouls < 20 || yellows <= 0) return 0.18;
  return clamp(yellows / fouls, 0.08, 0.32);
}

function cardHitRate(yellowsPerGame: number, foulsPerGame: number, appearances: number, position: string | null, conversion: number) {
  const observed = Number.isFinite(yellowsPerGame) ? Math.max(0, yellowsPerGame) : 0;
  const foulProxy = Number.isFinite(foulsPerGame) ? Math.max(0, foulsPerGame) * conversion : 0;
  const sample = Math.max(0, appearances);
  const shrunk = (observed * sample + foulProxy * 6) / (sample + 6);
  const lambda = shrunk * positionCardWeight(position);
  return clamp(1 - Math.exp(-lambda), 0, 0.99);
}

async function loadProfiles(playerIds: number[]) {
  if (playerIds.length === 0) return [];
  const supabase = createIngestClient();
  const rows: Array<{ player_id: number; name: string | null; photo: string | null; player_data: unknown }> = [];
  for (let index = 0; index < playerIds.length; index += 200) {
    const { data, error } = await supabase
      .from("player_profiles")
      .select("player_id, name, photo, player_data")
      .in("player_id", playerIds.slice(index, index + 200));
    if (error) throw error;
    rows.push(...((data ?? []) as typeof rows));
  }
  return rows;
}

function pushMatch(
  rows: MatchProp[],
  fixtureId: number,
  competition: string,
  match: string,
  homeLogo: string | null | undefined,
  awayLogo: string | null | undefined,
  selection: string,
  market: MatchProp["market"],
  odd: number | null,
  hitRate: number | null,
) {
  if (odd == null || odd <= 1) return;
  const rate = hitRate == null ? 50 : clamp(hitRate, 1, 99);
  rows.push({
    id: propId(fixtureId, market, selection),
    competition,
    match,
    homeTeamImg: homeLogo ?? "",
    awayTeamImg: awayLogo ?? "",
    selection,
    market,
    odds: odd,
    hitRate: Math.round(rate),
    edgeScore: Number((rate - 100 / odd).toFixed(1)),
  });
}

function pushPlayer(
  rows: PlayerProp[],
  fixtureId: number,
  playerId: number,
  competition: string,
  player: string,
  match: string,
  playerImg: string,
  homeLogo: string | null | undefined,
  awayLogo: string | null | undefined,
  selection: string,
  market: PlayerProp["market"],
  probability: number,
  extra?: Partial<PlayerProp>,
) {
  if (!Number.isFinite(probability) || probability < 0.08) return;
  const hitRate = clamp(probability * 100, 1, 99);
  const clearLine = propSelectionLine(selection);
  rows.push({
    id: propId(fixtureId, playerId, market, selection),
    competition,
    player,
    match,
    playerImg,
    homeTeamImg: homeLogo ?? "",
    awayTeamImg: awayLogo ?? "",
    selection,
    market,
    odds: null,
    hitRate: Math.round(hitRate),
    edgeScore: 0,
    playerId,
    fixtureId,
    line: market === "To Be Carded" ? 1 : clearLine,
    ...extra,
  });
}

function toGeneratorMatch(prop: MatchProp): GeneratorProp[] {
  const marketType =
    prop.market === "Match Winner (1X2)"
      ? "Match Winner"
      : prop.market === "Both Teams to Score (BTTS)"
        ? "BTTS"
        : prop.selection.startsWith("Over")
          ? "Over 2.5"
          : prop.selection.startsWith("Under")
            ? "Under 2.5"
            : null;
  if (!marketType) return [];
  const odds = prop.odds;
  const modelOdds =
    odds != null && Number.isFinite(odds) && odds > 1
      ? null
      : modelOddsFromHitRate(prop.hitRate);
  return [{
    id: prop.id,
    competition: prop.competition,
    match: prop.match,
    selection: prop.selection,
    marketType,
    odds,
    modelOdds,
    hitRate: prop.hitRate,
  }];
}

function toGeneratorPlayer(prop: PlayerProp): GeneratorProp[] {
  const half = selectionToHalfLine(prop.selection, prop.market);
  const odds = prop.odds;
  const modelOdds =
    odds != null && Number.isFinite(odds) && odds > 1
      ? null
      : modelOddsFromHitRate(prop.hitRate);
  return [{
    id: prop.id + 1_000_000,
    competition: prop.competition,
    match: prop.match,
    selection: `${prop.player} ${prop.selection}`,
    marketType: prop.market,
    odds,
    modelOdds,
    hitRate: prop.hitRate,
    foulsPerGame: prop.foulsPerGame,
    position: prop.position,
    form: prop.form,
    formCounts: prop.formCounts,
    sotForm: prop.sotForm,
    seasonSotPer90: prop.seasonSotPer90,
    modelProb: prop.modelProb,
    edgePct: prop.edgePct,
    clash: prop.clash,
    strictRef: prop.strictRef,
    highFoulSide: prop.highFoulSide,
    lineHalf: half,
    playerId: prop.playerId ?? null,
    playerName: prop.player,
  }];
}

/** "2+ Fouls" → 1.5 half-line; cards treated as 0.5. */
function selectionToHalfLine(selection: string, market: PlayerProp["market"]): number | null {
  if (market === "To Be Carded") return 0.5;
  const match = selection.match(/(\d+)\+/);
  if (!match) return null;
  const clear = Number(match[1]);
  if (!Number.isFinite(clear) || clear <= 0) return null;
  return clear - 0.5;
}

function pickBookmaker(rows: OddsRow[]) {
  const byFixture = new Map<number, OddsRow[]>();
  for (const row of rows) {
    const list = byFixture.get(row.fixture_id) ?? [];
    list.push(row);
    byFixture.set(row.fixture_id, list);
  }
  const chosen = new Map<number, OddsRow>();
  for (const [fixtureId, list] of byFixture) {
    chosen.set(fixtureId, list.find((row) => row.bookmaker_id === BET365_BOOKMAKER_ID) ?? list[0]);
  }
  return chosen;
}

function latestOddsSnapshots(rows: OddsRow[]) {
  const latest = new Map<string, OddsRow>();
  for (const row of rows) {
    const key = `${row.fixture_id}:${row.bookmaker_id}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

function bookmakerRank(bookmakerId: number) {
  if (bookmakerId === BET365_BOOKMAKER_ID) return 2;
  if (bookmakerId === PADDY_POWER_BOOKMAKER_ID) return 1;
  return 0;
}

function buildOddsPayload(rows: OddsRow[]): OddsPayload {
  const prices = latestCardPrices(rows).map((price) => ({
    fixtureId: price.fixtureId,
    playerId: price.playerId,
    player: price.player,
    odd: price.odd,
    updatedAt: price.updatedAt,
  }));
  const updatedAt = prices.reduce<string | null>((latest, price) => {
    if (!price.updatedAt) return latest;
    if (!latest || price.updatedAt > latest) return price.updatedAt;
    return latest;
  }, null);
  return {
    source: "prematch_odds",
    bookmakerId: BET365_BOOKMAKER_ID,
    updatedAt,
    prices,
  };
}

function latestCardPrices(prematch: OddsRow[]) {
  const byPlayer = new Map<
    string,
    { fixtureId: number; playerId: number; player: string; odd: number; updatedAt: string | null }
  >();
  const ranked = [...prematch].sort(
    (left, right) => bookmakerRank(left.bookmaker_id) - bookmakerRank(right.bookmaker_id),
  );
  for (const row of ranked) {
    const quotes = collectBookPropQuotes(row, { markets: ["cards"] });
    for (const quote of quotes) {
      if (quote.playerId == null) continue;
      byPlayer.set(`${row.fixture_id}:${quote.playerId}`, {
        fixtureId: row.fixture_id,
        playerId: quote.playerId,
        player: quote.player,
        odd: quote.odd,
        updatedAt: row.updated_at ?? null,
      });
    }
  }
  return [...byPlayer.values()];
}

function betsFromOdds(row: OddsRow | undefined) {
  if (!row || !row.odds_data || typeof row.odds_data !== "object") return null;
  const bets = (row.odds_data as { bets?: Bet[] }).bets;
  if (!Array.isArray(bets)) return null;
  return new Map(bets.filter((bet) => Number.isInteger(Number(bet.id))).map((bet) => [Number(bet.id), bet]));
}

function classifyBookPropMarket(betId: number, betName: string): PropMarketBucket | null {
  const name = betName.toLowerCase();
  if (
    (PREMATCH_PLAYER_CARD_BET_IDS as readonly number[]).includes(betId) ||
    name.includes("to be booked") ||
    name.includes("to be carded") ||
    (name.includes("card") && name.includes("player"))
  ) {
    return "cards";
  }
  if (
    betId === prematchBets.playerFoulsDrawn ||
    name.includes("to be fouled") ||
    name.includes("fouls drawn")
  ) {
    return "fouls_drawn";
  }
  if (
    betId === prematchBets.playerFoulsCommitted ||
    betId === prematchBets.homePlayerFoulsCommitted ||
    betId === prematchBets.awayPlayerFoulsCommitted ||
    name.includes("foul")
  ) {
    return "fouls";
  }
  if (
    betId === prematchBets.homePlayerShotsOnTarget ||
    betId === prematchBets.awayPlayerShotsOnTarget ||
    name.includes("shots on target") ||
    name.includes("shotontarget") ||
    name.includes("shot on target")
  ) {
    return "sot";
  }
  if (
    betId === prematchBets.homePlayerShots ||
    betId === prematchBets.awayPlayerShots ||
    betId === prematchBets.awayPlayerShotsTotal ||
    (name.includes("shot") && !name.includes("1x2"))
  ) {
    return "shots";
  }
  if (
    betId === prematchBets.playerTacklesAny ||
    betId === prematchBets.homePlayerTackles ||
    betId === prematchBets.awayPlayerTackles ||
    name.includes("tackle")
  ) {
    return "tackles";
  }
  if (betId === prematchBets.goalkeeperSaves || name.includes("save")) {
    return "saves";
  }
  if (
    betId === prematchBets.anytimeGoalScorer ||
    name.includes("anytime") ||
    name.includes("goal scorer") ||
    name.includes("goalscorer")
  ) {
    return "goals";
  }
  if ((PREMATCH_PLAYER_PROP_BET_IDS as readonly number[]).includes(betId)) return "goals";
  return null;
}

function collectBookPropQuotes(
  row: OddsRow,
  options?: { markets?: PropMarketBucket[] },
): BookPropQuote[] {
  const bets = betsFromOdds(row);
  if (!bets) return [];
  const allow = options?.markets ? new Set(options.markets) : null;
  const rowModel = asNumber(row.model_prob);
  const rowEdge = asNumber(row.edge_pct);
  const out: BookPropQuote[] = [];

  for (const bet of bets.values()) {
    const betId = Number(bet.id);
    const market = classifyBookPropMarket(betId, String(bet.name ?? ""));
    if (!market) continue;
    if (allow && !allow.has(market)) continue;

    for (const value of bet.values ?? []) {
      // Per-value JSON first. Row model/edge is best-of-snapshot — unused for multi-player maps.
      void rowModel;
      void rowEdge;
      const parsed = parsePlayerPropValue(value, null, null);
      if (!parsed || parsed.odd == null) continue;
      const selection =
        market === "cards" ? "To Be Carded" : market === "goals" ? "Anytime" : parsed.selection;
      out.push({
        odd: parsed.odd,
        modelProb: parsed.modelProb,
        edgePct: parsed.edgePct,
        playerId: parsed.playerId,
        player: parsed.playerName,
        market,
        line: market === "cards" || market === "goals" ? null : parsed.line,
        selection,
      });
    }
  }
  return out;
}

/** Indexes book quotes for player props across cards / shots / SOT / fouls / scorers. */
function playerMarketOddsByPlayer(rows: OddsRow[], options?: { bookmakerId?: number }) {
  const ordered = [...rows].sort(
    (left, right) => bookmakerRank(left.bookmaker_id) - bookmakerRank(right.bookmaker_id),
  );
  const map = new Map<string, BookPropQuote>();
  const lists = new Map<string, BookPropQuote[]>();

  function setQuote(key: string, quote: BookPropQuote) {
    if (!map.has(key)) map.set(key, quote);
  }

  function pushList(key: string, quote: BookPropQuote) {
    const list = lists.get(key) ?? [];
    list.push(quote);
    lists.set(key, list);
  }

  for (const row of ordered) {
    if (options?.bookmakerId != null && row.bookmaker_id !== options.bookmakerId) continue;
    for (const quote of collectBookPropQuotes(row)) {
      const lineKey = quote.line == null ? "any" : String(quote.line);
      const listKey = `${row.fixture_id}:${quote.market}:${lineKey}`;
      pushList(listKey, quote);

      if (quote.playerId != null) {
        setQuote(`${row.fixture_id}:id:${quote.playerId}:${quote.market}:${lineKey}`, quote);
      }
      const exact = normalizePlayerName(quote.player);
      if (exact) setQuote(`${row.fixture_id}:name:${exact}:${quote.market}:${lineKey}`, quote);
      const lastKey = lastNameInitialKey(quote.player);
      if (lastKey) {
        const alias = `${row.fixture_id}:last:${lastKey}:${quote.market}:${lineKey}`;
        const previous = map.get(alias);
        if (!previous) setQuote(alias, quote);
        else if (previous.odd !== quote.odd) map.set(alias, { ...quote, odd: Number.NaN });
      }
      const surname = lastNameToken(quote.player);
      if (surname.length >= 3) {
        const surnameKey = `${row.fixture_id}:surname:${surname}:${quote.market}:${lineKey}`;
        const previous = map.get(surnameKey);
        if (!previous) setQuote(surnameKey, quote);
        else if (previous.odd !== quote.odd) map.set(surnameKey, { ...quote, odd: Number.NaN });
      }
    }
  }
  return { map, lists };
}

/** Card-only odd map (legacy keys for loadCardProps). */
function cardBookOddsByPlayer(
  rows: OddsRow[],
  options?: { bookmakerId?: number; betIds?: number[] },
) {
  const map = new Map<string, number>();
  const lists = new Map<number, Array<{ player: string; odd: number; playerId: number | null }>>();
  const ordered = [...rows].sort(
    (left, right) => bookmakerRank(left.bookmaker_id) - bookmakerRank(right.bookmaker_id),
  );
  for (const row of ordered) {
    if (options?.bookmakerId != null && row.bookmaker_id !== options.bookmakerId) continue;
    for (const quote of collectBookPropQuotes(row, { markets: ["cards"] })) {
      const list = lists.get(row.fixture_id) ?? [];
      list.push({ player: quote.player, odd: quote.odd, playerId: quote.playerId });
      lists.set(row.fixture_id, list);

      if (quote.playerId != null) map.set(`${row.fixture_id}:id:${quote.playerId}`, quote.odd);
      const exact = normalizePlayerName(quote.player);
      if (exact) map.set(`${row.fixture_id}:${exact}`, quote.odd);
      const lastKey = lastNameInitialKey(quote.player);
      if (lastKey) {
        const alias = `${row.fixture_id}:last:${lastKey}`;
        const previous = map.get(alias);
        if (previous == null) map.set(alias, quote.odd);
        else if (previous !== quote.odd) map.set(alias, Number.NaN);
      }
      const surname = lastNameToken(quote.player);
      if (surname.length >= 3) {
        const surnameKey = `${row.fixture_id}:surname:${surname}`;
        const previous = map.get(surnameKey);
        if (previous == null) map.set(surnameKey, quote.odd);
        else if (previous !== quote.odd) map.set(surnameKey, Number.NaN);
      }
    }
  }
  void options?.betIds;
  return { map, lists };
}

function lookupCardBookOdd(
  index: ReturnType<typeof cardBookOddsByPlayer>,
  fixtureId: number,
  name: string,
  playerId?: number,
) {
  const { map, lists } = index;
  if (playerId != null && Number.isInteger(playerId)) {
    const byId = map.get(`${fixtureId}:id:${playerId}`);
    if (byId != null && Number.isFinite(byId)) return byId;
  }
  const exact = map.get(`${fixtureId}:${normalizePlayerName(name)}`);
  if (exact != null && Number.isFinite(exact)) return exact;
  const lastKey = lastNameInitialKey(name);
  if (lastKey) {
    const alias = map.get(`${fixtureId}:last:${lastKey}`);
    if (alias != null && Number.isFinite(alias)) return alias;
  }
  const surname = lastNameToken(name);
  if (surname.length >= 3) {
    const bySurname = map.get(`${fixtureId}:surname:${surname}`);
    if (bySurname != null && Number.isFinite(bySurname)) return bySurname;
  }
  const fuzzy = pickUniqueNameMatch(name, lists.get(fixtureId) ?? []);
  return fuzzy?.odd ?? null;
}

function lookupBookPropQuote(
  index: ReturnType<typeof playerMarketOddsByPlayer>,
  fixtureId: number,
  name: string,
  market: PropMarketBucket,
  line: number | null,
  playerId?: number | null,
) {
  const { map, lists } = index;
  const lineKeys =
    line == null
      ? ["any"]
      : [
          String(line),
          String(line + 0.5), // half 1.5 ↔ clear 2
          String(line - 0.5),
          "any",
          String(Math.ceil(line)),
          String(Math.floor(line)),
        ].filter((key, index, all) => all.indexOf(key) === index);

  for (const lineKey of lineKeys) {
    if (playerId != null && Number.isInteger(playerId)) {
      const byId = map.get(`${fixtureId}:id:${playerId}:${market}:${lineKey}`);
      if (byId && Number.isFinite(byId.odd)) return byId;
    }
    const exact = map.get(`${fixtureId}:name:${normalizePlayerName(name)}:${market}:${lineKey}`);
    if (exact && Number.isFinite(exact.odd)) return exact;
    const lastKey = lastNameInitialKey(name);
    if (lastKey) {
      const alias = map.get(`${fixtureId}:last:${lastKey}:${market}:${lineKey}`);
      if (alias && Number.isFinite(alias.odd)) return alias;
    }
    const surname = lastNameToken(name);
    if (surname.length >= 3) {
      const bySurname = map.get(`${fixtureId}:surname:${surname}:${market}:${lineKey}`);
      if (bySurname && Number.isFinite(bySurname.odd)) return bySurname;
    }
    const fuzzy = pickUniqueNameMatch(name, lists.get(`${fixtureId}:${market}:${lineKey}`) ?? []);
    if (fuzzy) return fuzzy;
  }
  return null;
}

function propMarketBucket(market: PlayerProp["market"]): PropMarketBucket | null {
  if (market === "To Be Carded") return "cards";
  if (market === "Shots on Target") return "sot";
  if (market === "Total Shots") return "shots";
  if (market === "Fouls Committed") return "fouls";
  if (market === "Fouls Drawn") return "fouls_drawn";
  if (market === "Tackles") return "tackles";
  if (market === "GK Saves") return "saves";
  return null;
}

/** "2+ Fouls" → clear 2; book hdp is half-line 1.5. */
function propSelectionLine(selection: string): number | null {
  const match = selection.match(/^(\d+)\+/);
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isFinite(line) ? line : null;
}

/** Book lookup line: prefer half-line (Odds-API.io `hdp`). */
function propBookLine(selection: string, bucket: PropMarketBucket): number | null {
  if (bucket === "cards") return null;
  const clear = propSelectionLine(selection);
  if (clear == null) return null;
  return clear - 0.5;
}

function lookupCardEdge(rows: OddsRow[], fixtureId: number, playerId: number) {
  let modelProb: number | null = null;
  let edgePct: number | null = null;
  for (const row of rows) {
    if (row.fixture_id !== fixtureId) continue;
    for (const quote of collectBookPropQuotes(row, { markets: ["cards"] })) {
      if (quote.playerId !== playerId) continue;
      if (quote.modelProb != null) modelProb = quote.modelProb;
      if (quote.edgePct != null) edgePct = quote.edgePct;
    }
  }
  return { modelProb, edgePct };
}

async function enrichPropAngles(fixtures: FixtureRow[], props: PlayerProp[], oddsList: OddsRow[]) {
  if (props.length === 0) return props;
  const refs = await loadRefereeRates(fixtures.map((fixture) => fixture.referee ?? ""));
  const teamIds = [
    ...new Set(
      fixtures
        .flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id])
        .filter((id): id is number => id != null),
    ),
  ];
  const supabase = createIngestClient();
  const [{ data: teamStats }, { data: squads }, { data: seasonStats }] = await Promise.all([
    teamIds.length
      ? supabase.from("team_statistics").select("team_id, league_id, season, stats").in("team_id", teamIds)
      : Promise.resolve({ data: [] as Array<{ team_id: number; league_id: number; season: number; stats: unknown }> }),
    teamIds.length
      ? supabase.from("team_squads").select("team_id, player_id, position").in("team_id", teamIds)
      : Promise.resolve({ data: [] as Array<{ team_id: number; player_id: number; position: string | null }> }),
    teamIds.length
      ? supabase
          .from("player_season_stats")
          .select("player_id, team_id, league_id, season, appearances, stats_data")
          .in("team_id", teamIds)
          .gt("appearances", 0)
      : Promise.resolve({
          data: [] as Array<{
            player_id: number;
            team_id: number;
            league_id: number;
            season: number;
            appearances: number | null;
            stats_data: unknown;
          }>,
        }),
  ]);

  const yellows = new Map<string, number | null>();
  for (const row of teamStats ?? []) {
    const played = nestNumber(row.stats, "fixtures", "played", "total");
    const cards = parseTeamCards(row.stats).yellows;
    yellows.set(
      `${row.team_id}:${row.league_id}:${row.season}`,
      played && cards != null ? cards / played : null,
    );
  }

  const positions = new Map<string, string>();
  const squadByPlayer = new Map<string, { team_id?: number | null; player_id?: number | null }>();
  for (const row of squads ?? []) {
    positions.set(`${row.team_id}:${row.player_id}`, String(row.position ?? ""));
    squadByPlayer.set(`${row.team_id}:${row.player_id}`, row);
  }

  const opponentFoulCache = new Map<string, number | null>();
  function opponentFoulRate(
    teamId: number,
    leagueId: number,
    season: number,
    position: string | null | undefined,
  ) {
    const key = `${teamId}:${leagueId}:${season}:${(position ?? "").toLowerCase()}`;
    if (opponentFoulCache.has(key)) return opponentFoulCache.get(key) ?? null;
    const wanted = opposingLine(position);
    const rates: number[] = [];
    for (const row of seasonStats ?? []) {
      if (Number(row.team_id) !== teamId) continue;
      if (Number(row.league_id) !== leagueId || Number(row.season) !== season) continue;
      const pos = positions.get(`${teamId}:${row.player_id}`) ?? "";
      if (wanted && pos && !wanted.test(pos)) continue;
      const apps = Number(row.appearances);
      const fouls = nestNumber(row.stats_data, "fouls", "committed");
      if (!apps || fouls == null) continue;
      rates.push(fouls / apps);
    }
    const avg = rates.length === 0 ? null : rates.reduce((sum, value) => sum + value, 0) / rates.length;
    opponentFoulCache.set(key, avg);
    return avg;
  }

  const playerIds = [
    ...new Set(
      props.flatMap((prop) => {
        const id = prop.playerId;
        return typeof id === "number" && Number.isInteger(id) && id > 0 ? [id] : [];
      }),
    ),
  ];
  let logs = new Map<number, import("@/app/competitions/match-types").MatchLogRow[]>();
  try {
    logs = await loadMatchLogsByPlayers(playerIds, 5);
  } catch {
    logs = new Map();
  }

  const bookQuotes = playerMarketOddsByPlayer(oddsList);
  const fixtureByMatch = new Map(
    fixtures.map((fixture) => [`${fixture.homeName} vs ${fixture.awayName}`, fixture]),
  );

  return props.map((prop) => {
    const fixture = fixtureByMatch.get(prop.match);
    const log = prop.playerId ? (logs.get(prop.playerId) ?? []) : [];
    const kind = formKindForMarket(prop.market);
    const line = formLineForSelection(prop.market, prop.selection);
    const metrics = kind ? formMetrics(log, kind, line) : { values: [] as number[], hitPct: null, avg: null, hits: 0 };
    const form =
      log.length === 0 || !kind
        ? []
        : formHits(log, kind, line);
    const sotForm = log.length === 0 ? [] : formHits(log, "sot", 1);
    const formCounts = kind ? formValues(log, kind, 5) : [];

    const homeYellows = fixture
      ? yellows.get(`${fixture.home_team_id}:${fixture.league_id}:${fixture.season}`)
      : null;
    const awayYellows = fixture
      ? yellows.get(`${fixture.away_team_id}:${fixture.league_id}:${fixture.season}`)
      : null;
    const highFoulSide = Boolean(
      prop.highFoulSide ||
        (homeYellows != null && homeYellows >= 2) ||
        (awayYellows != null && awayYellows >= 2),
    );

    const playerTeamId =
      fixture && prop.playerId != null
        ? teamForFixturePlayer(squadByPlayer, fixture, prop.playerId)
        : null;
    const opponentId =
      fixture == null || playerTeamId == null
        ? null
        : playerTeamId === fixture.home_team_id
          ? fixture.away_team_id
          : fixture.home_team_id;
    const drawn =
      prop.foulsDrawnPerGame ??
      (prop.market === "Fouls Drawn" && prop.foulsPerGame != null ? prop.foulsPerGame : null);
    const opponentRate =
      fixture && opponentId != null
        ? opponentFoulRate(opponentId, fixture.league_id, fixture.season, prop.position)
        : null;
    const clash =
      drawn != null &&
      drawn >= 2 &&
      opponentRate != null &&
      opponentRate >= 2
        ? {
            playerRate: Number(drawn.toFixed(2)),
            opponentRate: Number(opponentRate.toFixed(2)),
            label: "Fouls drawn vs fouls committed",
          }
        : null;

    let odds = prop.odds;
    let modelProb = prop.modelProb ?? null;
    let edgePct = prop.edgePct ?? null;

    const bucket = propMarketBucket(prop.market);
    if (fixture && bucket) {
      const line = propBookLine(prop.selection, bucket);
      const quote = lookupBookPropQuote(
        bookQuotes,
        fixture.id,
        prop.player,
        bucket,
        line,
        prop.playerId,
      );
      if (quote) {
        odds = quote.odd;
        if (quote.modelProb != null) modelProb = quote.modelProb;
        if (quote.edgePct != null) edgePct = quote.edgePct;
      }
    }

    if (prop.market === "To Be Carded" && prop.playerId != null && fixture) {
      const model = lookupCardEdge(oddsList, fixture.id, prop.playerId);
      if (model.modelProb != null) modelProb = model.modelProb;
      if (model.edgePct != null) edgePct = model.edgePct;
    }

    if (
      edgePct == null &&
      odds != null &&
      Number.isFinite(odds) &&
      odds > 1 &&
      modelProb != null &&
      Number.isFinite(modelProb)
    ) {
      edgePct = Number((((odds * modelProb) - 1) * 100).toFixed(1));
    }
    // Never invent edge from hit-rate — only stored/computed model edge.
    const edgeScore = edgePct ?? 0;

    return {
      ...prop,
      odds: odds ?? null,
      modelProb,
      edgePct,
      edgeScore,
      form,
      formCounts,
      formHitPct: metrics.hitPct,
      formAvg: metrics.avg,
      formThreshold: line,
      line: prop.line ?? (prop.market === "To Be Carded" ? 1 : propSelectionLine(prop.selection)),
      fixtureId: prop.fixtureId ?? fixture?.id ?? null,
      sotForm,
      breakdown: log,
      strictRef: lookupReferee(refs, fixture?.referee ?? null),
      highFoulSide,
      clash,
    };
  });
}

function formKindForMarket(market: PlayerProp["market"]): FormStatKind | null {
  if (market === "To Be Carded") return "card";
  if (market === "Fouls Committed") return "fouls";
  if (market === "Fouls Drawn") return "drawn";
  if (market === "Shots on Target") return "sot";
  if (market === "Total Shots") return "shots";
  if (market === "Tackles") return "tackles";
  if (market === "GK Saves") return "saves";
  return null;
}

/** Parse "2+ Fouls" / "1+ SOT" → integer clear line; fall back by market. */
function formLineForSelection(market: PlayerProp["market"], selection: string): number {
  const match = selection.match(/(\d+)\+/);
  if (match) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  if (market === "Fouls Committed" || market === "Fouls Drawn" || market === "Tackles") return 2;
  if (market === "Total Shots") return 2;
  if (market === "GK Saves") return 3;
  return 1;
}

function opposingLine(position: string | null | undefined) {
  const value = (position ?? "").toLowerCase();
  if (value.includes("wing") || value.includes("att") || value.includes("forw") || value.includes("forward")) {
    return /def|back/i;
  }
  if (value.includes("def") || value.includes("back")) return /wing|att|forw|mid/i;
  return null;
}

function oddFor(bets: Map<number, Bet>, betId: number, labels: string[]) {
  const values = bets.get(betId)?.values ?? [];
  const wanted = labels.map((label) => normalizeLine(label));
  for (const value of values) {
    const odd = Number(value.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const text = normalizeLine(`${value.value ?? ""}`);
    if (wanted.includes(text)) return odd;
  }
  return null;
}

function ouOdd(bets: Map<number, Bet>, side: "over" | "under") {
  const values = bets.get(prematchBets.goalsOverUnder)?.values ?? [];
  for (const value of values) {
    const odd = Number(value.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const text = String(value.value ?? "").toLowerCase();
    const handicap = String(value.handicap ?? "").toLowerCase();
    const line25 = /\b2\.5\b/.test(text) || handicap === "2.5" || handicap === "2.50";
    if (!line25) continue;
    if (side === "over" && text.includes("over")) return odd;
    if (side === "under" && text.includes("under")) return odd;
  }
  return null;
}

function pickStanding(rows: StandingRow[], fixture: FixtureRow, teamId: number | null) {
  if (teamId == null) return null;
  return (
    rows.find((row) => row.team_id === teamId && row.league_id === fixture.league_id && row.season === fixture.season) ??
    rows.find((row) => row.team_id === teamId && row.league_id === fixture.league_id) ??
    rows.find((row) => row.team_id === teamId) ??
    null
  );
}

function venueGoals(stats: unknown) {
  if (!stats || typeof stats !== "object") return { played: 0, scored: Number.NaN, conceded: Number.NaN };
  const record = stats as Record<string, unknown>;
  const goals = record.goals && typeof record.goals === "object" ? (record.goals as Record<string, unknown>) : {};
  return {
    played: Number(record.played) || 0,
    scored: Number(goals.for),
    conceded: Number(goals.against),
  };
}

function perGame(goals: number, played: number, prior: number) {
  if (!Number.isFinite(goals) || played <= 0) return prior;
  return goals / played;
}

function shrink(observed: number, sample: number, prior: number, priorGames = 8) {
  const n = Math.max(0, sample);
  return (n * observed + priorGames * prior) / (n + priorGames);
}

function matchLambdas(home: StandingRow | null, away: StandingRow | null) {
  if (!home && !away) return null;
  const priorHome = 1.35;
  const priorAway = 1.15;
  const homeHome = venueGoals(home?.home_stats);
  const awayAway = venueGoals(away?.away_stats);
  const homeAll = venueGoals(home?.all_stats);
  const awayAll = venueGoals(away?.all_stats);
  const homeFor = perGame(homeHome.scored, homeHome.played, perGame(homeAll.scored, homeAll.played, priorHome));
  const homeAgainst = perGame(homeHome.conceded, homeHome.played, perGame(homeAll.conceded, homeAll.played, priorAway));
  const awayFor = perGame(awayAway.scored, awayAway.played, perGame(awayAll.scored, awayAll.played, priorAway));
  const awayAgainst = perGame(awayAway.conceded, awayAway.played, perGame(awayAll.conceded, awayAll.played, priorHome));
  const sample = Math.min(homeHome.played || homeAll.played, awayAway.played || awayAll.played);
  return {
    home: shrink((homeFor + awayAgainst) / 2, sample, priorHome),
    away: shrink((awayFor + homeAgainst) / 2, sample, priorAway),
  };
}

function poisson1x2(lambdaHome: number, lambdaAway: number) {
  const max = 8;
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= max; h += 1) {
    for (let a = 0; a <= max; a += 1) {
      const p = poisson(lambdaHome, h) * poisson(lambdaAway, a);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away || 1;
  return { home: (home / total) * 100, draw: (draw / total) * 100, away: (away / total) * 100 };
}

function poissonAtMost(lambda: number, maxGoals: number) {
  let sum = 0;
  for (let goals = 0; goals <= maxGoals; goals += 1) sum += poisson(lambda, goals);
  return sum;
}

function marketSplit(overOdd: number | null, underOdd: number | null) {
  if (overOdd == null || underOdd == null || overOdd <= 1 || underOdd <= 1) return null;
  const over = 1 / overOdd;
  const under = 1 / underOdd;
  const total = over + under;
  return { over: (over / total) * 100, under: (under / total) * 100 };
}

function mix(model: number | null, other: number | null, modelWeight: number) {
  if (model == null) return other;
  if (other == null) return model;
  return model * modelWeight + other * (1 - modelWeight);
}

function buildMatchModel(
  home: StandingRow | null,
  away: StandingRow | null,
  overOdd: number | null,
  underOdd: number | null,
  prediction: { percent?: unknown } | undefined,
) {
  const lambdas = matchLambdas(home, away);
  const api = apiPercents(prediction);
  const market = marketSplit(overOdd, underOdd);
  const scoreline = lambdas ? poisson1x2(lambdas.home, lambdas.away) : null;
  const overModel = lambdas ? (1 - poissonAtMost(lambdas.home + lambdas.away, 2)) * 100 : null;
  const underModel = overModel == null ? null : 100 - overModel;
  const bttsModel = lambdas ? (1 - poisson(lambdas.home, 0)) * (1 - poisson(lambdas.away, 0)) * 100 : null;
  return {
    home: mix(scoreline?.home ?? null, api.home, 0.65),
    draw: mix(scoreline?.draw ?? null, api.draw, 0.65),
    away: mix(scoreline?.away ?? null, api.away, 0.65),
    over25: mix(overModel, market?.over ?? null, 0.55),
    under25: mix(underModel, market?.under ?? null, 0.55),
    bttsYes: bttsModel,
    bttsNo: bttsModel == null ? null : 100 - bttsModel,
  };
}

function apiPercents(prediction: { percent?: unknown } | undefined) {
  const json = prediction?.percent;
  if (!json || typeof json !== "object") return { home: null, draw: null, away: null };
  const record = json as Record<string, unknown>;
  return {
    home: percentNumber(record.home),
    draw: percentNumber(record.draw),
    away: percentNumber(record.away),
  };
}

function normalizeLine(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function poisson(lambda: number, k: number) {
  let value = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) value *= lambda / i;
  return value;
}

function nested(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(record)) {
    const number = Number(item);
    if (Number.isFinite(number)) out[key] = number;
  }
  return out;
}

function hitProb(lambda: number | undefined, line: number) {
  if (lambda == null || !Number.isFinite(lambda) || lambda <= 0) return 0;
  const threshold = Math.max(1, Math.floor(line));
  let cdf = 0;
  for (let k = 0; k < threshold && k < 80; k += 1) cdf += poisson(lambda, k);
  return clamp(1 - cdf, 0, 0.99);
}

function percentNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function propId(...parts: Array<string | number>) {
  const raw = parts.join(":");
  let hash = 0;
  for (const char of raw) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) || 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function shiftDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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
