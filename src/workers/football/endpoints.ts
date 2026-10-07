/**
 * API-Football workers for stats and fixtures only.
 * Odds-API.io is the only odds source — these lists must never include /odds.
 */

export const FOOTBALL_DAILY_ENDPOINTS = [
  "/timezone",
  "/countries",
  "/leagues/seasons",
  "/leagues",
  "/teams",
  "/players/squads",
] as const;

export const FOOTBALL_HOURLY_ENDPOINTS = [
  "/standings",
  "/predictions",
  "/teams/statistics",
] as const;

export const FOOTBALL_LIVE_ENDPOINTS = [
  "/fixtures/lineups",
  "/fixtures",
  "/fixtures/events",
  "/fixtures/statistics",
  "/fixtures/players",
] as const;

const ODDS_PATH = /\/odds(\/|$)/i;

export function assertNoOddsEndpoints(endpoints: readonly string[], context: string) {
  const hits = endpoints.filter(
    (endpoint) => ODDS_PATH.test(endpoint) || endpoint.toLowerCase().includes("odds-api"),
  );
  if (hits.length > 0) {
    throw new Error(`${context} must not call odds endpoints: ${hits.join(", ")}`);
  }
}

assertNoOddsEndpoints(FOOTBALL_DAILY_ENDPOINTS, "football-daily");
assertNoOddsEndpoints(FOOTBALL_HOURLY_ENDPOINTS, "football-hourly");
assertNoOddsEndpoints(FOOTBALL_LIVE_ENDPOINTS, "football-live");
