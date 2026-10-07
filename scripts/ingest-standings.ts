import { ingestTargetStandings } from "../src/utils/api-football/ingest";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const result = await ingestTargetStandings();
  let total = 0;

  for (const item of result.ingested) {
    total += item.standings;
    console.log(
      `${item.leagueId} ${item.name} (${item.country ?? "?"}) ${item.season}: ${item.standings} rows / ${item.groups} table(s)`,
    );
  }

  console.log(`with standings: ${result.ingested.length}`);
  console.log(`rows: ${total}`);

  if (result.skipped.length > 0) {
    console.log("skipped:");
    for (const item of result.skipped) {
      console.log(`- ${item.leagueId} ${item.name} ${item.season}: ${item.reason}`);
    }
  }

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
