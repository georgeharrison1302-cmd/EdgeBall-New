import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

import { wasPlayerBooked, type FixtureCardBook } from "./card-events";
import type { LegResult, UserBetLeg } from "./types";

export type FixtureScore = {
  id: number;
  status_short: string | null;
  home_goals: number | null;
  away_goals: number | null;
};

const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export function isFixtureFinished(status: string | null | undefined) {
  return status != null && FINISHED.has(status);
}

/** Grade one slip leg from final score when market is score-settled. */
export function gradeLegFromScore(leg: UserBetLeg, fixture: FixtureScore | undefined): LegResult {
  if (leg.result === "won" || leg.result === "lost" || leg.result === "void") {
    return leg.result;
  }
  if (!fixture || !isFixtureFinished(fixture.status_short)) return "pending";
  const home = fixture.home_goals;
  const away = fixture.away_goals;
  if (home == null || away == null) return "pending";

  const kind = leg.marketKind;
  if (!kind) return "pending";

  switch (kind) {
    case "home_win":
      return home > away ? "won" : "lost";
    case "away_win":
      return away > home ? "won" : "lost";
    case "draw":
      return home === away ? "won" : "lost";
    case "btts_yes":
      return home > 0 && away > 0 ? "won" : "lost";
    case "btts_no":
      return home === 0 || away === 0 ? "won" : "lost";
    case "over_goals": {
      if (leg.line == null) return "pending";
      return home + away > leg.line ? "won" : "lost";
    }
    case "under_goals": {
      if (leg.line == null) return "pending";
      return home + away < leg.line ? "won" : "lost";
    }
    case "clean_sheet":
    case "player_goals_over":
    case "player_card":
    case "player_shots":
    case "player_fouls":
    case "other":
      return "pending";
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return "pending";
    }
  }
}

/** Grade a player card leg against synced fixture_events. */
export function gradePlayerCardLeg(
  leg: UserBetLeg,
  fixture: FixtureScore | undefined,
  cardBook: FixtureCardBook | undefined,
): LegResult {
  if (leg.result === "won" || leg.result === "lost" || leg.result === "void") {
    return leg.result;
  }
  if (!fixture || !isFixtureFinished(fixture.status_short)) return "pending";
  if (leg.marketKind !== "player_card") return gradeLegFromScore(leg, fixture);

  const playerName = leg.player ?? leg.label ?? leg.marketName;
  const booked = wasPlayerBooked(cardBook, null, playerName);
  if (booked == null) return "pending";
  return booked ? "won" : "lost";
}

export function settleSlip(
  legs: UserBetLeg[],
  fixturesById: Map<number, FixtureScore>,
  cardBooksByFixture?: Map<number, FixtureCardBook>,
): {
  legs: UserBetLeg[];
  status: "active" | "won" | "lost" | "void";
  settledOdds: number | null;
} {
  const graded = legs.map((leg) => {
    const fixture =
      leg.fixtureId != null ? fixturesById.get(leg.fixtureId) : undefined;
    const book =
      leg.fixtureId != null ? cardBooksByFixture?.get(leg.fixtureId) : undefined;
    const result =
      leg.marketKind === "player_card"
        ? gradePlayerCardLeg(leg, fixture, book)
        : gradeLegFromScore(leg, fixture);
    return { ...leg, result };
  });

  if (graded.some((leg) => leg.result === "pending")) {
    return { legs: graded, status: "active", settledOdds: null };
  }
  if (graded.every((leg) => leg.result === "void")) {
    return { legs: graded, status: "void", settledOdds: null };
  }
  if (graded.some((leg) => leg.result === "lost")) {
    return { legs: graded, status: "lost", settledOdds: null };
  }

  const live = graded.filter((leg) => leg.result === "won");
  const settledOdds = live.reduce((product, leg) => product * leg.decimalOdds, 1);
  return { legs: graded, status: "won", settledOdds };
}

export function profitForStatus(
  status: "active" | "won" | "lost" | "void",
  stake: number,
  settledOdds: number | null,
): number | null {
  if (status === "active") return null;
  if (status === "void") return 0;
  if (status === "lost") return -stake;
  if (settledOdds == null) return null;
  return stake * (settledOdds - 1);
}

/** Payout including stake for a winning selection. */
export function payoutForWin(stake: number, decimalOdds: number) {
  return stake * decimalOdds;
}

export function isScoreSettledKind(kind: SlipMarketKind | undefined) {
  return (
    kind === "home_win" ||
    kind === "draw" ||
    kind === "away_win" ||
    kind === "btts_yes" ||
    kind === "btts_no" ||
    kind === "over_goals" ||
    kind === "under_goals"
  );
}

export function isCardSettledKind(kind: SlipMarketKind | undefined) {
  return kind === "player_card";
}
