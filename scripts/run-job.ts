/**
 * Run a named ingestion job (ordered npm scripts) and record a heartbeat in
 * ingest_checkpoints so the site can show data freshness.
 *
 *   npm run job -- lineups | odds | results | tips | reference
 */
import { spawnSync } from "node:child_process";

import { createIngestClient } from "../src/utils/supabase/admin";

export const JOBS: Record<string, string[]> = {
  lineups: ["sync:lineups"],
  odds: ["sync:odds-api-io"],
  results: ["sync:results", "sync:fixture-events", "sync:fixture-stats"],
  tips: ["calc:edges", "sync:model-tips", "grade:model-tips"],
  reference: ["sync:fixtures", "sync:predictions", "sync:injuries"],
};

async function heartbeat(job: string, status: string) {
  const supabase = createIngestClient();
  const { error } = await supabase.from("ingest_checkpoints").upsert(
    {
      id: `heartbeat:${job}`,
      resource: "heartbeat",
      params: { job },
      last_status: status,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error(`heartbeat write failed: ${error.message}`);
}

async function main() {
  const job = process.argv[2];
  const steps = job ? JOBS[job] : undefined;
  if (!job || !steps) {
    console.error(`Usage: npm run job -- <${Object.keys(JOBS).join("|")}>`);
    process.exit(2);
  }

  let failed: string | null = null;
  for (const step of steps) {
    console.log(`\n[job:${job}] npm run ${step}`);
    const result = spawnSync("npm", ["run", step], { stdio: "inherit" });
    if (result.status !== 0) {
      failed = step;
      console.error(`[job:${job}] ${step} failed (exit ${result.status}) — continuing`);
    }
  }

  await heartbeat(job, failed ? `error:${failed}` : "ok");
  process.exit(failed ? 1 : 0);
}

main();
