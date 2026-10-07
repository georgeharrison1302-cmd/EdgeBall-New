import { ApiFootballQuotaError } from "../src/utils/api-football/client";
import { syncFixtureSchedule } from "../src/utils/api-football/fixture-sync";

syncFixtureSchedule().catch((error: unknown) => {
  if (error instanceof ApiFootballQuotaError) {
    console.log("stopped before the daily quota reserve");
    return;
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
