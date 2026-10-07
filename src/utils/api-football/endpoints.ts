import "server-only";
import type { LiveBetId, PrematchBetId } from "./bet-catalogs";
import { apiFootballGet, apiFootballGetAllPages, CoverageNotSupported } from "./client";

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

function get<T>(path: string, params?: Query) {
  return apiFootballGet<T>(path, params);
}

function getAllPages<T>(path: string, params?: Query) {
  return apiFootballGetAllPages<T>(path, params);
}

export type CoverageBlocked = { success: false; reason: "Coverage not supported" };

function guardCoverage<T>(request: Promise<T>): Promise<T | CoverageBlocked> {
  return request.catch((error: unknown) => {
    if (error instanceof CoverageNotSupported) return { success: false, reason: "Coverage not supported" };
    throw error;
  });
}

export function getTimezones() {
  return get<string[]>("/timezone");
}

export function getSeasons() {
  return get<number[]>("/leagues/seasons");
}

export type ApiFootballCountry = {
  name: string;
  code: string | null;
  flag: string | null;
};

export type ApiFootballLeagueCoverage = {
  fixtures: {
    events: boolean;
    lineups: boolean;
    statistics_fixtures: boolean;
    statistics_players: boolean;
  };
  standings: boolean;
  players: boolean;
  top_scorers: boolean;
  top_assists: boolean;
  top_cards: boolean;
  injuries: boolean;
  predictions: boolean;
  odds: boolean;
};

export type ApiFootballLeagueSeason = {
  year: number;
  start: string;
  end: string;
  current: boolean;
  coverage: ApiFootballLeagueCoverage;
};

export type ApiFootballLeague = {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string | null;
  };
  country: {
    name: string | null;
    code: string | null;
    flag: string | null;
  };
  seasons: ApiFootballLeagueSeason[];
};

export type GetLeaguesParams = {
  id?: number;
  name?: string;
  country?: string;
  code?: string;
  season?: number;
  team?: number;
  type?: "league" | "cup";
  current?: boolean | "true" | "false";
  search?: string;
  last?: number;
};

export function getCountries(params?: {
  name?: string;
  code?: string;
  search?: string;
}) {
  return get<ApiFootballCountry[]>("/countries", params);
}

export function leagueLogoUrl(leagueId: number) {
  return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}

export function getLeagues(params?: GetLeaguesParams) {
  return get<ApiFootballLeague[]>("/leagues", params);
}

export type ApiFootballVenue = {
  id: number | null;
  name: string | null;
  address: string | null;
  city: string | null;
  country?: string | null;
  capacity: number | null;
  surface: string | null;
  image: string | null;
};

export type GetVenuesParams =
  | { id: number }
  | { name: string }
  | { city: string }
  | { country: string }
  | { search: string };

export type ApiFootballTeam = {
  id: number;
  name: string;
  code: string | null;
  country: string | null;
  founded: number | null;
  national: boolean;
  logo: string | null;
};

export type ApiFootballTeamItem = {
  team: ApiFootballTeam;
  venue: ApiFootballVenue | null;
};

export type GetTeamsParams =
  | { id: number }
  | { league: number; season: number }
  | { country: string }
  | { name: string }
  | { code: string }
  | { venue: number }
  | { search: string };

export type GetTeamStatisticsParams = {
  league: number;
  season: number;
  team: number;
  date?: string;
};

export function getVenues(params: GetVenuesParams) {
  return get<ApiFootballVenue[]>("/venues", params);
}

export function teamLogoUrl(teamId: number) {
  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}

export function getTeams(params: GetTeamsParams) {
  return get<ApiFootballTeamItem[]>("/teams", params);
}

export function getTeamsCountries() {
  return get<unknown[]>("/teams/countries");
}

export function getTeamStatistics(params: GetTeamStatisticsParams) {
  return get<unknown>("/teams/statistics", params);
}

export function getStandings(params: GetStandingsParams) {
  return get<ApiFootballStandingsItem[]>("/standings", params);
}

export type GetStandingsParams = {
  season: number;
  league?: number;
  team?: number;
};

export type ApiFootballStandingStats = {
  played: number | null;
  win: number | null;
  draw: number | null;
  lose: number | null;
  goals: {
    for: number | null;
    against: number | null;
  };
};

export type ApiFootballStandingRow = {
  rank: number | null;
  team: {
    id: number;
    name: string;
    logo: string | null;
  };
  points: number | null;
  goalsDiff: number | null;
  group: string | null;
  form: string | null;
  status: string | null;
  description: string | null;
  all: ApiFootballStandingStats;
  home: ApiFootballStandingStats;
  away: ApiFootballStandingStats;
  update: string | null;
};

export type ApiFootballStandingsItem = {
  league: {
    id: number;
    name: string;
    country: string | null;
    logo: string | null;
    flag: string | null;
    season: number;
    standings: ApiFootballStandingRow[][];
  };
};

export type GetFixturesParams = {
  id?: number;
  ids?: string;
  live?: string;
  date?: string;
  league?: number;
  season?: number;
  team?: number;
  last?: number;
  next?: number;
  from?: string;
  to?: string;
  round?: string;
  status?: string;
  venue?: number;
  timezone?: string;
  page?: number;
};

export type ApiFootballFixtureTeam = {
  id: number | null;
  name: string | null;
  logo: string | null;
  winner: boolean | null;
};

export type ApiFootballFixtureScoreline = {
  home: number | null;
  away: number | null;
};

export type ApiFootballFixtureItem = {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string | null;
    date: string | null;
    timestamp: number | null;
    periods: {
      first: number | null;
      second: number | null;
    };
    venue: {
      id: number | null;
      name: string | null;
      city: string | null;
    };
    status: {
      long: string | null;
      short: string | null;
      elapsed: number | null;
      extra: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string | null;
    logo: string | null;
    flag: string | null;
    season: number;
    round: string | null;
    standings?: boolean;
  };
  teams: {
    home: ApiFootballFixtureTeam;
    away: ApiFootballFixtureTeam;
  };
  goals: ApiFootballFixtureScoreline;
  score: {
    halftime: ApiFootballFixtureScoreline;
    fulltime: ApiFootballFixtureScoreline;
    extratime: ApiFootballFixtureScoreline;
    penalty: ApiFootballFixtureScoreline;
  };
};

export function getFixtures(params: GetFixturesParams) {
  return get<ApiFootballFixtureItem[]>("/fixtures", params);
}

export function getFixturesAllPages(params: GetFixturesParams) {
  return getAllPages<ApiFootballFixtureItem>("/fixtures", params);
}

export function getLiveFixtures(live: "all" | string = "all") {
  return get<ApiFootballFixtureItem[]>("/fixtures", { live });
}

export function getHeadToHead(params: {
  h2h: string;
  league?: number;
  season?: number;
  last?: number;
  next?: number;
  from?: string;
  to?: string;
  timezone?: string;
  status?: string;
  venue?: number;
}) {
  return get<ApiFootballFixtureItem[]>("/fixtures/headtohead", params);
}

export type ApiFootballFixtureRound = {
  round: string;
  dates: string[];
};

export function getFixtureRounds(params: {
  league: number;
  season: number;
  current?: boolean;
  dates?: boolean;
}) {
  return get<Array<string | ApiFootballFixtureRound>>("/fixtures/rounds", params);
}

export type ApiFootballIdName = {
  id: number | null;
  name: string | null;
};

export type ApiFootballIdNameLogo = ApiFootballIdName & {
  logo?: string | null;
};

export type ApiFootballFixtureEvent = {
  time: {
    elapsed: number | null;
    extra: number | null;
  };
  team: ApiFootballIdNameLogo;
  player: ApiFootballIdName;
  assist: ApiFootballIdName;
  type: string | null;
  detail: string | null;
  comments: string | null;
};

const EVENT_TYPES = new Set(["Goal", "Card", "subst", "Var"]);

export function getFixtureEvents(params: {
  fixture: number;
  team?: number;
  player?: number;
  type?: "Goal" | "Card" | "subst" | "Var";
}) {
  if (!Number.isInteger(params.fixture) || params.fixture <= 0) {
    return Promise.reject(new Error("fixture events need a fixture id"));
  }
  if (params.team != null && !Number.isInteger(params.team)) {
    return Promise.reject(new Error("fixture events team id must be a number"));
  }
  if (params.player != null && !Number.isInteger(params.player)) {
    return Promise.reject(new Error("fixture events player id must be a number"));
  }
  if (params.type != null && !EVENT_TYPES.has(params.type)) {
    return Promise.reject(new Error("fixture events type must be Goal, Card, or subst"));
  }
  return get<ApiFootballFixtureEvent[]>("/fixtures/events", params);
}

export type ApiFootballLineupPlayer = {
  player: {
    id: number | null;
    name: string | null;
    number: number | null;
    pos: string | null;
    grid: string | null;
  };
};

export type ApiFootballFixtureLineup = {
  team: ApiFootballIdNameLogo & {
    colors?: Record<string, unknown> | null;
  };
  coach: {
    id: number | null;
    name: string | null;
    photo: string | null;
  };
  formation: string | null;
  startXI: ApiFootballLineupPlayer[];
  substitutes: ApiFootballLineupPlayer[];
};

export function getFixtureLineups(params: {
  fixture: number;
  team?: number;
  type?: string;
}) {
  if (!Number.isInteger(params.fixture) || params.fixture <= 0) {
    return Promise.reject(new Error("fixture lineups need a fixture id"));
  }
  if (params.team != null && !Number.isInteger(params.team)) {
    return Promise.reject(new Error("fixture lineups team id must be a number"));
  }
  if (params.type != null && params.type !== "Starting XI") {
    return Promise.reject(new Error("fixture lineups type must be Starting XI"));
  }
  return get<ApiFootballFixtureLineup[]>("/fixtures/lineups", params);
}

export type ApiFootballFixtureStatistic = {
  team: ApiFootballIdNameLogo;
  statistics: Array<{
    type: string | null;
    value: string | number | null;
  }>;
};

export function getFixtureStatistics(params: {
  fixture: number;
  team?: number;
  type?: string;
  half?: boolean;
}) {
  if (!Number.isInteger(params.fixture) || params.fixture <= 0) {
    return Promise.reject(new Error("fixture statistics need a fixture id"));
  }
  if (params.team != null && !Number.isInteger(params.team)) {
    return Promise.reject(new Error("fixture statistics team id must be a number"));
  }
  if (params.type != null && params.type.trim() === "") {
    return Promise.reject(new Error("fixture statistics type must be a stat name"));
  }
  return guardCoverage(get<ApiFootballFixtureStatistic[]>("/fixtures/statistics", params));
}

export type ApiFootballFixturePlayerRow = {
  player: {
    id: number | null;
    name: string | null;
    photo: string | null;
  };
  statistics: Array<Record<string, unknown>>;
};

export type ApiFootballFixturePlayersItem = {
  team: ApiFootballIdNameLogo & { update?: string | null };
  players: ApiFootballFixturePlayerRow[];
};

export function getFixturePlayers(params: { fixture: number; team?: number }) {
  if (!Number.isInteger(params.fixture) || params.fixture <= 0) {
    return Promise.reject(new Error("fixture players need a fixture id"));
  }
  if (params.team != null && !Number.isInteger(params.team)) {
    return Promise.reject(new Error("fixture players team id must be a number"));
  }
  return get<ApiFootballFixturePlayersItem[]>("/fixtures/players", params);
}

export type ApiFootballPredictionItem = {
  predictions: {
    winner: {
      id: number | null;
      name: string | null;
      comment: string | null;
    } | null;
    win_or_draw: boolean | null;
    under_over: string | null;
    goals: {
      home: string | number | null;
      away: string | number | null;
    } | null;
    advice: string | null;
    percent: {
      home: string | null;
      draw: string | null;
      away: string | null;
    } | null;
  };
  league?: Record<string, unknown>;
  teams?: Record<string, unknown>;
  comparison?: Record<string, unknown>;
  h2h?: unknown;
};

export function getPredictions(params: { fixture: number }) {
  return guardCoverage(get<ApiFootballPredictionItem[]>("/predictions", params));
}

export type ApiFootballInjuryItem = {
  player: {
    id: number | null;
    name: string | null;
    photo: string | null;
    type: string | null;
    reason: string | null;
  };
  team: ApiFootballIdNameLogo;
  fixture: {
    id: number | null;
    timezone: string | null;
    date: string | null;
    timestamp: number | null;
  };
  league: {
    id: number | null;
    season: number | null;
    name: string | null;
    country: string | null;
    logo: string | null;
    flag: string | null;
  };
};

export interface ApiInjuryItem {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string;
    reason: string;
  };
  team: {
    id: number;
    name: string;
    logo: string;
    update: string;
  };
  fixture: {
    id: number;
    timezone: string;
    date: string;
    timestamp: number;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
  };
}

export function getInjuries(params: {
  league?: number;
  season?: number;
  fixture?: number;
  ids?: string;
  team?: number;
  player?: number;
  date?: string;
  timezone?: string;
}) {
  return get<ApiFootballInjuryItem[]>("/injuries", params);
}

export type ApiFootballNamedId = {
  id: number;
  name: string;
};

export type ApiFootballOddsValue = {
  value: string;
  odd: string | number | null;
  handicap?: string | number | null;
  main?: boolean | null;
  suspended?: boolean | null;
};

export type ApiFootballPrematchBet = {
  id: PrematchBetId;
  name: string;
  values: ApiFootballOddsValue[];
};

/** @deprecated Use ApiFootballPrematchBet. Live markets are ApiFootballLiveBet. */
export type ApiFootballOddsBet = ApiFootballPrematchBet;

export type ApiFootballLiveBet = {
  id: LiveBetId;
  name: string;
  values: ApiFootballOddsValue[];
};

export type ApiFootballOddsBookmaker = {
  id: number;
  name: string;
  bets: ApiFootballPrematchBet[];
};

export type ApiFootballOddsItem = {
  league: {
    id: number;
    name: string;
    country: string | null;
    logo: string | null;
    flag: string | null;
    season: number;
  };
  fixture: {
    id: number;
    timezone: string | null;
    date: string | null;
    timestamp: number | null;
  };
  update: string | null;
  bookmakers: ApiFootballOddsBookmaker[];
};

export function getOdds(params?: Query & { bet?: PrematchBetId; bookmaker?: number }) {
  void params;
  throw new Error(
    "Betting odds must come from Odds-API.io via prematch_odds. API-Football /odds is disabled.",
  );
}

export function getPreMatchOdds(params: Query & { bet?: PrematchBetId; bookmaker?: number }) {
  return getOdds(params);
}

export type ApiFootballOddsMappingItem = {
  league: {
    id: number;
    name: string;
    country: string | null;
    logo: string | null;
    flag: string | null;
    season: number;
  };
  fixture: {
    id: number;
    timezone: string | null;
    date: string | null;
    timestamp: number | null;
  };
};

export function getOddsMapping(params?: { page?: number }) {
  return get<ApiFootballOddsMappingItem[]>("/odds/mapping", params);
}

export type ApiFootballLiveOddsItem = {
  fixture: {
    id: number;
    status?: Record<string, unknown> | null;
    date?: string | null;
    timestamp?: number | null;
    timezone?: string | null;
  };
  league: {
    id: number;
    season: number | null;
  };
  teams?: {
    home?: ApiFootballIdNameLogo | null;
    away?: ApiFootballIdNameLogo | null;
  };
  status?: {
    stopped?: boolean | null;
    blocked?: boolean | null;
    finished?: boolean | null;
  };
  odds: ApiFootballLiveBet[];
};

export function getLiveOdds(params?: {
  fixture?: number;
  league?: number;
  bet?: LiveBetId;
}) {
  void params;
  throw new Error(
    "Betting odds must come from Odds-API.io via live_odds. API-Football /odds/live is disabled.",
  );
}

export type PrematchBetCatalogItem = {
  id: PrematchBetId;
  name: string;
};

export type LiveBetCatalogItem = {
  id: LiveBetId;
  name: string;
};

export function getBets(params?: { id?: PrematchBetId; search?: string }) {
  return get<PrematchBetCatalogItem[]>("/odds/bets", params);
}

export function getLiveBets(params?: { id?: LiveBetId; search?: string }) {
  return get<LiveBetCatalogItem[]>("/odds/live/bets", params);
}

export function getBookmakers(params?: { id?: number; search?: string }) {
  return get<ApiFootballNamedId[]>("/odds/bookmakers", params);
}

export function getPlayers(params: GetPlayersParams) {
  return get<ApiFootballPlayerItem[]>("/players", params);
}

export function getPlayersAllPages(params: GetPlayersParams) {
  return getAllPages<ApiFootballPlayerItem>("/players", params);
}

export function getPlayerStatistics(params: { id: number; season: number }) {
  return getPlayersAllPages(params);
}

export type GetPlayersParams = {
  id?: number;
  team?: number;
  league?: number;
  season?: number;
  search?: string;
  page?: number;
};

export type GetTopScorersParams = {
  league: number;
  season: number;
};

export type ApiFootballPlayerBirth = {
  date: string | null;
  place: string | null;
  country: string | null;
};

export type ApiFootballPlayer = {
  id: number;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  birth: ApiFootballPlayerBirth;
  nationality: string | null;
  height: string | null;
  weight: string | null;
  number?: number | null;
  position?: string | null;
  injured: boolean | null;
  photo: string | null;
};

export type ApiFootballPlayerStatistic = {
  team: {
    id: number | null;
    name: string | null;
    logo: string | null;
  };
  league: {
    id: number | null;
    name: string | null;
    country: string | null;
    logo: string | null;
    flag: string | null;
    season: number | null;
  };
  games: {
    appearences: number | null;
    lineups: number | null;
    minutes: number | null;
    number: number | null;
    position: string | null;
    rating: string | null;
    captain: boolean | null;
  };
  substitutes: {
    in: number | null;
    out: number | null;
    bench: number | null;
  };
  shots: {
    total: number | null;
    on: number | null;
  };
  goals: {
    total: number | null;
    conceded: number | null;
    assists: number | null;
    saves: number | null;
  };
  passes: {
    total: number | null;
    key: number | null;
    accuracy: number | null;
  };
  tackles: {
    total: number | null;
    blocks: number | null;
    interceptions: number | null;
  };
  duels: {
    total: number | null;
    won: number | null;
  };
  dribbles: {
    attempts: number | null;
    success: number | null;
    past: number | null;
  };
  fouls: {
    drawn: number | null;
    committed: number | null;
  };
  cards: {
    yellow: number | null;
    yellowred: number | null;
    red: number | null;
  };
  penalty: {
    won: number | null;
    commited: number | null;
    scored: number | null;
    missed: number | null;
    saved: number | null;
  };
};

export type ApiFootballPlayerItem = {
  player: ApiFootballPlayer;
  statistics: ApiFootballPlayerStatistic[];
};

export function getTopScorers(params: GetTopScorersParams) {
  return get<ApiFootballPlayerItem[]>("/players/topscorers", params);
}

export function getTopAssists(params: GetTopScorersParams) {
  return get<ApiFootballPlayerItem[]>("/players/topassists", params);
}

export function getTopYellowCards(params: GetTopScorersParams) {
  return get<ApiFootballPlayerItem[]>("/players/topyellowcards", params);
}

export function getTopRedCards(params: GetTopScorersParams) {
  return get<ApiFootballPlayerItem[]>("/players/topredcards", params);
}

export type ApiFootballSquadPlayer = {
  id: number;
  name: string | null;
  age: number | null;
  number: number | null;
  position: string | null;
  photo: string | null;
};

export type ApiFootballSquadItem = {
  team: ApiFootballIdNameLogo;
  players: ApiFootballSquadPlayer[];
};

export function getPlayerSquads(params: { team: number } | { player: number }) {
  return get<ApiFootballSquadItem[]>("/players/squads", params);
}

export function getPlayerSeasons(params: { player: number }) {
  return get<number[]>("/players/seasons", params);
}

export function getTeamsSeasons(params: { team: number }) {
  return get<number[]>("/teams/seasons", params);
}

export type GetPlayerProfilesParams = {
  player?: number;
  search?: string;
  page?: number;
};

export type ApiFootballPlayerProfile = {
  id: number;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  birth: ApiFootballPlayerBirth;
  nationality: string | null;
  height: string | null;
  weight: string | null;
  number: number | null;
  position: string | null;
  photo: string | null;
};

export type ApiFootballPlayerProfileItem = {
  player: ApiFootballPlayerProfile;
};

export function getPlayerProfiles(params?: GetPlayerProfilesParams) {
  return get<ApiFootballPlayerProfileItem[]>("/players/profiles", params);
}

export type ApiFootballPlayerTeamItem = {
  team: ApiFootballIdNameLogo;
  seasons: number[];
};

export function getPlayerTeams(params: { player: number }) {
  return get<ApiFootballPlayerTeamItem[]>("/players/teams", params);
}

export type ApiFootballTransferMove = {
  date: string | null;
  type: string | null;
  teams: {
    in: ApiFootballIdNameLogo | null;
    out: ApiFootballIdNameLogo | null;
  };
};

export type ApiFootballTransferItem = {
  player: ApiFootballIdName;
  update?: string | null;
  transfers: ApiFootballTransferMove[];
};

export interface TransferDetail {
  date: string;
  type: string; // e.g., "€45M", "Free", "Loan", "N/A"
  teams: {
    out: {
      id: number | null;
      name: string;
      logo: string;
    };
    in: {
      id: number | null;
      name: string;
      logo: string;
    };
  };
}

export interface ApiTransferResponse {
  player: {
    id: number;
    name: string;
  };
  update: string;
  transfers: TransferDetail[];
}

export function getTransfers(params: { player: number } | { team: number }) {
  return get<ApiFootballTransferItem[]>("/transfers", params);
}

export type ApiFootballCoachCareer = {
  team: ApiFootballIdNameLogo;
  start: string | null;
  end: string | null;
};

export type ApiFootballCoach = {
  id: number;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  birth: ApiFootballPlayerBirth;
  nationality: string | null;
  height: string | null;
  weight: string | null;
  photo: string | null;
  team: ApiFootballIdNameLogo | null;
  career: ApiFootballCoachCareer[];
};

export function getCoaches(
  params: { id: number } | { team: number } | { search: string },
) {
  return get<ApiFootballCoach[]>("/coachs", params);
}

export type ApiFootballTrophy = {
  league: string | null;
  country: string | null;
  season: string | null;
  place: string | null;
};

export function getTrophies(
  params:
    | { player: number }
    | { coach: number }
    | { players: string }
    | { coachs: string },
) {
  return get<ApiFootballTrophy[]>("/trophies", params);
}

export type ApiFootballSidelined = {
  type: string | null;
  start: string | null;
  end: string | null;
};

export interface SidelinedPeriod {
  type: string;
  start: string;
  end: string | null; // Can be 'Unknown' or a date string
}

export interface ApiSidelinedResponse {
  player: {
    id: number;
    name: string;
  };
  sidelined: SidelinedPeriod[];
}

export function getSidelined(
  params:
    | { player: number }
    | { coach: number }
    | { players: string }
    | { coachs: string },
) {
  return get<ApiFootballSidelined[]>("/sidelined", params);
}
