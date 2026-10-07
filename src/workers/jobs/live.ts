import { cadence } from "@/utils/api-football/cadence";
import { runTsx } from "@/workers/run-tsx";
import type { WorkerJob } from "@/workers/types";

export const liveJobs: WorkerJob[] = [
  {
    id: "live-fixtures",
    lane: "live",
    endpoints: ["/fixtures"],
    intervalMs: cadence.liveFixtures,
    description: "Live scores, status, elapsed time. 15–60s during matches.",
    run: () => runTsx("scripts/sync-live.ts"),
  },
  {
    id: "live-events",
    lane: "live",
    endpoints: ["/fixtures/events"],
    intervalMs: cadence.liveEvents,
    requiresLive: true,
    description: "Goals, cards, substitutions. 15–60s during matches.",
    run: () => runTsx("scripts/sync-events.ts"),
  },
  {
    id: "live-odds",
    lane: "live",
    endpoints: ["odds-api.io/v3/odds"],
    intervalMs: 60 * 1000,
    requiresLive: true,
    description: "In-play odds from Odds-API.io only (same worker as prematch). Writes live_odds.",
    run: () => runTsx("src/scripts/sync-odds-api-io.ts"),
  },
];
