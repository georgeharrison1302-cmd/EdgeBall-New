export type FixtureFactorId =
  | "disciplinary_storm"
  | "fatigue_disparity"
  | "form_clash"
  | "relegation_fight";

export type FactorCategory = "discipline" | "physical" | "table";

export type FixtureFactor = {
  id: FixtureFactorId;
  name: string;
  description: string;
  category: FactorCategory;
  badgeLabel: string;
  triggeredMarkets: string[];
};

export type FactorEvaluation = {
  factor: FixtureFactor;
  matched: boolean;
  evidence: Record<string, string | number | boolean | null>;
  /** Human-readable summary for UI tooltip */
  summary: string;
};

export type TeamFactorStats = {
  teamId: number;
  goalsForPerGame: number | null;
  goalsAgainstPerGame: number | null;
  rank: number | null;
  played: number | null;
  /** League/table size for relegation bottom-3 checks. */
  teamsInLeague?: number | null;
  /** Team cards/game from fixture sheets / team stats (Disciplinary Storm fallback). */
  cardsPerGame?: number | null;
};

export type FixtureFactorInput = {
  fixture: {
    id: number;
    date: string | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
  };
  homeTeamStats: TeamFactorStats | null;
  awayTeamStats: TeamFactorStats | null;
  refStats: {
    name: string | null;
    avgCardsPerMatch: number | null;
    matches: number | null;
  } | null;
  playerStats: Array<{
    playerId: number;
    teamId: number | null;
    name?: string;
    foulsPer90: number | null;
  }>;
  /** ISO kickoffs of each side's previous fixture (caller supplies). */
  homePreviousKickoff?: string | null;
  awayPreviousKickoff?: string | null;
};

export const FACTOR_CATALOG: Record<FixtureFactorId, FixtureFactor> = {
  disciplinary_storm: {
    id: "disciplinary_storm",
    name: "Disciplinary Storm",
    description:
      "Assigned strict referee plus high-foul players, or both teams averaging ≥2.0 cards/game when that referee has no stored average.",
    category: "discipline",
    badgeLabel: "Disciplinary Storm",
    triggeredMarkets: ["Player Cards", "Team Cards", "Fouls Committed"],
  },
  fatigue_disparity: {
    id: "fatigue_disparity",
    name: "Fatigue Disparity",
    description:
      "One side is congested (≤4 days rest) while the opponent has ≥3 days more rest — match lines skew.",
    category: "physical",
    badgeLabel: "Fatigue Gap",
    triggeredMarkets: ["Match Winner", "Over/Under Goals", "BTTS"],
  },
  form_clash: {
    id: "form_clash",
    name: "Form Clash",
    description:
      "Home attack rate meets a leaky away defence — goals markets are in play.",
    category: "table",
    badgeLabel: "Form Clash",
    triggeredMarkets: ["Over/Under Goals", "BTTS", "Anytime Scorer"],
  },
  relegation_fight: {
    id: "relegation_fight",
    name: "Relegation Fight",
    description:
      "Both clubs sit in the bottom three — tension raises cards and late goals.",
    category: "table",
    badgeLabel: "Relegation Fight",
    triggeredMarkets: ["Player Cards", "Team Cards", "Over/Under Goals"],
  },
};
