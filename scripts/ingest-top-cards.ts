import { ingestTargetTopCards } from "../src/utils/api-football/ingest";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const result = await ingestTargetTopCards();
  let yellow = 0;
  let red = 0;

  for (const item of result.ingested) {
    yellow += item.yellow;
    red += item.red;
    console.log(
      `${item.leagueId} ${item.name} (${item.country ?? "?"}) ${item.season}: yellow ${item.yellow} / red ${item.red}`,
    );
  }

  console.log(`league-seasons: ${result.ingested.length}`);
  console.log(`yellow rows: ${yellow}`);
  console.log(`red rows: ${red}`);

  if (result.skipped.length > 0) {
    console.log("skipped:");
    for (const item of result.skipped) {
      console.log(
        `- ${item.leagueId} ${item.name} ${item.season} ${item.kind}: ${item.reason}`,
      );
    }
  }

  if (result.failed.length > 0) {
    console.log("failed:");
    for (const item of result.failed) {
      console.log(
        `- ${item.leagueId} ${item.name} ${item.season} ${item.kind}: ${item.error}`,
      );
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
