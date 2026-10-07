import { cadence } from "@/utils/api-football/cadence";
import { runTsx } from "@/workers/run-tsx";
import type { WorkerJob } from "@/workers/types";

export const daytimeJobs: WorkerJob[] = [
  {
    id: "standings",
    lane: "daytime",
    endpoints: ["/standings"],
    intervalMs: cadence.standings,
    description: "League tables. Hourly.",
    run: () => runTsx("scripts/sync-standings-2026.ts"),
  },
  {
    id: "injuries",
    lane: "daytime",
    endpoints: ["/injuries"],
    intervalMs: cadence.injuries,
    description: "Injury list. Every 4 hours.",
    run: () => runTsx("scripts/sync-injuries.ts"),
  },
  {
    id: "coaches",
    lane: "daytime",
    endpoints: ["/coachs"],
    intervalMs: cadence.coaches,
    description: "Team coaches. Daily.",
    run: () => runTsx("scripts/sync-coaches.ts"),
  },
  {
    id: "team-statistics",
    lane: "daytime",
    endpoints: ["/teams/statistics"],
    intervalMs: cadence.teamStatistics,
    description: "Team season statistics. Twice daily.",
    run: () => runTsx("scripts/sync-team-statistics.ts"),
  },
  {
    id: "predictions",
    lane: "daytime",
    endpoints: ["/predictions"],
    intervalMs: cadence.predictions,
    description: "API-Football fixture predictions. Hourly.",
    run: () => runTsx("scripts/sync-predictions.ts"),
  },
  {
    id: "odds-api-io",
    lane: "daytime",
    endpoints: ["odds-api.io/v3/odds"],
    intervalMs: 60 * 1000,
    description: "Odds-API.io is the only odds source. Bet365/Paddy Power every 60s into prematch_odds and live_odds.",
    run: () => runTsx("src/scripts/sync-odds-api-io.ts"),
  },
];
