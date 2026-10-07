import { bootstrapJobs } from "@/workers/jobs/bootstrap";
import { daytimeJobs } from "@/workers/jobs/daytime";
import { liveJobs } from "@/workers/jobs/live";
import { minuteJobs } from "@/workers/jobs/per-minute";
import { prematchJobs } from "@/workers/jobs/prematch";
import { referenceJobs } from "@/workers/jobs/reference";
import { WORKER_LANES, type WorkerJob, type WorkerLane } from "@/workers/types";

export const WORKER_JOBS: WorkerJob[] = [
  ...liveJobs,
  ...minuteJobs,
  ...prematchJobs,
  ...daytimeJobs,
  ...bootstrapJobs,
  ...referenceJobs,
];

export const HOT_LANES: WorkerLane[] = ["prematch", "live", "minute"];

export function isWorkerLane(value: string): value is WorkerLane {
  return (WORKER_LANES as readonly string[]).includes(value);
}

export function jobsForLane(lane: WorkerLane | "all") {
  if (lane === "all") return WORKER_JOBS;
  return WORKER_JOBS.filter((job) => job.lane === lane);
}

export function jobsForLanes(lanes: readonly WorkerLane[]) {
  const allow = new Set(lanes);
  return WORKER_JOBS.filter((job) => allow.has(job.lane));
}

export function jobById(id: string) {
  return WORKER_JOBS.find((job) => job.id === id) ?? null;
}
