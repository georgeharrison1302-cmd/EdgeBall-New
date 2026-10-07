import { cadence } from "@/utils/api-football/cadence";
import { liveFixtureIds, prematchWindowFixtureIds } from "@/workers/checkpoints";
import { sleep } from "@/workers/db";
import { syncFixturePlayers } from "@/workers/jobs/per-minute";
import { runTsx } from "@/workers/run-tsx";
import {
  assertNoOddsEndpoints,
  FOOTBALL_LIVE_ENDPOINTS,
} from "@/workers/football/endpoints";

const JOB_ID = "football-live";

let lastLineupsAt = 0;

export async function runFootballLive(options: { loop?: boolean } = {}) {
  assertNoOddsEndpoints(FOOTBALL_LIVE_ENDPOINTS, JOB_ID);

  if (!options.loop) {
    await tick();
    return;
  }

  let stop = false;
  const halt = () => {
    stop = true;
  };
  process.on("SIGINT", halt);
  process.on("SIGTERM", halt);

  console.log(`${JOB_ID} loop every ${cadence.footballLivePoll / 1000}s`);
  while (!stop) {
    const started = Date.now();
    try {
      await tick();
    } catch (cause) {
      console.error(`${JOB_ID} tick failed: ${errorMessage(cause)}`);
    }
    if (stop) break;
    const wait = cadence.footballLivePoll - (Date.now() - started);
    if (wait > 0) {
      console.log(`${JOB_ID} sleeping ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
    }
  }

  process.off("SIGINT", halt);
  process.off("SIGTERM", halt);
  console.log(`${JOB_ID} stopped`);
}

async function tick() {
  console.log(`${JOB_ID} tick ${FOOTBALL_LIVE_ENDPOINTS.join(" ")}`);
  await syncLineupsIfWindow();
  await syncLiveMatchPayload();
}

async function syncLineupsIfWindow() {
  const fixtureIds = await prematchWindowFixtureIds(cadence.lineupsBefore);
  if (fixtureIds.length === 0) {
    console.log("lineups: no fixtures within 90 minutes of kickoff");
    return;
  }
  if (lastLineupsAt > 0 && Date.now() - lastLineupsAt < cadence.lineupsPoll) {
    console.log(`lineups: ${fixtureIds.length} fixtures in window; next poll in 5m`);
    return;
  }
  console.log(`lineups: ${fixtureIds.length} fixtures in 90-minute window`);
  await runTsx("scripts/sync-lineups.ts");
  lastLineupsAt = Date.now();
}

async function syncLiveMatchPayload() {
  const fixtureIds = await liveFixtureIds();
  if (fixtureIds.length === 0) {
    console.log("live: no active matches");
    return;
  }

  console.log(`live: polling ${fixtureIds.length} matches every 60s`);
  await runTsx("scripts/sync-live.ts");
  await runTsx("scripts/sync-events.ts");
  await runTsx("scripts/sync-fixture-stats.ts");
  await syncFixturePlayers();
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}
