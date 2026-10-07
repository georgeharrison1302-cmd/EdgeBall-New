import { pruneOutOfScope, ingestLeagues } from "../src/utils/api-football/ingest";
import { TARGET_LEAGUE_IDS } from "../src/utils/api-football/competitions";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const pruned = await pruneOutOfScope();
  console.log(`kept league ids: ${pruned.keptLeagues}`);
  console.log(`removed leagues: ${pruned.extraLeagues.length}`);
  for (const league of pruned.extraLeagues) {
    console.log(`- ${league.id} ${league.name}`);
  }
  console.log(`removed fixtures: ${pruned.fixtures}`);
  console.log(`removed teams: ${pruned.teams}`);
  console.log(`removed venues: ${pruned.venues}`);

  try {
    const leagues = await ingestLeagues();
    console.log(`refreshed target leagues: ${leagues.leagues}`);
    console.log(`league_seasons: ${leagues.seasons}`);
  } catch (error) {
    console.error(
      "league refresh needs country_flag_url column:",
      error instanceof Error ? error.message : error,
    );
  }

  console.log(`allowlist size: ${TARGET_LEAGUE_IDS.length}`);
}

main().catch((error) => {
  if (error instanceof ApiFootballError) {
    console.error(error.message, error.body ?? "");
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
