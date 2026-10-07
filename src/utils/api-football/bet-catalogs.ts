declare const prematchBet: unique symbol;
declare const liveBet: unique symbol;

/** An id from /odds/bets. It is only valid on /odds. */
export type PrematchBetId = number & { readonly [prematchBet]: "prematch" };

/** An id from /odds/live/bets. It is only valid on /odds/live. */
export type LiveBetId = number & { readonly [liveBet]: "live" };

function prematch(id: number): PrematchBetId {
  return id as PrematchBetId;
}

function live(id: number): LiveBetId {
  return id as LiveBetId;
}

/**
 * Pre-match bet ids from /odds/bets. Id 1 is Match Winner.
 * Never pass one of these to /odds/live.
 */
export const prematchBets = {
  source: "/odds/bets" as const,
  matchWinner: prematch(1),
  goalsOverUnder: prematch(5),
  bothTeamsToScore: prematch(8),
  doubleChance: prematch(12),
  totalHome: prematch(16),
  totalAway: prematch(17),
  anytimeGoalScorer: prematch(92),
  playerAssists: prematch(212),
  homePlayerShots: prematch(240),
  awayPlayerShots: prematch(241),
  homePlayerAssists: prematch(255),
  awayPlayerAssists: prematch(256),
  playerFoulsCommitted: prematch(266),
  homePlayerShotsOnTarget: prematch(269),
  homePlayerFoulsCommitted: prematch(271),
  homePlayerTackles: prematch(272),
  awayPlayerShotsOnTarget: prematch(275),
  awayPlayerShotsTotal: prematch(276),
  awayPlayerFoulsCommitted: prematch(277),
  awayPlayerTackles: prematch(278),
  playerToBeBooked: prematch(102),
  /** Odds-API.io mapped — not an API-Football /odds/bets id. */
  playerFoulsDrawn: prematch(90266),
  playerTacklesAny: prematch(90272),
  goalkeeperSaves: prematch(90270),
} as const;

/** Bet365 from /odds/bookmakers. */
export const BET365_BOOKMAKER_ID = 8;

/**
 * Live bet ids from /odds/live/bets. Id 1 is Over/Under Extra Time, not Match Winner.
 * Never pass one of these to /odds.
 */
export const liveBets = {
  source: "/odds/live/bets" as const,
  overUnderExtraTime: live(1),
  extraTimeDoubleResult: live(5),
  methodOfVictory: live(8),
  extraTime1x2FirstHalf: live(12),
  fulltimeResult: live(59),
  playerToBeBooked: live(115),
} as const;

export const PREMATCH_CORE_BET_IDS = [
  prematchBets.matchWinner,
  prematchBets.goalsOverUnder,
  prematchBets.bothTeamsToScore,
] as const satisfies readonly PrematchBetId[];

/** Player booking market. 251 is a duplicate catalog name; 102 is the pre-match id we fetch. */
export const PREMATCH_PLAYER_CARD_BET_IDS = [
  prematchBets.playerToBeBooked,
  prematch(251),
] as const satisfies readonly PrematchBetId[];

/**
 * Player prop markets stored on Bet365 `prematch_odds` (name-line or player_id).
 * Includes cards + shots / SOT / fouls / anytime scorer.
 */
export const PREMATCH_PLAYER_PROP_BET_IDS = [
  prematchBets.playerToBeBooked,
  prematch(251),
  prematchBets.anytimeGoalScorer,
  prematchBets.homePlayerShots,
  prematchBets.awayPlayerShots,
  prematchBets.playerFoulsCommitted,
  prematchBets.homePlayerFoulsCommitted,
  prematchBets.awayPlayerFoulsCommitted,
  prematchBets.homePlayerShotsOnTarget,
  prematchBets.awayPlayerShotsOnTarget,
  prematchBets.awayPlayerShotsTotal,
] as const satisfies readonly PrematchBetId[];

/** In-play player booking market from /odds/live/bets. */
export const LIVE_PLAYER_CARD_BET_IDS = [
  liveBets.playerToBeBooked,
] as const satisfies readonly LiveBetId[];

export const PRE_MATCH_BET_MATCH_WINNER = prematchBets.matchWinner;
export const LIVE_BET_FULLTIME_RESULT = liveBets.fulltimeResult;

/** Brand an id that arrived on /odds or /odds/bets. Never use for /odds/live. */
export function betIdFromPrematchPayload(id: number): PrematchBetId {
  return prematch(id);
}

/** Brand an id that arrived on /odds/live or /odds/live/bets. Never use for /odds. */
export function betIdFromLivePayload(id: number): LiveBetId {
  return live(id);
}

/** Numeric ids for Supabase filters on pre-match `odds.market_id` / `bets`. */
export function prematchMarketIds(...ids: PrematchBetId[]): number[] {
  return ids;
}

/** Numeric ids for Supabase filters on live odds / `live_bets`. */
export function liveMarketIds(...ids: LiveBetId[]): number[] {
  return ids;
}
