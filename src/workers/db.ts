import { createIngestClient } from "@/utils/supabase/admin";

export const REQUEST_GAP_MS = 200;

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function upsertChunks(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize = 200,
) {
  if (rows.length === 0) return;
  const supabase = createIngestClient();
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(index, index + chunkSize), { onConflict });
    if (error) throw error;
  }
}

export async function trackedLeagueIds() {
  const supabase = createIngestClient();
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("leagues")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export async function currentLeagueSeasons() {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("league_seasons")
    .select("league_id, year")
    .eq("current", true);
  if (error) throw error;
  const tracked = new Set(await trackedLeagueIds());
  return (data ?? [])
    .map((row) => ({
      leagueId: Number(row.league_id),
      season: Number(row.year),
    }))
    .filter(
      (row) =>
        Number.isInteger(row.leagueId) &&
        row.leagueId > 0 &&
        Number.isInteger(row.season) &&
        tracked.has(row.leagueId),
    );
}
