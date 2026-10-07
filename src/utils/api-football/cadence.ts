/** How often each endpoint is allowed to hit the API. */
export const cadence = {
  timezone: Number.POSITIVE_INFINITY,
  countries: 7 * 24 * 60 * 60 * 1000,
  seasons: 7 * 24 * 60 * 60 * 1000,
  oddsCatalogs: 3 * 24 * 60 * 60 * 1000,
  bookmakers: 3 * 24 * 60 * 60 * 1000,
  bets: 3 * 24 * 60 * 60 * 1000,
  liveBets: 3 * 24 * 60 * 60 * 1000,
  leagues: 24 * 60 * 60 * 1000,
  teams: 24 * 60 * 60 * 1000,
  squads: 24 * 60 * 60 * 1000,
  standings: 60 * 60 * 1000,
  injuries: 4 * 60 * 60 * 1000,
  coaches: 24 * 60 * 60 * 1000,
  teamStatistics: 12 * 60 * 60 * 1000,
  predictions: 60 * 60 * 1000,
  odds: 3 * 60 * 60 * 1000,
  /** Start fetching lineups 90 minutes before kickoff. */
  lineupsBefore: 90 * 60 * 1000,
  lineupsPoll: 5 * 60 * 1000,
  liveFixtures: 20 * 1000,
  live: 15 * 1000,
  liveEvents: 15 * 1000,
  liveOdds: 15 * 1000,
  liveStats: 60 * 1000,
  fixturePlayers: 60 * 1000,
  /** Matchday live worker polls scores/events/stats/players on this interval. */
  footballLivePoll: 60 * 1000,
} as const;

export function isFresh(at: string | null | undefined, intervalMs: number) {
  if (!at) return false;
  if (!Number.isFinite(intervalMs) || intervalMs === Number.POSITIVE_INFINITY) {
    return true;
  }
  const then = new Date(at).getTime();
  if (!Number.isFinite(then)) return false;
  return Date.now() - then < intervalMs;
}
