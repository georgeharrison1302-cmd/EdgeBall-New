import { ingestTargetVenues } from "../src/utils/api-football/ingest";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const result = await ingestTargetVenues();
  let total = 0;

  for (const item of result.ingested) {
    total += item.venues;
    console.log(`${item.country}: ${item.venues}`);
  }

  console.log(`countries: ${result.ingested.length}`);
  console.log(`venues: ${total}`);

  if (result.failed.length > 0) {
    console.log("failed:");
    for (const item of result.failed) {
      console.log(`- ${item.country}: ${item.error}`);
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
