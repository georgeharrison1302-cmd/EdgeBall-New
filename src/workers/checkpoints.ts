import { createIngestClient } from "@/utils/supabase/admin";
import { isFresh } from "@/utils/api-football/cadence";

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"] as const;

export function checkpointId(jobId: string) {
  return `worker:${jobId}`;
}

export async function jobIsFresh(jobId: string, intervalMs: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("last_run_at")
    .eq("id", checkpointId(jobId))
    .maybeSingle();
  if (error) throw error;
  return isFresh(data?.last_run_at ? String(data.last_run_at) : null, intervalMs);
}

export async function markJob(jobId: string, status: string, params: Record<string, unknown> = {}) {
  const supabase = createIngestClient();
  const { error } = await supabase.from("ingest_checkpoints").upsert(
    {
      id: checkpointId(jobId),
      resource: jobId,
      params,
      last_status: status,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function liveFixtureIds() {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...LIVE_STATUSES]);
  if (error) throw error;
  return (data ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function prematchWindowFixtureIds(windowMs: number) {
  const supabase = createIngestClient();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + windowMs).toISOString();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id")
    .gte("date", from)
    .lt("date", to);
  if (error) throw error;
  return (data ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}
