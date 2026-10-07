import "server-only";

/**
 * API-Football odds ingest is disabled. Odds-API.io is the only betting-odds source.
 */
export async function syncUpcomingPrematchOdds() {
  console.log("API-Football odds ingest is disabled. Run npm run sync:odds-api-io");
  return { fetched: 0, stored: 0, skippedFresh: 0 };
}
