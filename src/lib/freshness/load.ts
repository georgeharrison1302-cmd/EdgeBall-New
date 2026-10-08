import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";

export type FreshnessJob = "odds" | "lineups" | "results" | "tips" | "reference";

export type FreshnessItem = {
  job: FreshnessJob;
  label: string;
  at: string;
  ok: boolean;
  stale: boolean;
};

const LABELS: Record<FreshnessJob, { label: string; staleMs: number }> = {
  odds: { label: "Odds", staleMs: 6 * 60 * 60 * 1000 },
  lineups: { label: "Lineups", staleMs: 60 * 60 * 1000 },
  results: { label: "Results", staleMs: 2 * 60 * 60 * 1000 },
  tips: { label: "Model", staleMs: 2 * 60 * 60 * 1000 },
  reference: { label: "Fixtures", staleMs: 6 * 60 * 60 * 1000 },
};

/** Last successful-run heartbeats written by scripts/run-job.ts. */
export async function loadFreshness(jobs: FreshnessJob[]): Promise<FreshnessItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("id, last_run_at, last_status")
    .in("id", jobs.map((job) => `heartbeat:${job}`));
  if (error || !data) return [];
  const now = Date.now();
  return data.flatMap((row) => {
    const job = String(row.id).replace("heartbeat:", "") as FreshnessJob;
    const meta = LABELS[job];
    if (!meta || !row.last_run_at) return [];
    const age = now - Date.parse(row.last_run_at);
    return [
      {
        job,
        label: meta.label,
        at: row.last_run_at,
        ok: row.last_status === "ok",
        stale: !Number.isFinite(age) || age > meta.staleMs,
      },
    ];
  });
}

export function ago(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
