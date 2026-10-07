export const WORKER_LANES = [
  "reference",
  "bootstrap",
  "daytime",
  "prematch",
  "live",
  "minute",
] as const;

export type WorkerLane = (typeof WORKER_LANES)[number];

export type WorkerJob = {
  id: string;
  lane: WorkerLane;
  endpoints: readonly string[];
  intervalMs: number;
  description: string;
  /** Skip this tick when the match window is empty. */
  requiresLive?: boolean;
  requiresPrematchWindow?: boolean;
  run: () => Promise<unknown>;
};

export type JobRun = {
  id: string;
  skipped: boolean;
  reason?: string;
  startedAt: string;
  finishedAt: string;
  error?: string;
};
