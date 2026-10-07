import { FACTOR_CATALOG } from "./types";
import type {
  FactorEvaluation,
  FixtureFactorInput,
  TeamFactorStats,
} from "./types";

const REF_CARD_LINE = 4.0;
const FOUL_LINE = 1.8;
const TEAM_CARDS_LINE = 2.0;
/** Congested side must have this many rest days or fewer. */
const CONGESTED_MAX_REST = 4;
/** Rested side must hold at least this many more rest days than the congested side. */
const REST_ADVANTAGE_DAYS = 3;
const HOME_GF_LINE = 1.8;
const AWAY_GA_LINE = 1.6;
const DEFAULT_LEAGUE_SIZE = 20;

/**
 * Pure fixture-factor evaluator. Callers inject stats — nothing is invented when null.
 * Returns all four catalog factors with matched true/false.
 */
export function evaluateFixtureFactors(
  fixtureId: number,
  data: FixtureFactorInput,
): FactorEvaluation[] {
  void fixtureId;
  return [
    evaluateDisciplinaryStorm(data),
    evaluateFatigueDisparity(data),
    evaluateFormClash(data),
    evaluateRelegationFight(data),
  ];
}

function evaluateDisciplinaryStorm(data: FixtureFactorInput): FactorEvaluation {
  const factor = FACTOR_CATALOG.disciplinary_storm;
  const avgCards = data.refStats?.avgCardsPerMatch ?? null;
  const refName = assignedRefName(data.refStats?.name);
  const refMatches = data.refStats?.matches ?? null;
  const hotPlayers = data.playerStats.filter(
    (player) => player.foulsPer90 != null && player.foulsPer90 >= FOUL_LINE,
  );
  const homeCards = data.homeTeamStats?.cardsPerGame ?? null;
  const awayCards = data.awayTeamStats?.cardsPerGame ?? null;

  const refUnassigned = !refName || avgCards == null;
  // Season foul rows stand in for lineup-level foul signals when XI isn't stored yet.
  const lineupsOrFoulsMissing =
    data.playerStats.length === 0 ||
    data.playerStats.every((player) => player.foulsPer90 == null);

  const primaryMatched =
    avgCards != null && avgCards > REF_CARD_LINE && hotPlayers.length > 0;
  // Never raise a disciplinary warning without an assigned referee. Team-card
  // evidence can supplement a named referee with no stored average, but cannot
  // stand in for a null/TBC assignment.
  const teamFallbackMatched =
    Boolean(refName) &&
    (avgCards == null || lineupsOrFoulsMissing) &&
    homeCards != null &&
    awayCards != null &&
    homeCards >= TEAM_CARDS_LINE &&
    awayCards >= TEAM_CARDS_LINE;
  const matched = primaryMatched || teamFallbackMatched;

  const evidence: FactorEvaluation["evidence"] = {
    refName,
    refAvgCardsPerMatch: avgCards,
    refMatches,
    hotFoulPlayers: hotPlayers.length,
    foulLine: FOUL_LINE,
    cardLine: REF_CARD_LINE,
    homeCardsPerGame: homeCards,
    awayCardsPerGame: awayCards,
    teamCardsLine: TEAM_CARDS_LINE,
    usedTeamCardsFallback: teamFallbackMatched && !primaryMatched,
  };

  let summary: string;
  if (matched && teamFallbackMatched && !primaryMatched) {
    summary = `Team cards fallback · Home ${homeCards!.toFixed(1)}/g · Away ${awayCards!.toFixed(1)}/g (both ≥${TEAM_CARDS_LINE}).`;
  } else if (primaryMatched) {
    summary = `Ref averages ${avgCards!.toFixed(1)} cards/m · ${hotPlayers.length} player${hotPlayers.length === 1 ? "" : "s"} with ≥${FOUL_LINE} fouls/90.`;
  } else if (refUnassigned && (homeCards == null || awayCards == null)) {
    summary =
      "Referee unassigned and team card rates are not stored — storm not confirmed.";
  } else if (refUnassigned) {
    summary = `Referee unassigned · Home ${homeCards!.toFixed(1)} cards/g · Away ${awayCards!.toFixed(1)} cards/g (needs both ≥${TEAM_CARDS_LINE}).`;
  } else if (avgCards == null && hotPlayers.length === 0) {
    summary = "Referee card rate and player foul rates are not stored.";
  } else if (avgCards == null) {
    summary = `Referee card average not stored · ${hotPlayers.length} player${hotPlayers.length === 1 ? "" : "s"} with ≥${FOUL_LINE} fouls/90.`;
  } else if (hotPlayers.length === 0) {
    summary = `Ref averages ${avgCards.toFixed(1)} cards/m · no players at ≥${FOUL_LINE} fouls/90.`;
  } else {
    summary = `Ref averages ${avgCards.toFixed(1)} cards/m (needs >${REF_CARD_LINE}) · ${hotPlayers.length} hot foul players.`;
  }

  return { factor, matched, evidence, summary };
}

function evaluateFatigueDisparity(data: FixtureFactorInput): FactorEvaluation {
  const factor = FACTOR_CATALOG.fatigue_disparity;
  const kickoff = data.fixture.date;
  const homeRest = restDays(kickoff, data.homePreviousKickoff ?? null);
  const awayRest = restDays(kickoff, data.awayPreviousKickoff ?? null);
  const gap =
    homeRest != null && awayRest != null ? Math.abs(homeRest - awayRest) : null;

  // Congested side ≤4d rest AND opponent holds ≥3d rest advantage (blocks intl-break noise).
  const homeCongested =
    homeRest != null &&
    awayRest != null &&
    homeRest <= CONGESTED_MAX_REST &&
    awayRest - homeRest >= REST_ADVANTAGE_DAYS;
  const awayCongested =
    homeRest != null &&
    awayRest != null &&
    awayRest <= CONGESTED_MAX_REST &&
    homeRest - awayRest >= REST_ADVANTAGE_DAYS;
  const matched = homeCongested || awayCongested;

  const evidence: FactorEvaluation["evidence"] = {
    homeRestDays: homeRest,
    awayRestDays: awayRest,
    restGapDays: gap,
    congestedMaxRest: CONGESTED_MAX_REST,
    restAdvantageDays: REST_ADVANTAGE_DAYS,
  };

  let summary: string;
  if (homeRest == null || awayRest == null) {
    summary = "Previous kickoffs are not stored for both sides — rest gap unknown.";
  } else if (matched) {
    const congested = homeCongested ? "Home" : "Away";
    const rested = homeCongested ? "Away" : "Home";
    summary = `${congested} congested (${Math.min(homeRest, awayRest)}d) vs ${rested} (${Math.max(homeRest, awayRest)}d, +${gap}d).`;
  } else {
    summary = `Home ${homeRest}d · Away ${awayRest}d — needs a side ≤${CONGESTED_MAX_REST}d with ≥${REST_ADVANTAGE_DAYS}d rest disadvantage.`;
  }

  return { factor, matched, evidence, summary };
}

function evaluateFormClash(data: FixtureFactorInput): FactorEvaluation {
  const factor = FACTOR_CATALOG.form_clash;
  const homeGf = data.homeTeamStats?.goalsForPerGame ?? null;
  const awayGa = data.awayTeamStats?.goalsAgainstPerGame ?? null;
  const matched =
    homeGf != null && awayGa != null && homeGf >= HOME_GF_LINE && awayGa >= AWAY_GA_LINE;

  const evidence: FactorEvaluation["evidence"] = {
    homeGoalsForPerGame: homeGf,
    awayGoalsAgainstPerGame: awayGa,
    homeGfLine: HOME_GF_LINE,
    awayGaLine: AWAY_GA_LINE,
  };

  let summary: string;
  if (homeGf == null || awayGa == null) {
    summary = "Home goals/game or away goals conceded are not stored.";
  } else if (matched) {
    summary = `Home ${homeGf.toFixed(1)} GF/g meets away ${awayGa.toFixed(1)} GA/g.`;
  } else {
    summary = `Home ${homeGf.toFixed(1)} GF/g · away ${awayGa.toFixed(1)} GA/g — needs ≥${HOME_GF_LINE} / ≥${AWAY_GA_LINE}.`;
  }

  return { factor, matched, evidence, summary };
}

function evaluateRelegationFight(data: FixtureFactorInput): FactorEvaluation {
  const factor = FACTOR_CATALOG.relegation_fight;
  const homeRank = data.homeTeamStats?.rank ?? null;
  const awayRank = data.awayTeamStats?.rank ?? null;
  const leagueSize = leagueSizeFrom(data.homeTeamStats, data.awayTeamStats);
  const cutoff = leagueSize - 2;
  const matched =
    homeRank != null &&
    awayRank != null &&
    homeRank >= cutoff &&
    awayRank >= cutoff;

  const evidence: FactorEvaluation["evidence"] = {
    homeRank,
    awayRank,
    teamsInLeague: leagueSize,
    bottomThreeFromRank: cutoff,
  };

  let summary: string;
  if (homeRank == null || awayRank == null) {
    summary = "Standings ranks are not stored for both sides.";
  } else if (matched) {
    summary = `Both clubs in the bottom three (P${homeRank} vs P${awayRank}, ${leagueSize}-team table).`;
  } else {
    summary = `Table P${homeRank} vs P${awayRank} — both need rank ≥${cutoff} for a ${leagueSize}-team table.`;
  }

  return { factor, matched, evidence, summary };
}

function assignedRefName(value: string | null | undefined) {
  const name = value?.trim() ?? "";
  return !name || /^(tbc|tbd|to be (confirmed|decided)|unknown|n\/a|none)$/i.test(name) ? null : name;
}

function leagueSizeFrom(
  home: TeamFactorStats | null,
  away: TeamFactorStats | null,
): number {
  const size = home?.teamsInLeague ?? away?.teamsInLeague ?? null;
  if (size != null && Number.isFinite(size) && size >= 3) return Math.floor(size);
  return DEFAULT_LEAGUE_SIZE;
}

/** Whole days between previous kickoff and this fixture (non-negative). */
function restDays(
  kickoff: string | null | undefined,
  previous: string | null | undefined,
): number | null {
  if (!kickoff || !previous) return null;
  const now = Date.parse(kickoff);
  const prior = Date.parse(previous);
  if (!Number.isFinite(now) || !Number.isFinite(prior) || now < prior) return null;
  const ms = now - prior;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
