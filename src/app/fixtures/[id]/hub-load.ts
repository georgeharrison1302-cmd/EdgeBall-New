import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";

import type {
  TaleOfTheTapeData,
  TapeLeader,
} from "@/components/MatchHub/TaleOfTheTape";
import { buildKeyMatchups } from "@/lib/matchups/collisions";
import { matchMarketPrices } from "@/lib/odds/match-markets";
import { isSupportedPlayerPropLine } from "@/lib/odds/prop-line-policy";
import { evaluateFixtureFactors } from "@/lib/factors/evaluator";
import { loadFixtureFactorInput } from "@/lib/factors/load-input";
import type { FactorEvaluation } from "@/lib/factors/types";
import {
  formCategoryForMarket,
  lastFiveOutcomes,
  type FormOutcome,
  type PlayerMatchLogRow,
} from "@/lib/stats/last-five";
import {
  BET365_BOOKMAKER_ID,
  PREMATCH_PLAYER_CARD_BET_IDS,
  PREMATCH_PLAYER_PROP_BET_IDS,
  prematchBets,
} from "@/utils/api-football/bet-catalogs";
import { cachedLogo } from "@/utils/logos";
import {
  betsFromOddsData,
  latestOddsSnapshots,
  type StoredOddsRow,
} from "@/utils/odds-api-io/stored";
import {
  buildSquadNameIndex,
  parsePlayerPropValue,
  resolvePlayerId,
  type SquadNameEntry,
} from "@/utils/odds/player-prop-value";
import { asNumber, isMissingRelation, nestNumber } from "@/utils/pyth";
import { cleanPersonName } from "@/utils/text/html-entities";
import { createIngestClient } from "@/utils/supabase/admin";
import {
  buildGameScript,
  buildMatchClash,
  loadTeamFoulRates,
  loadTeamSheetContext,
  loadTeamYellowRates,
} from "@/utils/stats/discipline";
import { loadRefereeRates, lookupReferee, normalizeReferee, type StrictRef } from "@/utils/stats/referees";

export type MatchHubTeam = {
  id: number;
  name: string;
  logo: string | null;
};

export type MatchHubOdds = {
  home: number | null;
  draw: number | null;
  away: number | null;
  bttsYes: number | null;
  bttsNo: number | null;
  over25: number | null;
  under25: number | null;
};

export type FoulCollision = {
  homeCommitted: number | null;
  awayDrawn: number | null;
  awayCommitted: number | null;
  homeDrawn: number | null;
};

export type PropMarketKey = "cards" | "sot" | "fouls" | "goals" | "other";

export type PropBoardRow = {
  playerId: number;
  player: string;
  teamId: number;
  team: string;
  teamLogo: string | null;
  matchup: string;
  market: string;
  marketKey: PropMarketKey;
  /** Integer clear-line from the book (1 => Over 0.5); null for cards/goalscorers. */
  line: number | null;
  odd: number | null;
  modelProb: number | null;
  edgePct: number | null;
  appearances: number | null;
  yellows: number | null;
  goals: number | null;
  foulsPer90: number | null;
  tacklesPer90: number | null;
  sotPer90: number | null;
  /** Oldest → newest last-5 outcomes from fixture_player_statistics. */
  lastFive: FormOutcome[];
};

/** @deprecated Use PropBoardRow — kept for any lingering imports. */
export type CardPropRow = PropBoardRow;

export type MatchHubPage = {
  id: number;
  competition: string;
  leagueId: number;
  season: number;
  kickoff: string;
  kickoffAt: string | null;
  status: string | null;
  score: { home: number; away: number } | null;
  venue: string | null;
  referee: string | null;
  home: MatchHubTeam;
  away: MatchHubTeam;
  odds: MatchHubOdds;
  refereeProfile: StrictRef | null;
  foulCollision: FoulCollision;
  homeYellowsPerGame: number | null;
  awayYellowsPerGame: number | null;
  clash: { playerRate: number; opponentRate: number; label: string } | null;
  gameScript: { label: string; detail: string } | null;
  propBoard: PropBoardRow[];
  /** Triggered + unevaluated factors from evaluateFixtureFactors. */
  factors: FactorEvaluation[];
  taleOfTheTape: TaleOfTheTapeData;
};

type SeasonStatRow = {
  player_id: number;
  team_id: number;
  appearances: number | null;
  minutes: number | null;
  yellow_cards: number | null;
  goals: number | null;
  stats_data: unknown;
};

export const loadMatchHubPage = cache(async function loadMatchHubPage(
  fixtureId: number,
): Promise<MatchHubPage> {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, home_goals, away_goals, referee, league_id, season, venue_id, home_team_id, away_team_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();

  const homeId = Number(data.home_team_id);
  const awayId = Number(data.away_team_id);
  const leagueId = Number(data.league_id);
  const season = Number(data.season);
  const referee = normalizeReferee(data.referee);
  if (!Number.isInteger(homeId) || !Number.isInteger(awayId)) notFound();

  const [{ data: teams }, venueResult, { data: league }, { data: oddsRows }, refs] = await Promise.all([
    supabase.from("teams").select("id, name, logo").in("id", [homeId, awayId]),
    data.venue_id
      ? supabase.from("venues").select("name, city").eq("id", data.venue_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("leagues").select("name").eq("id", data.league_id).maybeSingle(),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at, model_prob, edge_pct")
      .eq("fixture_id", fixtureId)
      .eq("bookmaker_id", BET365_BOOKMAKER_ID)
      .order("updated_at", { ascending: false })
      .limit(1),
    loadRefereeRates(referee ? [referee] : [], { leagueId, season }),
  ]);
  if (venueResult.error) throw venueResult.error;

  const homeRow = (teams ?? []).find((team) => Number(team.id) === homeId);
  const awayRow = (teams ?? []).find((team) => Number(team.id) === awayId);
  if (!homeRow || !awayRow) notFound();

  const home: MatchHubTeam = {
    id: homeId,
    name: homeRow.name,
    logo: await cachedLogo("teams", homeId, homeRow.logo),
  };
  const away: MatchHubTeam = {
    id: awayId,
    name: awayRow.name,
    logo: await cachedLogo("teams", awayId, awayRow.logo),
  };

  const oddsRow = latestOddsSnapshots((oddsRows ?? []) as StoredOddsRow[])[0] as
    | (StoredOddsRow & { model_prob?: number | null; edge_pct?: number | null })
    | undefined;
  const odds: MatchHubOdds = matchMarketPrices(oddsRow?.odds_data);

  const yellowScopes = [
    { teamId: homeId, leagueId, season },
    { teamId: awayId, leagueId, season },
  ];

  const [foulRates, propBoard, cardRates, sheets, factorInput, taleOfTheTape] =
    await Promise.all([
      loadTeamFoulRates(homeId, awayId, leagueId, season),
      loadPropBoard(
        home,
        away,
        leagueId,
        season,
        oddsRow?.odds_data,
        asNumber(oddsRow?.model_prob),
        asNumber(oddsRow?.edge_pct),
      ),
      loadTeamYellowRates(yellowScopes),
      loadTeamSheetContext(yellowScopes),
      loadFixtureFactorInput(fixtureId),
      loadTaleOfTheTape(home, away, leagueId, season),
    ]);

  const foulCollision: FoulCollision = {
    homeCommitted: foulRates.home.committedPerGame,
    awayDrawn: foulRates.away.drawnPerGame,
    awayCommitted: foulRates.away.committedPerGame,
    homeDrawn: foulRates.home.drawnPerGame,
  };
  const homeKey = `${homeId}:${leagueId}:${season}`;
  const awayKey = `${awayId}:${leagueId}:${season}`;
  const homeYellows = cardRates.get(homeKey) ?? null;
  const awayYellows = cardRates.get(awayKey) ?? null;

  const kickoffMs = data.date ? Date.parse(String(data.date)) : Number.NaN;
  const venue = venueResult.data;
  return {
    id: fixtureId,
    competition: league?.name ?? "Competition",
    leagueId,
    season,
    kickoff: formatKickoff(data.date),
    kickoffAt: Number.isFinite(kickoffMs) ? new Date(kickoffMs).toISOString() : null,
    status: data.status_short,
    score:
      data.home_goals != null && data.away_goals != null
        ? { home: Number(data.home_goals), away: Number(data.away_goals) }
        : null,
    venue: venue ? [venue.name, venue.city].filter(Boolean).join(", ") : null,
    referee,
    home,
    away,
    odds,
    refereeProfile: lookupReferee(refs, referee),
    foulCollision,
    homeYellowsPerGame: homeYellows,
    awayYellowsPerGame: awayYellows,
    clash: buildMatchClash(foulRates.home, foulRates.away),
    gameScript: buildGameScript({
      homeName: home.name,
      awayName: away.name,
      homeYellows,
      awayYellows,
      homeSheet: sheets.get(homeKey) ?? null,
      awaySheet: sheets.get(awayKey) ?? null,
    }),
    propBoard,
    factors: factorInput
      ? evaluateFixtureFactors(fixtureId, factorInput)
      : [],
    taleOfTheTape,
  };
});

async function loadPropBoard(
  home: MatchHubTeam,
  away: MatchHubTeam,
  leagueId: number,
  season: number,
  oddsData: unknown,
  rowModel: number | null,
  rowEdge: number | null,
): Promise<PropBoardRow[]> {
  const teamIds = [home.id, away.id];
  const matchup = `${home.name} vs ${away.name}`;
  const supabase = createIngestClient();

  // Load full squads first so name-line markets (no player_id) can resolve.
  const { data: squads, error: squadError } = await supabase
    .from("team_squads")
    .select("player_id, team_id, player_name")
    .in("team_id", teamIds);
  if (squadError) throw squadError;

  const squadEntries: SquadNameEntry[] = (squads ?? []).map((row) => ({
    playerId: Number(row.player_id),
    teamId: Number(row.team_id),
    name: cleanPersonName(row.player_name),
  }));
  const nameIndex = buildSquadNameIndex(squadEntries);

  const values = propValues(oddsData, nameIndex, rowModel, rowEdge);
  if (values.length === 0) return [];

  const playerIds = [...new Set(values.map((value) => value.playerId))];
  const [{ data: profiles }, { data: stats }] = await Promise.all([
    supabase.from("player_profiles").select("player_id, name").in("player_id", playerIds),
    supabase
      .from("player_season_stats")
      .select("player_id, team_id, appearances, minutes, yellow_cards, goals, stats_data")
      .eq("league_id", leagueId)
      .eq("season", season)
      .in("player_id", playerIds)
      .in("team_id", teamIds),
  ]);

  const profileById = new Map((profiles ?? []).map((row) => [Number(row.player_id), row]));
  const squadByPlayer = new Map(squadEntries.map((row) => [row.playerId, row]));
  const statsByPlayer = new Map<number, SeasonStatRow>();
  for (const row of (stats ?? []) as SeasonStatRow[]) {
    const playerId = Number(row.player_id);
    const previous = statsByPlayer.get(playerId);
    if (!previous || Number(row.appearances) > Number(previous.appearances)) statsByPlayer.set(playerId, row);
  }

  const rows: PropBoardRow[] = values.map((value) => {
    const profile = profileById.get(value.playerId);
    const squad = squadByPlayer.get(value.playerId);
    const seasonRow = statsByPlayer.get(value.playerId);
    const teamId = Number(seasonRow?.team_id ?? squad?.teamId ?? home.id);
    const team = teamId === away.id ? away : home;
    const apps = Number(seasonRow?.appearances) || 0;
    const rawMinutes = Number(seasonRow?.minutes) || nestNumber(seasonRow?.stats_data, "games", "minutes") || 0;
    const minutes = apps > 0 && rawMinutes >= apps * 45 ? rawMinutes : apps > 0 ? apps * 90 : 0;
    const fouls = nestNumber(seasonRow?.stats_data, "fouls", "committed");
    const tackles = nestNumber(seasonRow?.stats_data, "tackles", "total");
    const sot = nestNumber(seasonRow?.stats_data, "shots", "on");
    const foulsPer90 = fouls != null && minutes > 0 ? Number(((fouls * 90) / minutes).toFixed(2)) : null;
    const tacklesPer90 = tackles != null && minutes > 0 ? Number(((tackles * 90) / minutes).toFixed(2)) : null;
    const sotPer90 = sot != null && minutes > 0 ? Number(((sot * 90) / minutes).toFixed(2)) : null;
    const yellows = seasonRow?.yellow_cards != null ? Number(seasonRow.yellow_cards) : null;
    const goals = seasonRow?.goals != null ? Number(seasonRow.goals) : null;

    const { modelProb, edgePct } = resolveModelEdge(value.odd, value.modelProb, value.edgePct);
    // Avoid "To Be Carded · To Be Carded" when selection duplicates the market label.
    const selectionDistinct =
      value.selection &&
      value.selection !== "Anytime" &&
      value.selection.toLowerCase() !== value.marketLabel.toLowerCase();
    const market = selectionDistinct
      ? `${value.marketLabel} · ${value.selection}`
      : value.marketLabel;

    return {
      playerId: value.playerId,
      player: cleanPersonName(
        profile?.name || squad?.name || value.playerName || `Player ${value.playerId}`,
      ),
      teamId: team.id,
      team: team.name,
      teamLogo: team.logo,
      matchup,
      market,
      marketKey: value.marketKey,
      line: value.line,
      odd: value.odd,
      modelProb,
      edgePct,
      appearances: apps > 0 ? apps : null,
      yellows: yellows != null && Number.isFinite(yellows) ? yellows : null,
      goals: goals != null && Number.isFinite(goals) ? goals : null,
      foulsPer90,
      tacklesPer90,
      sotPer90,
      lastFive: [] as FormOutcome[],
    };
  });

  const sorted = rows
    .sort(
      (left, right) =>
        (right.edgePct ?? -999) - (left.edgePct ?? -999) ||
        (right.foulsPer90 ?? 0) - (left.foulsPer90 ?? 0) ||
        (right.sotPer90 ?? 0) - (left.sotPer90 ?? 0) ||
        (left.odd ?? 99) - (right.odd ?? 99),
    )
    .slice(0, 80);

  return attachLastFive(sorted);
}

async function attachLastFive(rows: PropBoardRow[]): Promise<PropBoardRow[]> {
  if (rows.length === 0) return rows;
  const playerIds = [...new Set(rows.map((row) => row.playerId))];
  const logs = await loadPlayerMatchLogs(playerIds);
  return rows.map((row) => {
    const { category, line } = formCategoryForMarket(row.marketKey, row.market);
    return {
      ...row,
      lastFive: lastFiveOutcomes(row.playerId, category, line, logs),
    };
  });
}

async function loadPlayerMatchLogs(playerIds: number[]): Promise<PlayerMatchLogRow[]> {
  if (playerIds.length === 0) return [];
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixture_player_statistics")
    .select("player_id, fixture_id, statistics")
    .in("player_id", playerIds)
    .limit(2000);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const fixtureIds = [...new Set(rows.map((row) => Number(row.fixture_id)))];
  const dates = new Map<number, string>();
  for (let index = 0; index < fixtureIds.length; index += 200) {
    const chunk = fixtureIds.slice(index, index + 200);
    const { data: fixtures, error: fixtureError } = await supabase
      .from("fixtures")
      .select("id, date")
      .in("id", chunk);
    if (fixtureError) throw fixtureError;
    for (const fixture of fixtures ?? []) {
      if (fixture.date) dates.set(Number(fixture.id), String(fixture.date));
    }
  }

  return rows.map((row) => ({
    player_id: Number(row.player_id),
    fixture_id: Number(row.fixture_id),
    statistics: row.statistics,
    date: dates.get(Number(row.fixture_id)) ?? null,
  }));
}

async function loadTaleOfTheTape(
  home: MatchHubTeam,
  away: MatchHubTeam,
  leagueId: number,
  season: number,
): Promise<TaleOfTheTapeData> {
  const empty: TaleOfTheTapeData = {
    homeName: home.name,
    awayName: away.name,
    homeLogo: home.logo,
    awayLogo: away.logo,
    keyMatchups: [],
    shotsOn: { home: [], away: [] },
    foulsCommitted: { home: [], away: [] },
    foulsDrawn: { home: [], away: [] },
  };
  if (!Number.isInteger(leagueId) || !Number.isInteger(season)) return empty;

  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("player_id, team_id, appearances, minutes, stats_data")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("team_id", [home.id, away.id])
    .gte("appearances", 3)
    .limit(400);
  if (error) {
    if (isMissingRelation(error)) return empty;
    throw error;
  }

  const playerIds = [...new Set((data ?? []).map((row) => Number(row.player_id)))];
  const names = new Map<number, string>();
  if (playerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("player_profiles")
      .select("player_id, name")
      .in("player_id", playerIds);
    for (const profile of profiles ?? []) {
      names.set(Number(profile.player_id), String(profile.name));
    }
  }

  type Ranked = TapeLeader & { teamId: number };
  const sot: Ranked[] = [];
  const fouls: Ranked[] = [];
  const drawn: Ranked[] = [];

  for (const row of data ?? []) {
    const playerId = Number(row.player_id);
    const teamId = Number(row.team_id);
    const apps = Number(row.appearances) || 0;
    const rawMinutes = Number(row.minutes) || nestNumber(row.stats_data, "games", "minutes") || 0;
    const minutes = apps > 0 && rawMinutes >= apps * 45 ? rawMinutes : apps > 0 ? apps * 90 : 0;
    if (minutes <= 0) continue;

    const name = names.get(playerId) ?? `Player ${playerId}`;
    const sotTotal = nestNumber(row.stats_data, "shots", "on");
    const foulTotal = nestNumber(row.stats_data, "fouls", "committed");
    const drawnTotal = nestNumber(row.stats_data, "fouls", "drawn");

    if (sotTotal != null) {
      sot.push({
        playerId,
        name,
        teamId,
        rate: Number(((sotTotal * 90) / minutes).toFixed(2)),
        appearances: apps > 0 ? apps : null,
      });
    }
    if (foulTotal != null) {
      fouls.push({
        playerId,
        name,
        teamId,
        rate: Number(((foulTotal * 90) / minutes).toFixed(2)),
        appearances: apps > 0 ? apps : null,
      });
    }
    if (drawnTotal != null) {
      drawn.push({
        playerId,
        name,
        teamId,
        rate: Number(((drawnTotal * 90) / minutes).toFixed(2)),
        appearances: apps > 0 ? apps : null,
      });
    }
  }

  function top3(pool: Ranked[], teamId: number): TapeLeader[] {
    return pool
      .filter((row) => row.teamId === teamId)
      .sort((left, right) => right.rate - left.rate)
      .slice(0, 3)
      .map(({ playerId, name, teamId: id, rate, appearances }) => ({
        playerId,
        name,
        teamId: id,
        rate,
        appearances,
      }));
  }

  const foulsCommitted = {
    home: top3(fouls, home.id),
    away: top3(fouls, away.id),
  };
  const foulsDrawn = {
    home: top3(drawn, home.id),
    away: top3(drawn, away.id),
  };
  const shotsOn = { home: top3(sot, home.id), away: top3(sot, away.id) };

  return {
    homeName: home.name,
    awayName: away.name,
    homeLogo: home.logo,
    awayLogo: away.logo,
    keyMatchups: buildKeyMatchups({
      homeName: home.name,
      awayName: away.name,
      foulsCommitted,
      foulsDrawn,
      shotsOn,
    }),
    shotsOn,
    foulsCommitted,
    foulsDrawn,
  };
}

function resolveModelEdge(
  odd: number | null,
  storedModel: number | null,
  storedEdge: number | null,
): { modelProb: number | null; edgePct: number | null } {
  let modelProb = storedModel;
  let edgePct = storedEdge;
  // Back-solve model from stored edge + price when model_prob is absent (still odds-sourced).
  if (
    modelProb == null &&
    edgePct != null &&
    odd != null &&
    odd > 1 &&
    Number.isFinite(edgePct)
  ) {
    const derived = (1 + edgePct / 100) / odd;
    if (Number.isFinite(derived) && derived > 0 && derived < 1) modelProb = derived;
  }
  if (
    edgePct == null &&
    modelProb != null &&
    odd != null &&
    odd > 1 &&
    Number.isFinite(modelProb)
  ) {
    edgePct = Number(((odd * modelProb - 1) * 100).toFixed(1));
  }
  // Orphan edge without model/price is discarded by UI; keep nulls honest.
  if (modelProb == null || odd == null || odd <= 1) {
    return { modelProb: modelProb, edgePct: modelProb != null && odd != null && odd > 1 ? edgePct : null };
  }
  return { modelProb, edgePct };
}

function classifyPropMarket(betId: number, betName: string): { key: PropMarketKey; label: string } | null {
  const name = betName.toLowerCase();
  if (
    (PREMATCH_PLAYER_CARD_BET_IDS as readonly number[]).includes(betId) ||
    name.includes("player cards") ||
    name.includes("to be booked") ||
    name.includes("to be carded") ||
    (name.includes("card") && name.includes("player"))
  ) {
    return { key: "cards", label: "To Be Carded" };
  }
  if (
    betId === prematchBets.homePlayerShotsOnTarget ||
    betId === prematchBets.awayPlayerShotsOnTarget ||
    name.includes("shots on target") ||
    name.includes("shotontarget") ||
    name.includes("shot on target")
  ) {
    // "… Shots On Target Total" without per-player lines is a race/outright, not O/U.
    if (name.includes("total") && !name.includes("over") && !name.includes("under")) {
      return { key: "other", label: betName.trim() || "Player SOT Special" };
    }
    return { key: "sot", label: "Shots on Target" };
  }
  if (
    betId === prematchBets.homePlayerShots ||
    betId === prematchBets.awayPlayerShots ||
    betId === prematchBets.awayPlayerShotsTotal ||
    (name.includes("shot") && !name.includes("1x2") && !name.includes("total shotongoal"))
  ) {
    return { key: "sot", label: "Total Shots" };
  }
  if (
    betId === prematchBets.playerFoulsCommitted ||
    betId === prematchBets.homePlayerFoulsCommitted ||
    betId === prematchBets.awayPlayerFoulsCommitted ||
    name.includes("foul")
  ) {
    return { key: "fouls", label: "Fouls Committed" };
  }
  if (
    betId === prematchBets.anytimeGoalScorer ||
    name.includes("anytime") ||
    name.includes("goal scorer") ||
    name.includes("goalscorer") ||
    name.includes("to score")
  ) {
    return { key: "goals", label: "Anytime Goalscorer" };
  }
  if ((PREMATCH_PLAYER_PROP_BET_IDS as readonly number[]).includes(betId) || name.includes("player")) {
    return { key: "other", label: betName.trim() || "Player Prop" };
  }
  return null;
}

type ParsedPropValue = {
  playerId: number;
  playerName: string;
  selection: string;
  line: number | null;
  marketKey: PropMarketKey;
  marketLabel: string;
  odd: number | null;
  modelProb: number | null;
  edgePct: number | null;
};

function propValues(
  oddsData: unknown,
  nameIndex: ReturnType<typeof buildSquadNameIndex>,
  rowModel: number | null,
  rowEdge: number | null,
): ParsedPropValue[] {
  const bets = betsFromOddsData(oddsData);
  if (!bets) return [];

  const out: ParsedPropValue[] = [];
  const seen = new Set<string>();

  for (const bet of bets.values()) {
    const id = Number(bet.id);
    const betName = String(bet.name ?? "");
    const classified = classifyPropMarket(id, betName);
    if (!classified) continue;

    // Prefer catalog ids; also accept name-classified player markets (no hard card-only gate).
    const inCatalog = (PREMATCH_PLAYER_PROP_BET_IDS as readonly number[]).includes(id);
    if (!inCatalog && classified.key === "other") continue;

    for (const value of bet.values ?? []) {
      // Prefer per-value JSON model_prob/edge_pct. Row columns are best-of-snapshot — do not
      // paint every selection with them (void keeps the select wired for future use).
      void rowModel;
      void rowEdge;
      const parsed = parsePlayerPropValue(value, null, null);
      if (!parsed || parsed.odd == null) continue;

      const playerId = resolvePlayerId(nameIndex, parsed.playerName, parsed.playerId);
      if (playerId == null) continue;

      // Cards / anytime: name-only rows are the market itself.
      // SOT / shots / fouls MUST carry a line (handicap or "Name - N").
      // Name-only rows on "… Shots On Target Total" are race / most-SOT outrights
      // (odds like 41–67) — never treat those as Over 0.5.
      if (!isSupportedPlayerPropLine(classified.key, classified.label, parsed.line)) continue;

      const selection =
        classified.key === "cards"
          ? "To Be Carded"
          : classified.key === "goals"
            ? "Anytime"
            : parsed.selection;

      // Sanity: Over 0.5 / 1.5 player lines are almost never longer than ~20.0.
      // Longer prices almost always mean we attached the wrong market.
      if (
        (classified.key === "sot" || classified.key === "fouls") &&
        parsed.odd != null &&
        parsed.odd > 20 &&
        /over\s*0\.5|over\s*1\.5/i.test(selection)
      ) {
        continue;
      }

      const key = `${classified.key}:${playerId}:${selection}:${parsed.odd}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        playerId,
        playerName: parsed.playerName,
        selection,
        line: parsed.line,
        marketKey: classified.key,
        marketLabel: classified.label,
        odd: parsed.odd,
        modelProb: parsed.modelProb,
        edgePct: parsed.edgePct,
      });
    }
  }
  return out;
}

function formatKickoff(value: string | null) {
  if (!value) return "Kickoff TBC";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Kickoff TBC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
