import { ingestTargetFixtures } from "../src/utils/api-football/ingest";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const result = await ingestTargetFixtures();
  let total = 0;

  for (const item of result.ingested) {
    total += item.fixtures;
    console.log(
      `${item.leagueId} ${item.name} (${item.country ?? "?"}) ${item.season}: ${item.fixtures}`,
    );
  }

  console.log(`leagues: ${result.ingested.length}`);
  console.log(`fixtures: ${total}`);

  if (result.failed.length > 0) {
    console.log("failed:");
    for (const item of result.failed) {
      console.log(`- ${item.leagueId} ${item.name} ${item.season}: ${item.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  if (error instanceof ApiFootballError) {
    console.error(error.message, error.body ?? "");
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
