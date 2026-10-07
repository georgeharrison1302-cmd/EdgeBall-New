import { cadence } from "@/utils/api-football/cadence";
import { jobIsFresh, markJob } from "@/workers/checkpoints";
import { runTsx } from "@/workers/run-tsx";
import {
  assertNoOddsEndpoints,
  FOOTBALL_HOURLY_ENDPOINTS,
} from "@/workers/football/endpoints";

const JOB_ID = "football-hourly";
const TEAM_STATS_JOB_ID = "football-hourly-team-statistics";

export async function runFootballHourly(options: { force?: boolean } = {}) {
  assertNoOddsEndpoints(FOOTBALL_HOURLY_ENDPOINTS, JOB_ID);
  console.log(`${JOB_ID} start ${FOOTBALL_HOURLY_ENDPOINTS.join(" ")}`);

  await runTsx("scripts/sync-standings-2026.ts");
  await runTsx("scripts/sync-predictions.ts");
  await refreshTeamStatistics(options.force === true);

  await markJob(JOB_ID, "ok", { endpoints: [...FOOTBALL_HOURLY_ENDPOINTS] });
  console.log(`${JOB_ID} done`);
}

async function refreshTeamStatistics(force: boolean) {
  if (!force && (await jobIsFresh(TEAM_STATS_JOB_ID, cadence.teamStatistics))) {
    console.log("team statistics still fresh (<12h); skip /teams/statistics");
    return;
  }

  await runTsx("scripts/sync-team-statistics.ts");
  await markJob(TEAM_STATS_JOB_ID, "ok", { endpoints: ["/teams/statistics"] });
}
