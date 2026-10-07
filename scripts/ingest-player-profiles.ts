import { ingestTargetPlayerProfiles } from "../src/utils/api-football/ingest";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const result = await ingestTargetPlayerProfiles();
  console.log(`in-scope players: ${result.requested}`);
  console.log(`profiles updated: ${result.updated}`);

  if (result.failed.length > 0) {
    console.log("failed:");
    for (const item of result.failed.slice(0, 25)) {
      console.log(`- ${item.playerId}: ${item.error}`);
    }
    if (result.failed.length > 25) {
      console.log(`- … ${result.failed.length - 25} more`);
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
