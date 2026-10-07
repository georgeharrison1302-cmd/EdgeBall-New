import "server-only";

import { notFound } from "next/navigation";

import {
  isTargetLeagueId,
  TARGET_LEAGUE_IDS,
  TARGET_SEASON_FROM,
  TARGET_SEASON_TO,
} from "@/utils/api-football/competitions";
import { cachedLogo } from "@/utils/logos";
import { loadPlayerDirectory } from "@/utils/players/directory";
import { asNumber, asRecord, isMissingRelation, nestNumber, nestText, standingSide } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

import {
  loadStandingsLenses as loadStandingsLensesFromSources,
  type StandingsLensRow,
} from "./standings-load";

export type { StandingsLensRow };

/**
 * Multi-lens standings for AdvancedTable.
 * Queries `standings`, `team_statistics`, and `player_season_stats`
 * (PYTH has no `league_table_advanced`).
 */
export async function loadStandingsLenses(
  leagueId: number,
  season: number,
  groups?: Array<{ name: string; rows: StandingRow[] }>,
) {
  return loadStandingsLensesFromSources(leagueId, season, groups);
}

export const SEASONS = Array.from(
  { length: TARGET_SEASON_TO - TARGET_SEASON_FROM + 1 },
  (_, index) => TARGET_SEASON_FROM + index,
);

export async function listSelectableSeasons(leagueId?: number) {
  const supabase = createAdminClient();
  const { data: catalog, error: catalogError } = await supabase
    .from("seasons")
    .select("year")
    .gte("year", TARGET_SEASON_FROM)
    .lte("year", TARGET_SEASON_TO)
    .order("year");
  if (catalogError) throw catalogError;
  const allowed = new Set((catalog ?? []).map((row) => Number(row.year)));
  const fallback = allowed.size === 0 ? SEASONS : SEASONS.filter((year) => allowed.has(year));

  if (leagueId == null) return fallback;
  const { data, error } = await supabase
    .from("league_seasons")
    .select("year")
    .eq("league_id", leagueId)
    .gte("year", TARGET_SEASON_FROM)
    .lte("year", TARGET_SEASON_TO)
    .order("year");
  if (error) throw error;
  const years = [...new Set((data ?? []).map((row) => Number(row.year)))].filter((year) =>
    allowed.size === 0 ? true : allowed.has(year),
  );
  return years.length > 0 ? years : fallback;
}

export function parseSeason(value: string | undefined, years: readonly number[] = SEASONS) {
  const year = Number(value);
  if (years.includes(year)) return year;
  return years[years.length - 1] ?? TARGET_SEASON_TO;
}

export type Competition = {
  id: number;
  name: string;
  country: string;
  logoUrl: string | null;
  flagUrl: string | null;
  hasTable: boolean;
};

export type StandingRow = {
  teamId: number;
  team: string;
  logoUrl: string | null;
  rank: number | null;
  played: number | null;
  win: number | null;
  draw: number | null;
  lose: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalsDiff: number | null;
  points: number | null;
  form: string | null;
  description: string | null;
  movement: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
};

export type LeaguePage = {
  id: number;
  name: string;
  country: string;
  logoUrl: string | null;
  flagUrl: string | null;
  season: number;
  standingsAvailable: boolean;
  groups: { name: string; rows: StandingRow[] }[];
  tableGoals: number | null;
  tableMatches: number | null;
  players: PlayerTotals;
};

export type PlayerTotals = {
  rows: number;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOn: number | null;
  foulsCommitted: number | null;
  foulsWon: number | null;
  yellow: number | null;
  red: number | null;
};

export type TeamStat = {
  label: string;
  value: number | string | null;
};

export type SquadPlayer = {
  id: number;
  name: string;
  photoUrl: string | null;
  number: number | null;
  position: string | null;
  line: string | null;
  age: number | null;
  injured: boolean;
};

export type TeamPage = {
  leagueId: number;
  league: string;
  season: number;
  teamId: number;
  name: string;
  code: string | null;
  founded: number | null;
  venue: string | null;
  logoUrl: string | null;
  alsoIn: Array<{ leagueId: number; name: string }>;
  standing: StandingRow | null;
  stats: TeamStat[];
  squad: SquadPlayer[];
};

export type PlayerSpell = {
  teamId: number;
  team: string;
  logoUrl: string | null;
  position: string | null;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOn: number | null;
  passes: number | null;
  keyPasses: number | null;
  passAccuracy: number | null;
  tackles: number | null;
  dribbles: number | null;
  foulsCommitted: number | null;
  foulsWon: number | null;
  yellow: number | null;
  red: number | null;
  foulsPer90: number | null;
  tacklesPer90: number | null;
  cardsPerGame: number | null;
  penaltyScored: number | null;
  penaltyMissed: number | null;
  penaltySaved: number | null;
};

export type PlayerCompetition = {
  leagueId: number;
  league: string;
  spells: PlayerSpell[];
};

export type PlayerPage = {
  leagueId: number;
  league: string;
  season: number;
  id: number;
  name: string;
  photoUrl: string | null;
  age: number | null;
  nationality: string | null;
  height: string | null;
  weight: string | null;
  injured: boolean;
  position: string | null;
  spells: PlayerSpell[];
  competitions: PlayerCompetition[];
  combined: PlayerSpell | null;
  stored: boolean;
};

type LeagueRow = {
  id: number;
  name: string;
  logo: string | null;
  country_name: string | null;
  country_flag: string | null;
};

export async function leagueTitle(leagueId: number) {
  if (!isTargetLeagueId(leagueId)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("leagues").select("name").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  return (data?.name as string | undefined) ?? null;
}

export async function listCompetitions(): Promise<Competition[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, logo, country_name, country_flag")
    .in("id", [...TARGET_LEAGUE_IDS]);
  if (error) throw error;

  const { data: tables, error: tableError } = await supabase
    .from("standings")
    .select("league_id")
    .eq("season", TARGET_SEASON_TO);
  if (tableError) throw tableError;
  const withTable = new Set((tables ?? []).map((row) => Number(row.league_id)));

  const rows = await Promise.all(
    ((data ?? []) as Array<{
      id: number;
      name: string;
      logo: string | null;
      country_name: string | null;
      country_flag: string | null;
    }>).map(async (row) => ({
      id: Number(row.id),
      name: row.name,
      country: row.country_name ?? "Other",
      logoUrl: await cachedLogo("leagues", Number(row.id), row.logo),
      flagUrl: row.country_flag ?? null,
      hasTable: withTable.has(Number(row.id)),
    })),
  );
  return rows
    .sort((left, right) => {
      const country = countryOrder(left.country) - countryOrder(right.country);
      if (country !== 0) return country;
      const name = left.country.localeCompare(right.country);
      if (name !== 0) return name;
      return left.name.localeCompare(right.name);
    });
}

const FEATURED_LEAGUE_ORDER = [39, 40, 2, 3, 140, 135, 78, 41];

export async function featuredCompetitions(limit = 8): Promise<Competition[]> {
  const competitions = await listCompetitions();
  const byId = new Map(competitions.map((competition) => [competition.id, competition]));
  const ordered = FEATURED_LEAGUE_ORDER.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  return (ordered.length > 0 ? ordered : competitions).slice(0, limit);
}

export async function loadLeague(leagueId: number, season: number): Promise<LeaguePage> {
  const league = await requireLeague(leagueId);
  const supabase = createAdminClient();
  const { data: coverage, error: coverageError } = await supabase
    .from("league_seasons")
    .select("coverage")
    .eq("league_id", leagueId)
    .eq("year", season)
    .maybeSingle();
  if (coverageError) throw coverageError;
  const { data, error } = await supabase
    .from("standings")
    .select("group_name, rank, points, goals_diff, form, status, description, all_stats, home_stats, away_stats, team_id")
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) throw error;
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const teams = await loadTeamMap(teamIds);
  const rows = await Promise.all(
    ((data ?? []) as StandingQuery[]).map(async (row) => {
      const standing = toStanding(row, teams.get(Number(row.team_id)) ?? null);
      return { ...standing, logoUrl: await cachedLogo("teams", standing.teamId, standing.logoUrl) };
    }),
  );
  const groups = groupStandings(rows);
  const players = await sumPlayers(leagueId, season);
  const played = sumNumbers(rows.map((row) => row.played));
  return {
    ...league,
    season,
    logoUrl: await cachedLogo("leagues", league.id, league.logoUrl),
    standingsAvailable: asRecord(coverage?.coverage)?.standings !== false,
    groups,
    tableGoals: sumNumbers(rows.map((row) => row.goalsFor)),
    tableMatches: played === null || played % 2 !== 0 ? null : played / 2,
    players,
  };
}

export type LeaderRow = {
  rank: number;
  playerId: number;
  name: string;
  photoUrl: string | null;
  team: string;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  yellow: number | null;
  red: number | null;
};

export type Leaderboards = {
  scorers: LeaderRow[];
  assists: LeaderRow[];
  yellow: LeaderRow[];
  red: LeaderRow[];
};

export function shotsPerGoal(shots: number | null, goals: number | null) {
  if (shots === null || goals === null || goals <= 0) return null;
  return (shots / goals).toFixed(1);
}

export type SeasonPlayer = {
  id: number;
  teamId: number;
  name: string;
  photo: string | null;
  team: string;
  apps: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  penalties: number | null;
  shots: number | null;
  shotsOn: number | null;
  foulsCommitted: number | null;
  foulsWon: number | null;
  tackles: number | null;
  yellows: number | null;
};

export async function loadPlayerSeasonStats(leagueId: number, season: number): Promise<SeasonPlayer[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("player_id, team_id, appearances, minutes, goals, assists, yellow_cards, stats_data")
    .eq("league_id", leagueId)
    .eq("season", season)
    .gt("appearances", 0)
    .limit(1000);
  if (error) throw error;
  const playerIds = [...new Set((data ?? []).map((row) => Number(row.player_id)))];
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)))];
  const [directory, { data: clubs }] = await Promise.all([
    loadPlayerDirectory(supabase, playerIds, { teamIds }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
  ]);
  const teamById = new Map((clubs ?? []).map((row) => [Number(row.id), row.name]));
  return ((data ?? []) as SeasonPlayerQuery[])
    .map((row) => {
      const identity = directory.get(row.player_id);
      return {
        id: row.player_id,
        teamId: row.team_id,
        name: identity?.name ?? `Player ${row.player_id}`,
        photo: identity?.photo ?? null,
        team: teamById.get(row.team_id) ?? "Club",
        apps: row.appearances,
        minutes: row.minutes,
        goals: row.goals,
        assists: row.assists,
        penalties: nestNumber(row.stats_data, "penalty", "scored"),
        shots: nestNumber(row.stats_data, "shots", "total"),
        shotsOn: nestNumber(row.stats_data, "shots", "on"),
        foulsCommitted: nestNumber(row.stats_data, "fouls", "committed"),
        foulsWon: nestNumber(row.stats_data, "fouls", "drawn"),
        tackles: nestNumber(row.stats_data, "tackles", "total"),
        yellows: row.yellow_cards,
      };
    })
    .sort((left, right) => (right.goals ?? -1) - (left.goals ?? -1) || left.name.localeCompare(right.name));
}

/**
 * @deprecated Prefer loadStandingsLenses + AdvancedTable.
 * Kept as a thin adapter so callers never hit the non-existent league_table_advanced relation.
 */
export type AdvancedTableRow = {
  teamId: number;
  team: string;
  logo: string | null;
  rank: number | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  points: number | null;
  cardsPerGame: number | null;
  totalYellows: number | null;
  reds: number | null;
  gfPerGame: number | null;
  cleanSheets: number | null;
  btts: number | null;
  over25: number | null;
};

/** Build advanced rows from standings + team_statistics + BTTS fixtures. Never queries league_table_advanced. */
export async function loadAdvancedTable(leagueId: number, season: number): Promise<AdvancedTableRow[]> {
  const league = await loadLeague(leagueId, season);
  const lenses = await loadStandingsLenses(leagueId, season, league.groups);
  return league.groups
    .flatMap((group) => group.rows)
    .map((row) => {
      const lens = lenses.get(row.teamId);
      return {
        teamId: row.teamId,
        team: row.team,
        logo: row.logoUrl,
        rank: row.rank,
        played: lens?.overall.played ?? row.played,
        wins: lens?.overall.win ?? row.win,
        draws: lens?.overall.draw ?? row.draw,
        losses: lens?.overall.lose ?? row.lose,
        points: lens?.overall.points ?? row.points,
        cardsPerGame: lens?.cardsPerGame ?? null,
        totalYellows: lens?.totalYellows ?? null,
        reds: lens?.reds ?? null,
        gfPerGame: lens?.gfPerGame ?? null,
        cleanSheets: lens?.cleanSheets ?? null,
        btts: lens?.bttsPct ?? null,
        over25: lens?.over25Pct ?? null,
      };
    });
}

export type TeamSheetTotals = {
  teamId: number;
  xg: number | null;
  homeXg: number | null;
  awayXg: number | null;
  xc: number | null;
  homeXc: number | null;
  awayXc: number | null;
  corners: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
};

export async function loadTeamSheetTotals(leagueId: number, season: number): Promise<TeamSheetTotals[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("team_match_sheet_totals")
    .select("team_id, xg_per_game, home_xg_per_game, away_xg_per_game, xc_per_game, home_xc_per_game, away_xc_per_game, corners_per_game, home_corners_per_game, away_corners_per_game")
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    if (row.team_id == null) return [];
    return [
      {
        teamId: row.team_id,
        xg: average(row.xg_per_game),
        homeXg: average(row.home_xg_per_game),
        awayXg: average(row.away_xg_per_game),
        xc: average(row.xc_per_game),
        homeXc: average(row.home_xc_per_game),
        awayXc: average(row.away_xc_per_game),
        corners: average(row.corners_per_game),
        homeCorners: average(row.home_corners_per_game),
        awayCorners: average(row.away_corners_per_game),
      },
    ];
  });
}

function average(value: number | null) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

type SeasonPlayerQuery = {
  player_id: number;
  team_id: number;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  stats_data: unknown;
};

export async function loadLeaders(leagueId: number, season: number): Promise<Leaderboards> {
  const [scorers, assists, yellow, red] = await Promise.all([
    loadTopTable(leagueId, season, "top_scorers", "goals", "assists"),
    loadTopTable(leagueId, season, "top_assists", "assists", "goals"),
    loadTopTable(leagueId, season, "top_yellow_cards", "yellow", "red"),
    loadTopTable(leagueId, season, "top_red_cards", "red", "yellow"),
  ]);
  return { scorers, assists, yellow, red };
}

async function loadTopTable(
  leagueId: number,
  season: number,
  table: "top_scorers" | "top_assists" | "top_yellow_cards" | "top_red_cards",
  primary: "goals" | "assists" | "yellow" | "red",
  secondary: "goals" | "assists" | "yellow" | "red",
): Promise<LeaderRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("league_id", leagueId)
    .eq("season", season)
    .order("rank")
    .limit(20);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row, index) => topRow(row, index, primary, secondary));
}

function topRow(
  row: Record<string, unknown>,
  index: number,
  primary: "goals" | "assists" | "yellow" | "red",
  secondary: "goals" | "assists" | "yellow" | "red",
): LeaderRow {
  return {
    rank: asNumber(row.rank) ?? index + 1,
    playerId: asNumber(row.player_id) ?? 0,
    name: typeof row.player_name === "string" ? row.player_name : "Player",
    photoUrl: typeof row.photo === "string" ? row.photo : null,
    team: typeof row.team_name === "string" ? row.team_name : "Club",
    goals: primary === "goals" || secondary === "goals" ? asNumber(row.goals) : null,
    assists: primary === "assists" || secondary === "assists" ? asNumber(row.assists) : null,
    shots: null,
    yellow: primary === "yellow" || secondary === "yellow" ? asNumber(row.yellow) : null,
    red: primary === "red" || secondary === "red" ? asNumber(row.red) : null,
  };
}

function venueLabel(
  venue: { name: string | null; city: string | null } | { name: string | null; city: string | null }[] | null,
) {
  const row = Array.isArray(venue) ? venue[0] : venue;
  if (!row?.name) return null;
  return row.city ? `${row.name}, ${row.city}` : row.name;
}

export async function loadTeam(
  leagueId: number,
  teamId: number,
  season: number,
  asOf?: string | null,
): Promise<TeamPage> {
  const league = await requireLeague(leagueId);
  const supabase = createAdminClient();
  const statsQuery = supabase
    .from("team_statistics")
    .select("stats")
    .eq("league_id", leagueId)
    .eq("season", season)
    .eq("team_id", teamId);
  const [{ data: team, error: teamError }, { data: standing, error: standingError }, { data: stats, error: statsError }, { data: alsoRows, error: alsoError }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, code, founded, logo, venue:venues!venue_id(name, city)")
        .eq("id", teamId)
        .maybeSingle(),
      supabase
        .from("standings")
        .select("group_name, rank, points, goals_diff, form, status, description, all_stats, home_stats, away_stats, team_id")
        .eq("league_id", leagueId)
        .eq("season", season)
        .eq("team_id", teamId)
        .order("rank")
        .limit(1),
      statsQuery.limit(1),
      supabase
        .from("team_seasons")
        .select("league_id, league:leagues!league_id(name)")
        .eq("team_id", teamId)
        .eq("season", season)
        .neq("league_id", leagueId),
    ]);
  if (teamError) throw teamError;
  if (standingError) throw standingError;
  if (statsError) throw statsError;
  if (alsoError) throw alsoError;
  if (!team) notFound();
  const standingRow = (Array.isArray(standing) ? standing[0] : standing) ?? null;
  const statsRow = (Array.isArray(stats) ? stats[0] : stats) ?? null;

  const inLeague = Boolean(standingRow || statsRow);
  if (!inLeague) {
    const { data: membership, error } = await supabase
      .from("team_seasons")
      .select("team_id")
      .eq("league_id", leagueId)
      .eq("season", season)
      .eq("team_id", teamId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) notFound();
  }

  const { data: squadRows, error: squadError } = await supabase
    .from("team_squads")
    .select("player_id, player_name, photo, number, position, age")
    .eq("team_id", teamId);
  if (squadError) throw squadError;

  const squad = ((squadRows ?? []) as SquadQuery[]).map(toSquadPlayer).filter((player) => player.id > 0);
  const playerIds = squad.map((player) => player.id);
  if (playerIds.length > 0) {
    const { data: seasons, error } = await supabase
      .from("player_season_stats")
      .select("player_id, appearances, goals, assists")
      .eq("league_id", leagueId)
      .eq("season", season)
      .eq("team_id", teamId)
      .in("player_id", playerIds);
    if (error) throw error;
    const lines = new Map(
      ((seasons ?? []) as SeasonLine[]).map((row) => [Number(row.player_id), seasonLine(row)]),
    );
    for (const player of squad) player.line = lines.get(player.id) ?? null;
  }
  squad.sort(compareSquad);

  return {
    leagueId,
    league: league.name,
    season,
    teamId,
    name: team.name,
    code: team.code,
    founded: team.founded,
    venue: venueLabel(team.venue),
    logoUrl: await cachedLogo("teams", teamId, team.logo),
    alsoIn: ((alsoRows ?? []) as Array<{ league_id: number; league: { name: string } | null }>)
      .filter((row) => row.league?.name)
      .map((row) => ({ leagueId: Number(row.league_id), name: row.league?.name ?? "" })),
    standing: standingRow
      ? toStanding(standingRow as StandingQuery, {
          id: teamId,
          name: team.name,
          logo: team.logo,
        })
      : null,
    stats: teamStats(nestText(statsRow?.stats, "form"), statsRow?.stats),
    squad,
  };
}

export async function loadPlayer(
  leagueId: number,
  playerId: number,
  season: number,
): Promise<PlayerPage> {
  const league = await requireLeague(leagueId);
  const supabase = createAdminClient();
  const [{ data: player, error }, { data: profile }, directory, { data: seasons, error: seasonError }] =
    await Promise.all([
      supabase.from("players").select("id, name, photo, age, position").eq("id", playerId).maybeSingle(),
      supabase
        .from("player_profiles")
        .select("name, photo, nationality, height, weight, age")
        .eq("player_id", playerId)
        .maybeSingle(),
      loadPlayerDirectory(supabase, [playerId]),
      supabase
        .from("player_season_stats")
        .select(
          "league_id, team_id, appearances, minutes, goals, assists, yellow_cards, red_cards, stats_data",
        )
        .eq("season", season)
        .eq("player_id", playerId),
    ]);
  if (error) throw error;
  if (seasonError) throw seasonError;

  const identity = directory.get(playerId);
  const resolvedName =
    (typeof player?.name === "string" && player.name.trim() ? player.name : null) ??
    (typeof profile?.name === "string" && profile.name.trim() ? profile.name : null) ??
    (identity && identity.name !== `Player ${playerId}` ? identity.name : null);
  const resolvedPhoto =
    (typeof player?.photo === "string" && player.photo ? player.photo : null) ??
    (typeof profile?.photo === "string" && profile.photo ? profile.photo : null) ??
    identity?.photo ??
    null;

  const leagueIds = [...new Set((seasons ?? []).map((row) => Number(row.league_id)))];
  const teamIds = [...new Set((seasons ?? []).map((row) => Number(row.team_id)))];
  const [{ data: leagueRows }, teamMap] = await Promise.all([
    leagueIds.length ? supabase.from("leagues").select("id, name").in("id", leagueIds) : Promise.resolve({ data: [] }),
    loadTeamMap(teamIds),
  ]);
  const leagueById = new Map((leagueRows ?? []).map((row) => [Number(row.id), row.name as string]));
  const spellRows = ((seasons ?? []) as Array<{
    league_id: number;
    team_id: number;
    appearances: number | null;
    minutes: number | null;
    goals: number | null;
    assists: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    stats_data: unknown;
  }>).map((row) =>
    spellFromSeason({
      ...row,
      league: { id: row.league_id, name: leagueById.get(row.league_id) ?? "Competition" },
      team: teamMap.get(row.team_id) ?? null,
    }),
  );
  const competitions = groupPlayerCompetitions(spellRows, leagueId);
  const spells = competitions.find((competition) => competition.leagueId === leagueId)?.spells ?? [];
  const blocks = competitions.flatMap((competition) => competition.spells);
  const profilePlayer = {
    id: playerId,
    name: resolvedName ?? `Player ${playerId}`,
    photo_url: resolvedPhoto,
    age: player?.age ?? (typeof profile?.age === "number" ? profile.age : null),
    nationality: profile?.nationality ?? null,
    height: profile?.height ?? null,
    weight: profile?.weight ?? null,
    injured: false,
  };

  // Known via season stats for this league/season — show even if players row is missing.
  if (spells.length > 0) {
    return {
      ...playerProfile(profilePlayer, league, season, spells[0]?.position ?? player?.position ?? null),
      spells,
      competitions,
      combined: blocks.length > 1 ? combineSpells(blocks) : null,
      stored: true,
    };
  }

  if (!player && !profile && !resolvedName) notFound();

  const { data: squad, error: squadError } = await supabase
    .from("team_squads")
    .select("position, team_id")
    .eq("player_id", playerId);
  if (squadError) throw squadError;
  const squadTeamIds = [...new Set(((squad ?? []) as Array<{ team_id: number | null }>).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const squadTeams = await loadTeamMap(squadTeamIds);
  const clubs = ((squad ?? []) as Array<{ position: string | null; team_id: number | null }>).map((row) => ({
    teamId: Number(row.team_id) || 0,
    position: row.position,
    team: squadTeams.get(Number(row.team_id)) ?? null,
  }));
  const clubIds = clubs.map((club) => club.teamId).filter((id) => id > 0);
  if (clubIds.length === 0) notFound();

  const { data: membership, error: memberError } = await supabase
    .from("team_seasons")
    .select("team_id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("team_id", clubIds);
  if (memberError) throw memberError;
  const allowed = new Set((membership ?? []).map((row) => Number(row.team_id)));
  const inLeague = clubs.filter((club) => allowed.has(club.teamId));
  if (inLeague.length === 0) notFound();

  return {
    ...playerProfile(profilePlayer, league, season, inLeague[0]?.position ?? player?.position ?? null),
    spells: [],
    competitions,
    combined: null,
    stored: false,
  };
}

function playerProfile(
  player: {
    id: number;
    name: string | null;
    photo_url: string | null;
    age: number | null;
    nationality: string | null;
    height: string | null;
    weight: string | null;
    injured: boolean | null;
  },
  league: { id: number; name: string },
  season: number,
  position: string | null,
): Omit<PlayerPage, "spells" | "competitions" | "combined" | "stored"> {
  return {
    leagueId: league.id,
    league: league.name,
    season,
    id: player.id,
    name: player.name ?? "Player",
    photoUrl: player.photo_url,
    age: player.age,
    nationality: player.nationality,
    height: player.height,
    weight: player.weight,
    injured: player.injured === true,
    position,
  };
}

async function requireLeague(leagueId: number) {
  if (!isTargetLeagueId(leagueId)) notFound();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, logo, country_name, country_flag")
    .eq("id", leagueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return {
    id: Number(data.id),
    name: data.name as string,
    country: (data.country_name as string | null) ?? "Other",
    logoUrl: data.logo as string | null,
    flagUrl: (data.country_flag as string | null) ?? null,
  };
}

async function sumPlayers(leagueId: number, season: number): Promise<PlayerTotals> {
  const supabase = createAdminClient();
  const totals: PlayerTotals = {
    rows: 0,
    goals: null,
    assists: null,
    shots: null,
    shotsOn: null,
    foulsCommitted: null,
    foulsWon: null,
    yellow: null,
    red: null,
  };
  const buckets = {
    goals: [] as Array<number | null>,
    assists: [] as Array<number | null>,
    shots: [] as Array<number | null>,
    shotsOn: [] as Array<number | null>,
    foulsCommitted: [] as Array<number | null>,
    foulsWon: [] as Array<number | null>,
    yellow: [] as Array<number | null>,
    red: [] as Array<number | null>,
  };

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("goals, assists, yellow_cards, red_cards, stats_data")
      .eq("league_id", leagueId)
      .eq("season", season)
      .range(from, from + 999);
    if (error) throw error;
    const rows = data ?? [];
    totals.rows += rows.length;
    for (const row of rows) {
      buckets.goals.push(row.goals);
      buckets.assists.push(row.assists);
      buckets.shots.push(nestNumber(row.stats_data, "shots", "total"));
      buckets.shotsOn.push(nestNumber(row.stats_data, "shots", "on"));
      buckets.foulsCommitted.push(nestNumber(row.stats_data, "fouls", "committed"));
      buckets.foulsWon.push(nestNumber(row.stats_data, "fouls", "drawn"));
      buckets.yellow.push(row.yellow_cards);
      buckets.red.push(row.red_cards);
    }
    if (rows.length < 1000) break;
  }

  totals.goals = sumNumbers(buckets.goals);
  totals.assists = sumNumbers(buckets.assists);
  totals.shots = sumNumbers(buckets.shots);
  totals.shotsOn = sumNumbers(buckets.shotsOn);
  totals.foulsCommitted = sumNumbers(buckets.foulsCommitted);
  totals.foulsWon = sumNumbers(buckets.foulsWon);
  totals.yellow = sumNumbers(buckets.yellow);
  totals.red = sumNumbers(buckets.red);
  return totals;
}

function groupStandings(rows: Array<StandingRow & { group: string }>) {
  const groups = new Map<string, StandingRow[]>();
  const sorted = [...rows].sort((left, right) => {
    const group = left.group.localeCompare(right.group);
    if (group !== 0) return left.group === "" ? -1 : right.group === "" ? 1 : group;
    if (left.rank === null) return 1;
    if (right.rank === null) return -1;
    return left.rank - right.rank;
  });
  for (const row of sorted) {
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }
  return [...groups.entries()].map(([name, groupRows]) => ({ name, rows: groupRows }));
}

type TeamEmbed = { id: number; name: string; logo: string | null };

async function loadTeamMap(ids: number[]) {
  const teams = new Map<number, TeamEmbed>();
  if (ids.length === 0) return teams;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("teams").select("id, name, logo").in("id", ids);
  if (error) throw error;
  for (const row of data ?? []) {
    teams.set(Number(row.id), { id: Number(row.id), name: row.name, logo: row.logo });
  }
  return teams;
}

type StandingQuery = {
  team_id?: number | null;
  group_name: string | null;
  rank: number | null;
  points: number | null;
  goals_diff: number | null;
  form: string | null;
  status: string | null;
  description: string | null;
  all_stats: unknown;
  home_stats: unknown;
  away_stats: unknown;
};

function toStanding(row: StandingQuery, team: TeamEmbed | null): StandingRow & { group: string } {
  return {
    group: row.group_name ?? "",
    teamId: team?.id ?? Number(row.team_id) ?? 0,
    team: team?.name ?? "Team",
    logoUrl: team?.logo ?? null,
    rank: row.rank,
    played: standingSide(row.all_stats).played,
    win: standingSide(row.all_stats).win,
    draw: standingSide(row.all_stats).draw,
    lose: standingSide(row.all_stats).lose,
    goalsFor: standingSide(row.all_stats).goalsFor,
    goalsAgainst: standingSide(row.all_stats).goalsAgainst,
    goalsDiff: row.goals_diff,
    points: row.points,
    form: row.form,
    description: row.description,
    movement: row.status,
    homeRecord: recordLine(standingSide(row.home_stats).win, standingSide(row.home_stats).draw, standingSide(row.home_stats).lose),
    awayRecord: recordLine(standingSide(row.away_stats).win, standingSide(row.away_stats).draw, standingSide(row.away_stats).lose),
  };
}

function recordLine(win: number | null, draw: number | null, lose: number | null) {
  if (win === null && draw === null && lose === null) return null;
  return `${win ?? 0}-${draw ?? 0}-${lose ?? 0}`;
}

type SquadQuery = {
  player_id: number | null;
  player_name: string | null;
  photo: string | null;
  number: number | null;
  position: string | null;
  age: number | null;
};

function toSquadPlayer(row: SquadQuery): SquadPlayer {
  return {
    id: row.player_id ?? 0,
    name: row.player_name ?? "Player",
    photoUrl: row.photo ?? null,
    number: row.number,
    position: row.position,
    line: null,
    age: row.age,
    injured: false,
  };
}

type SeasonLine = {
  player_id: number;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
};

function seasonLine(row: SeasonLine) {
  const parts = [
    row.appearances === null ? null : `${row.appearances} apps`,
    row.goals === null ? null : `${row.goals} goals`,
    row.assists === null ? null : `${row.assists} assists`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];

function positionRank(position: string | null) {
  const index = POSITION_ORDER.indexOf(position ?? "");
  return index === -1 ? POSITION_ORDER.length : index;
}

function compareSquad(left: SquadPlayer, right: SquadPlayer) {
  const position = positionRank(left.position) - positionRank(right.position);
  if (position !== 0) return position;
  return (left.number ?? 999) - (right.number ?? 999) || left.name.localeCompare(right.name);
}

function teamStats(form: string | null, payload: unknown): TeamStat[] {
  const body = asRecord(payload);
  const fixtures = asRecord(body?.fixtures);
  const played = asRecord(fixtures?.played);
  const wins = asRecord(fixtures?.wins);
  const draws = asRecord(fixtures?.draws);
  const losses = asRecord(fixtures?.loses);
  const goalsFor = asRecord(asRecord(asRecord(body?.goals)?.for)?.total);
  const goalsAgainst = asRecord(asRecord(asRecord(body?.goals)?.against)?.total);
  const cleanSheet = asRecord(body?.clean_sheet);
  const failed = asRecord(body?.failed_to_score);
  const cards = asRecord(body?.cards);
  const biggest = asRecord(body?.biggest);
  return [
    { label: "Form", value: form },
    splitStat("Played", played),
    splitStat("Won", wins),
    splitStat("Drawn", draws),
    splitStat("Lost", losses),
    splitStat("Goals for", goalsFor),
    splitStat("Goals against", goalsAgainst),
    splitStat("Clean sheets", cleanSheet),
    splitStat("Failed to score", failed),
    { label: "Biggest win", value: resultLine(asRecord(biggest?.wins)) },
    { label: "Heaviest defeat", value: resultLine(asRecord(biggest?.loses)) },
    { label: "Yellow cards", value: cardTotal(cards?.yellow) },
    { label: "Red cards", value: cardTotal(cards?.red) },
  ];
}

function splitStat(label: string, bucket: Record<string, unknown> | null): TeamStat {
  if (!bucket) return { label, value: null };
  const total = asNumber(bucket.total);
  const home = asNumber(bucket.home);
  const away = asNumber(bucket.away);
  const parts = [
    total === null ? null : String(total),
    home === null ? null : `home ${home}`,
    away === null ? null : `away ${away}`,
  ].filter((part): part is string => part !== null);
  return { label, value: parts.length > 0 ? parts.join(" · ") : null };
}

function resultLine(bucket: Record<string, unknown> | null) {
  if (!bucket) return null;
  const home = typeof bucket.home === "string" && bucket.home !== "" ? `home ${bucket.home}` : null;
  const away = typeof bucket.away === "string" && bucket.away !== "" ? `away ${bucket.away}` : null;
  const parts = [home, away].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function cardTotal(value: unknown) {
  const buckets = asRecord(value);
  if (!buckets) return null;
  let sum = 0;
  let any = false;
  for (const bucket of Object.values(buckets)) {
    const total = asNumber(asRecord(bucket)?.total);
    if (total === null) continue;
    sum += total;
    any = true;
  }
  return any ? sum : null;
}

type SpellQuery = {
  league_id: number;
  position: string | null;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shots_total: number | null;
  shots_on: number | null;
  passes_total: number | null;
  passes_key: number | null;
  passes_accuracy: number | null;
  tackles: number | null;
  dribbles_success: number | null;
  fouls_committed: number | null;
  fouls_drawn: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  penalty_scored: number | null;
  penalty_missed: number | null;
  penalty_saved: number | null;
  league: { id: number; name: string | null } | Array<{ id: number; name: string | null }> | null;
  team: TeamEmbed | TeamEmbed[] | null;
};

function spellFromSeason(row: {
  league_id: number;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  stats_data: unknown;
  league: { id: number; name: string | null } | { id: number; name: string | null }[] | null;
  team: TeamEmbed | TeamEmbed[] | null;
}): SpellQuery {
  return {
    league_id: row.league_id,
    position: nestText(row.stats_data, "games", "position"),
    appearances: row.appearances,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,
    shots_total: nestNumber(row.stats_data, "shots", "total"),
    shots_on: nestNumber(row.stats_data, "shots", "on"),
    passes_total: nestNumber(row.stats_data, "passes", "total"),
    passes_key: nestNumber(row.stats_data, "passes", "key"),
    passes_accuracy: nestNumber(row.stats_data, "passes", "accuracy"),
    tackles: nestNumber(row.stats_data, "tackles", "total"),
    dribbles_success: nestNumber(row.stats_data, "dribbles", "success"),
    fouls_committed: nestNumber(row.stats_data, "fouls", "committed"),
    fouls_drawn: nestNumber(row.stats_data, "fouls", "drawn"),
    yellow_cards: row.yellow_cards,
    red_cards: row.red_cards,
    penalty_scored: nestNumber(row.stats_data, "penalty", "scored"),
    penalty_missed: nestNumber(row.stats_data, "penalty", "missed"),
    penalty_saved: nestNumber(row.stats_data, "penalty", "saved"),
    league: row.league,
    team: row.team,
  };
}

function toSpell(row: SpellQuery): PlayerSpell {
  const team = one(row.team);
  return {
    teamId: team?.id ?? 0,
    team: team?.name ?? "Club",
    logoUrl: team?.logo ?? null,
    position: row.position,
    appearances: row.appearances,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,
    shots: row.shots_total,
    shotsOn: row.shots_on,
    passes: row.passes_total,
    keyPasses: row.passes_key,
    passAccuracy: row.passes_accuracy,
    tackles: row.tackles,
    dribbles: row.dribbles_success,
    foulsCommitted: row.fouls_committed,
    foulsWon: row.fouls_drawn,
    yellow: row.yellow_cards,
    red: row.red_cards,
    foulsPer90: per90(row.fouls_committed, row.minutes),
    tacklesPer90: per90(row.tackles, row.minutes),
    cardsPerGame: perGameRate((row.yellow_cards ?? 0) + (row.red_cards ?? 0), row.appearances),
    penaltyScored: row.penalty_scored,
    penaltyMissed: row.penalty_missed,
    penaltySaved: row.penalty_saved,
  };
}

function groupPlayerCompetitions(rows: SpellQuery[], leagueId: number): PlayerCompetition[] {
  const groups = new Map<number, PlayerCompetition>();
  for (const row of rows) {
    const league = one(row.league);
    const id = Number(row.league_id);
    const current = groups.get(id) ?? { leagueId: id, league: league?.name ?? "Competition", spells: [] };
    current.spells.push(toSpell(row));
    groups.set(id, current);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.leagueId === leagueId) return -1;
    if (right.leagueId === leagueId) return 1;
    return left.league.localeCompare(right.league);
  });
}

function combineSpells(spells: PlayerSpell[]): PlayerSpell {
  return {
    teamId: 0,
    team: "All competitions",
    logoUrl: null,
    position: spells.find((spell) => spell.position)?.position ?? null,
    appearances: sumNumbers(spells.map((spell) => spell.appearances)),
    minutes: sumNumbers(spells.map((spell) => spell.minutes)),
    goals: sumNumbers(spells.map((spell) => spell.goals)),
    assists: sumNumbers(spells.map((spell) => spell.assists)),
    shots: sumNumbers(spells.map((spell) => spell.shots)),
    shotsOn: sumNumbers(spells.map((spell) => spell.shotsOn)),
    passes: sumNumbers(spells.map((spell) => spell.passes)),
    keyPasses: sumNumbers(spells.map((spell) => spell.keyPasses)),
    passAccuracy: null,
    tackles: sumNumbers(spells.map((spell) => spell.tackles)),
    dribbles: sumNumbers(spells.map((spell) => spell.dribbles)),
    foulsCommitted: sumNumbers(spells.map((spell) => spell.foulsCommitted)),
    foulsWon: sumNumbers(spells.map((spell) => spell.foulsWon)),
    yellow: sumNumbers(spells.map((spell) => spell.yellow)),
    red: sumNumbers(spells.map((spell) => spell.red)),
    foulsPer90: per90(sumNumbers(spells.map((spell) => spell.foulsCommitted)), sumNumbers(spells.map((spell) => spell.minutes))),
    tacklesPer90: per90(sumNumbers(spells.map((spell) => spell.tackles)), sumNumbers(spells.map((spell) => spell.minutes))),
    cardsPerGame: perGameRate(
      (sumNumbers(spells.map((spell) => spell.yellow)) ?? 0) + (sumNumbers(spells.map((spell) => spell.red)) ?? 0),
      sumNumbers(spells.map((spell) => spell.appearances)),
    ),
    penaltyScored: sumNumbers(spells.map((spell) => spell.penaltyScored)),
    penaltyMissed: sumNumbers(spells.map((spell) => spell.penaltyMissed)),
    penaltySaved: sumNumbers(spells.map((spell) => spell.penaltySaved)),
  };
}

type SquadClubQuery = {
  position: string | null;
  team: TeamEmbed | TeamEmbed[] | null;
};

function sumNumbers(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0);
}

function per90(total: number | null | undefined, minutes: number | null | undefined) {
  if (total == null || minutes == null || minutes < 1) return null;
  return (total * 90) / minutes;
}

function perGameRate(total: number | null | undefined, appearances: number | null | undefined) {
  if (total == null || appearances == null || appearances < 1) return null;
  return total / appearances;
}

function countryOrder(country: string) {
  if (country === "World") return 1;
  return 0;
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
