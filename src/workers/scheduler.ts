import { cadence } from "@/utils/api-football/cadence";
import {
  jobIsFresh,
  liveFixtureIds,
  markJob,
  prematchWindowFixtureIds,
} from "@/workers/checkpoints";
import { HOT_LANES, jobById, jobsForLane, jobsForLanes } from "@/workers/registry";
import { sleep } from "@/workers/db";
import { WORKER_LANES, type JobRun, type WorkerJob, type WorkerLane } from "@/workers/types";

export const TICK_MS = 15_000;

export type WorkerOptions = {
  lane?: WorkerLane | "all";
  jobId?: string;
  once?: boolean;
  loop?: boolean;
  force?: boolean;
};

export function parseWorkerArgs(argv: string[]): WorkerOptions {
  const options: WorkerOptions = { once: true, loop: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--loop") {
      options.loop = true;
      options.once = false;
      continue;
    }
    if (arg === "--once") {
      options.once = true;
      options.loop = false;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--lane") {
      const value = argv[index + 1];
      index += 1;
      if (value === "all" || (WORKER_LANES as readonly string[]).includes(value ?? "")) {
        options.lane = value as WorkerLane | "all";
      } else {
        throw new Error(`unknown lane ${value ?? ""}`);
      }
      continue;
    }
    if (arg === "--job") {
      options.jobId = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

export async function runWorker(options: WorkerOptions) {
  const jobs = resolveJobs(options);
  if (jobs.length === 0) {
    throw new Error(options.jobId ? `unknown job ${options.jobId}` : "no jobs selected");
  }

  const label = options.jobId ?? options.lane ?? (options.loop ? HOT_LANES.join(",") : "all");
  console.log(`worker ${options.loop ? "loop" : "once"} ${label} jobs=${jobs.map((job) => job.id).join(",")}`);

  if (!options.loop) {
    const runs = await runJobs(jobs, options.force === true);
    if (runs.some((run) => run.error)) process.exitCode = 1;
    return runs;
  }

  let stop = false;
  const halt = () => {
    stop = true;
  };
  process.on("SIGINT", halt);
  process.on("SIGTERM", halt);

  while (!stop) {
    await runJobs(jobs, options.force === true);
    if (stop) break;
    console.log(`worker sleeping ${TICK_MS / 1000}s`);
    await sleep(TICK_MS);
  }

  process.off("SIGINT", halt);
  process.off("SIGTERM", halt);
  console.log("worker stopped");
}

function resolveJobs(options: WorkerOptions) {
  if (options.jobId) {
    const job = jobById(options.jobId);
    return job ? [job] : [];
  }
  if (options.lane) return jobsForLane(options.lane);
  if (options.loop) return jobsForLanes(HOT_LANES);
  return jobsForLane("all");
}

async function runJobs(jobs: WorkerJob[], force: boolean) {
  const runs: JobRun[] = [];
  for (const job of jobs) {
    const run = await runOne(job, force);
    runs.push(run);
    if (run.error?.toLowerCase().includes("quota")) break;
  }
  const ran = runs.filter((run) => !run.skipped && !run.error).length;
  const skipped = runs.filter((run) => run.skipped).length;
  const failed = runs.filter((run) => run.error).length;
  console.log(`worker tick ran=${ran} skipped=${skipped} failed=${failed}`);
  return runs;
}

async function runOne(job: WorkerJob, force: boolean): Promise<JobRun> {
  const startedAt = new Date().toISOString();
  try {
    if (!force && (await jobIsFresh(job.id, job.intervalMs))) {
      return skip(job.id, startedAt, "fresh");
    }
    if (job.requiresLive && (await liveFixtureIds()).length === 0) {
      return skip(job.id, startedAt, "no live fixtures");
    }
    if (job.requiresPrematchWindow) {
      const ids = await prematchWindowFixtureIds(cadence.lineupsBefore);
      if (ids.length === 0) return skip(job.id, startedAt, "no prematch window");
    }

    console.log(`worker start ${job.id} ${job.endpoints.join(" ")}`);
    await job.run();
    await markJob(job.id, "ok", { endpoints: [...job.endpoints] });
    const finishedAt = new Date().toISOString();
    console.log(`worker ok ${job.id}`);
    return { id: job.id, skipped: false, startedAt, finishedAt };
  } catch (cause) {
    const error = errorMessage(cause);
    const finishedAt = new Date().toISOString();
    try {
      await markJob(job.id, `error:${error.slice(0, 180)}`, { endpoints: [...job.endpoints] });
    } catch {
      // checkpoint write should not hide the original failure
    }
    console.log(`worker error ${job.id}: ${error}`);
    return { id: job.id, skipped: false, startedAt, finishedAt, error };
  }
}

function skip(id: string, startedAt: string, reason: string): JobRun {
  console.log(`worker skip ${id} ${reason}`);
  return {
    id,
    skipped: true,
    reason,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
