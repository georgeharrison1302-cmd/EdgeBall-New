import { cadence } from "@/utils/api-football/cadence";
import { runTsx } from "@/workers/run-tsx";
import type { WorkerJob } from "@/workers/types";

export const prematchJobs: WorkerJob[] = [
  {
    id: "lineups",
    lane: "prematch",
    endpoints: ["/fixtures/lineups"],
    intervalMs: cadence.lineupsPoll,
    requiresPrematchWindow: true,
    description: "Starting XIs. Poll from 90 minutes before kickoff.",
    run: () => runTsx("scripts/sync-lineups.ts"),
  },
];
