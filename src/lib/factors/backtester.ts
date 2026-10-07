import "server-only";

import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { nestNumber, standingSide } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";
import { loadTeamYellowRates } from "@/utils/stats/discipline";
import {
  fixtureStatNumber,
  fixtureYellows,
  loadRefereeRates,
  lookupReferee,
} from "@/utils/stats/referees";

import { evaluateFixtureFactors } from "./evaluator";
import type {
  FixtureFactorId,
  FixtureFactorInput,
  TeamFactorStats,
} from "./types";

export type BacktestMarket = "over_2_5_goals" | "over_3_5_cards" | "btts_yes";

export type FactorBacktestResult = {
  totalSamples: number;
  hits: number;
  hitRatePct: number;
  flatRoiPct: number;
};

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"] as const;
const SAMPLE_LIMIT = 500;
/** Disciplinary storm / Over 3.5 cards settle when total match cards clear this line. */
const CARD_HIT_LINE = 4;

/** Default market each factor is typically screened against. */
export const FACTOR_DEFAULT_MARKET: Record<FixtureFactorId, BacktestMarket> = {
  disciplinary_storm: "over_3_5_cards",
  fatigue_disparity: "over_2_5_goals",
  form_clash: "over_2_5_goals",
  relegation_fight: "over_3_5_cards",
};

/**
 * Historical hit rate for a factor against its default (or supplied) market.
 * For `disciplinary_storm`, settle requires fixture_statistics with total cards ≥ 4.
 */
export async function calculateFactorHitRate(
  factorId: FixtureFactorId,
  targetMarket: BacktestMarket = FACTOR_DEFAULT_MARKET[factorId],
): Promise<FactorBacktestResult> {
  return backtestFactor(factorId, targetMarket);
}

/**
 * Historical hit rate for a factor against a binary market.
 * Uses finished fixtures + fixture_statistics; even-money flat ROI.
 */
export async function backtestFactor(
  factorId: FixtureFactorId,
  targetMarket: BacktestMarket,
): Promise<FactorBacktestResult> {
  const supabase = createIngestClient();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select(
      "id, date, referee, league_id, season, home_team_id, away_team_id, home_goals, away_goals, status_short",
    )
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .in("status_short", [...FINISHED])
    .not("home_goals", "is", null)
    .not("away_goals", "is", null)
    .order("date", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (error) throw error;

  const rows = fixtures ?? [];
  if (rows.length === 0) {
    return { totalSamples: 0, hits: 0, hitRatePct: 0, flatRoiPct: 0 };
  }

  const fixtureIds = rows.map((row) => Number(row.id));
  const teamIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.home_team_id, row.away_team_id]
          .filter((id): id is number => id != null)
          .map(Number),
      ),
    ),
  ];
  const leagueSeasons = [
    ...new Map(
      rows
        .filter((row) => row.league_id != null && row.season != null)
        .map((row) => [`${row.league_id}:${row.season}`, { leagueId: Number(row.league_id), season: Number(row.season) }]),
    ).values(),
  ];
  const referees = [
    ...new Set(rows.map((row) => row.referee).filter((name): name is string => Boolean(name))),
  ];
  const yellowScopes = leagueSeasons.flatMap(({ leagueId, season }) =>
    teamIds.slice(0, 80).map((teamId) => ({ teamId, leagueId, season })),
  );

  const [refs, cardsByFixture, standingsByKey, foulByTeamSeason, prevKickoffs, teamCardRates] =
    await Promise.all([
      loadRefereeRates(referees),
      loadMatchCardTotals(fixtureIds),
      loadStandingsMap(leagueSeasons),
      loadFoulRates(leagueSeasons, teamIds),
      loadPreviousKickoffs(teamIds, rows),
      yellowScopes.length ? loadTeamYellowRates(yellowScopes) : Promise.resolve(new Map()),
    ]);

  let totalSamples = 0;
  let hits = 0;

  for (const row of rows) {
    const fixtureId = Number(row.id);
    const homeId = row.home_team_id == null ? null : Number(row.home_team_id);
    const awayId = row.away_team_id == null ? null : Number(row.away_team_id);
    const leagueId = row.league_id == null ? null : Number(row.league_id);
    const season = row.season == null ? null : Number(row.season);
    const kickoff = row.date ? String(row.date) : null;
    const lsKey = leagueId != null && season != null ? `${leagueId}:${season}` : null;

    const homeStanding = homeId != null && lsKey ? standingsByKey.get(`${lsKey}:${homeId}`) : undefined;
    const awayStanding = awayId != null && lsKey ? standingsByKey.get(`${lsKey}:${awayId}`) : undefined;
    const leagueSize =
      lsKey != null
        ? [...standingsByKey.keys()].filter((key) => key.startsWith(`${lsKey}:`)).length
        : null;

    const ref = lookupReferee(refs, row.referee);
    const playerStats = [
      ...(homeId != null && lsKey
        ? foulByTeamSeason.get(`${lsKey}:${homeId}`) ?? []
        : []),
      ...(awayId != null && lsKey
        ? foulByTeamSeason.get(`${lsKey}:${awayId}`) ?? []
        : []),
    ];

    const homeCards =
      homeId != null && leagueId != null && season != null
        ? (teamCardRates.get(`${homeId}:${leagueId}:${season}`) ?? null)
        : null;
    const awayCards =
      awayId != null && leagueId != null && season != null
        ? (teamCardRates.get(`${awayId}:${leagueId}:${season}`) ?? null)
        : null;

    const input: FixtureFactorInput = {
      fixture: {
        id: fixtureId,
        date: kickoff,
        homeTeamId: homeId,
        awayTeamId: awayId,
      },
      homeTeamStats: teamFromStanding(homeId, homeStanding, leagueSize, homeCards),
      awayTeamStats: teamFromStanding(awayId, awayStanding, leagueSize, awayCards),
      refStats: ref
        ? { name: ref.name, avgCardsPerMatch: ref.avg, matches: ref.matches }
        : row.referee
          ? { name: row.referee, avgCardsPerMatch: null, matches: null }
          : null,
      playerStats,
      homePreviousKickoff:
        homeId != null ? prevKickoffs.get(`${homeId}:${fixtureId}`) ?? null : null,
      awayPreviousKickoff:
        awayId != null ? prevKickoffs.get(`${awayId}:${fixtureId}`) ?? null : null,
    };

    const matched = evaluateFixtureFactors(fixtureId, input).find(
      (evaluation) => evaluation.factor.id === factorId && evaluation.matched,
    );
    if (!matched) continue;

    const totalCards = cardsByFixture.get(fixtureId) ?? null;
    // Disciplinary storm hit-rate only settles fixtures with stored card sheets.
    if (
      (factorId === "disciplinary_storm" || targetMarket === "over_3_5_cards") &&
      totalCards == null
    ) {
      continue;
    }

    const outcome = marketHit(targetMarket, {
      homeGoals: Number(row.home_goals),
      awayGoals: Number(row.away_goals),
      totalCards,
    });
    if (outcome == null) continue;

    totalSamples += 1;
    if (outcome) hits += 1;
  }

  if (totalSamples === 0) {
    return { totalSamples: 0, hits: 0, hitRatePct: 0, flatRoiPct: 0 };
  }

  const hitRatePct = Number(((hits / totalSamples) * 100).toFixed(1));
  // Even-money flat stake: win +1 / lose -1 → ROI = (2p - 1) * 100
  const flatRoiPct = Number((((2 * hits) / totalSamples - 1) * 100).toFixed(1));
  return { totalSamples, hits, hitRatePct, flatRoiPct };
}

function marketHit(
  market: BacktestMarket,
  score: { homeGoals: number; awayGoals: number; totalCards: number | null },
): boolean | null {
  if (!Number.isFinite(score.homeGoals) || !Number.isFinite(score.awayGoals)) return null;
  if (market === "over_2_5_goals") {
    return score.homeGoals + score.awayGoals > 2.5;
  }
  if (market === "btts_yes") {
    return score.homeGoals > 0 && score.awayGoals > 0;
  }
  if (market === "over_3_5_cards") {
    if (score.totalCards == null) return null;
    return score.totalCards >= CARD_HIT_LINE;
  }
  return null;
}

function teamFromStanding(
  teamId: number | null,
  standing: { rank: number | null; all_stats: unknown } | undefined,
  teamsInLeague: number | null,
  cardsPerGame: number | null,
): TeamFactorStats | null {
  if (teamId == null) return null;
  const side = standingSide(standing?.all_stats);
  const played = side.played;
  const gf =
    side.goalsFor != null && played != null && played > 0
      ? side.goalsFor / played
      : null;
  const ga =
    side.goalsAgainst != null && played != null && played > 0
      ? side.goalsAgainst / played
      : null;
  return {
    teamId,
    goalsForPerGame: gf,
    goalsAgainstPerGame: ga,
    rank: standing?.rank == null ? null : Number(standing.rank),
    played,
    teamsInLeague,
    cardsPerGame,
  };
}

/** Sum yellow + red cards per finished fixture from `fixture_statistics`. */
async function loadMatchCardTotals(fixtureIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (fixtureIds.length === 0) return map;
  const supabase = createIngestClient();
  for (let index = 0; index < fixtureIds.length; index += 200) {
    const chunk = fixtureIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, statistics")
      .in("fixture_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const yellows = fixtureYellows(row.statistics);
      const reds =
        fixtureStatNumber(row.statistics, "Red Cards") ??
        fixtureStatNumber(row.statistics, "red cards");
      if (yellows == null && reds == null) continue;
      const fixtureId = Number(row.fixture_id);
      map.set(fixtureId, (map.get(fixtureId) ?? 0) + (yellows ?? 0) + (reds ?? 0));
    }
  }
  return map;
}

async function loadStandingsMap(
  leagueSeasons: Array<{ leagueId: number; season: number }>,
): Promise<Map<string, { rank: number | null; all_stats: unknown }>> {
  const map = new Map<string, { rank: number | null; all_stats: unknown }>();
  if (leagueSeasons.length === 0) return map;
  const supabase = createIngestClient();
  // Cap to recent seasons present in the sample to keep the query light.
  for (const { leagueId, season } of leagueSeasons.slice(0, 40)) {
    const { data, error } = await supabase
      .from("standings")
      .select("team_id, rank, all_stats")
      .eq("league_id", leagueId)
      .eq("season", season);
    if (error) throw error;
    for (const row of data ?? []) {
      map.set(`${leagueId}:${season}:${Number(row.team_id)}`, {
        rank: row.rank == null ? null : Number(row.rank),
        all_stats: row.all_stats,
      });
    }
  }
  return map;
}

async function loadFoulRates(
  leagueSeasons: Array<{ leagueId: number; season: number }>,
  teamIds: number[],
): Promise<Map<string, Array<{ playerId: number; teamId: number | null; foulsPer90: number | null }>>> {
  const map = new Map<
    string,
    Array<{ playerId: number; teamId: number | null; foulsPer90: number | null }>
  >();
  if (leagueSeasons.length === 0 || teamIds.length === 0) return map;
  const supabase = createIngestClient();
  for (const { leagueId, season } of leagueSeasons.slice(0, 40)) {
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, team_id, appearances, minutes, stats_data")
      .eq("league_id", leagueId)
      .eq("season", season)
      .in("team_id", teamIds.slice(0, 80))
      .gte("appearances", 3)
      .limit(800);
    if (error) throw error;
    for (const row of data ?? []) {
      const teamId = Number(row.team_id);
      const apps = Number(row.appearances) || 0;
      const rawMinutes =
        Number(row.minutes) || nestNumber(row.stats_data, "games", "minutes") || 0;
      const minutes = apps > 0 && rawMinutes >= apps * 45 ? rawMinutes : apps > 0 ? apps * 90 : 0;
      const fouls = nestNumber(row.stats_data, "fouls", "committed");
      const foulsPer90 =
        fouls != null && minutes > 0 ? Number(((fouls * 90) / minutes).toFixed(2)) : null;
      const key = `${leagueId}:${season}:${teamId}`;
      const bucket = map.get(key) ?? [];
      bucket.push({
        playerId: Number(row.player_id),
        teamId,
        foulsPer90,
      });
      map.set(key, bucket);
    }
  }
  return map;
}

async function loadPreviousKickoffs(
  teamIds: number[],
  sample: Array<{
    id: number;
    date: string | null;
    home_team_id: number | null;
    away_team_id: number | null;
  }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (teamIds.length === 0 || sample.length === 0) return map;

  const dates = sample
    .map((row) => (row.date ? String(row.date) : null))
    .filter((value): value is string => Boolean(value))
    .sort();
  if (dates.length === 0) return map;

  // Widen the window so rest-day gaps can resolve previous fixtures.
  const windowStart = new Date(Date.parse(dates[0]!) - 21 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = dates[dates.length - 1]!;

  const supabase = createIngestClient();
  const wanted = new Set(teamIds);
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, home_team_id, away_team_id, status_short")
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .in("status_short", [...FINISHED])
    .gte("date", windowStart)
    .lte("date", windowEnd)
    .order("date", { ascending: true })
    .limit(5000);
  if (error) throw error;

  const byTeam = new Map<number, Array<{ id: number; date: string }>>();
  for (const row of data ?? []) {
    if (!row.date) continue;
    const entry = { id: Number(row.id), date: String(row.date) };
    for (const teamId of [row.home_team_id, row.away_team_id]) {
      if (teamId == null) continue;
      const id = Number(teamId);
      if (!wanted.has(id)) continue;
      const bucket = byTeam.get(id) ?? [];
      bucket.push(entry);
      byTeam.set(id, bucket);
    }
  }

  for (const fixture of sample) {
    if (!fixture.date) continue;
    const kickoff = String(fixture.date);
    const fixtureId = Number(fixture.id);
    for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
      if (teamId == null) continue;
      const id = Number(teamId);
      const history = byTeam.get(id) ?? [];
      let previous: string | null = null;
      for (const row of history) {
        if (row.id === fixtureId) continue;
        if (row.date >= kickoff) break;
        previous = row.date;
      }
      if (previous) map.set(`${id}:${fixtureId}`, previous);
    }
  }
  return map;
}
