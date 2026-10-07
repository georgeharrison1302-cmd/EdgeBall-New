import { ApiFootballQuotaError } from "../src/utils/api-football/client";
import { bootstrapReferenceData } from "../src/utils/api-football/ingest";

async function main() {
  const result = await bootstrapReferenceData();
  if (result.skipped) return;
  const teamRows = result.teams.reduce((sum, item) => sum + item.teams, 0);
  console.log(
    `countries ${result.countries.count} leagues ${result.leagues.leagues} competitions ${result.teams.length} teams ${teamRows}`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof ApiFootballQuotaError) {
    console.log("stopped: quota reserve");
    process.exit(0);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
