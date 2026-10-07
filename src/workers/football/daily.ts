import { isEmptyApiResponse } from "@/utils/api-football/client";
import { getTimezones } from "@/utils/api-football/endpoints";
import { ingestTimezones } from "@/utils/api-football/ingest";
import { markJob } from "@/workers/checkpoints";
import { upsertChunks } from "@/workers/db";
import { syncLeagues, syncTeams } from "@/workers/jobs/bootstrap";
import { syncCountries, syncSeasons } from "@/workers/jobs/reference";
import { runTsx } from "@/workers/run-tsx";
import {
  assertNoOddsEndpoints,
  FOOTBALL_DAILY_ENDPOINTS,
} from "@/workers/football/endpoints";

const JOB_ID = "football-daily";

export async function runFootballDaily() {
  assertNoOddsEndpoints(FOOTBALL_DAILY_ENDPOINTS, JOB_ID);
  console.log(`${JOB_ID} start ${FOOTBALL_DAILY_ENDPOINTS.join(" ")}`);

  await refreshTimezones();
  await syncCountries();
  await syncSeasons();
  await syncLeagues();
  await syncTeams();
  await runTsx("scripts/sync-squads.ts");

  await markJob(JOB_ID, "ok", { endpoints: [...FOOTBALL_DAILY_ENDPOINTS] });
  console.log(`${JOB_ID} done`);
}

async function refreshTimezones() {
  const envelope = await getTimezones();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=timezones");
    const fallback = await ingestTimezones();
    return fallback;
  }

  const rows = envelope.response
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name) => ({ name }));
  if (rows.length === 0) {
    console.log("Data Not Yet Available resource=timezones");
    return { count: 0 };
  }

  await upsertChunks("timezones", rows as Record<string, unknown>[], "name");
  console.log(`timezones stored ${rows.length}`);
  return { count: rows.length };
}
