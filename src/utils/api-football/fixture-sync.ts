import "server-only";
import { createIngestClient } from "@/utils/supabase/admin";
import { ApiFootballQuotaError, isEmptyApiResponse } from "./client";
import { getFixtures, getLiveFixtures } from "./endpoints";
import { persistFixtureResponse, sleep } from "./ingest";
import { getActiveSeasonYear } from "./season";

/** Wait between live fixture calls. One call, then this delay, then the next. */
export const LIVE_FIXTURE_GAP_MS = 20_000;

/** Keep each `live=` value short enough for the request URL. */
const LIVE_PARAM_LIMIT = 1_800;

export function utcDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export async function activeLeagueIds() {
  const supabase = createIngestClient();
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("leagues").select("id").order("id").range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) ids.push(Number(row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export function liveLeagueGroups(ids: number[]) {
  const groups: string[] = [];
  let batch: number[] = [];
  let length = 0;
  for (const id of ids) {
    const part = String(id);
    const next = length + (batch.length > 0 ? 1 : 0) + part.length;
    if (batch.length > 0 && next > LIVE_PARAM_LIMIT) {
      groups.push(batch.join("-"));
      batch = [id];
      length = part.length;
      continue;
    }
    batch.push(id);
    length = next;
  }
  if (batch.length > 0) groups.push(batch.join("-"));
  return groups;
}

export async function syncFixtureSchedule() {
  const from = utcDay(0);
  const to = utcDay(7);
  const leagues = await activeLeagueIds();
  console.log(`active leagues ${leagues.length}`);
  console.log(`fetching /fixtures from=${from} to=${to}`);

  let stored = 0;
  let skipped = 0;
  const supabase = createIngestClient();

  for (let index = 0; index < leagues.length; index += 1) {
    const leagueId = leagues[index];
    const checkpointId = `fixtures:schedule:${from}:${leagueId}`;
    const { data: checkpoint, error: checkpointError } = await supabase
      .from("ingest_checkpoints")
      .select("last_status")
      .eq("id", checkpointId)
      .maybeSingle();
    if (checkpointError) throw checkpointError;
    if (String(checkpoint?.last_status ?? "").startsWith("ok")) {
      skipped += 1;
      continue;
    }

    const season = await getActiveSeasonYear(leagueId);
    if (season == null) {
      console.log(`no current season league=${leagueId}`);
      continue;
    }

    try {
      const envelope = await getFixtures({ league: leagueId, season, from, to });
      if (isEmptyApiResponse(envelope)) {
        console.log(`Data Not Yet Available resource=fixtures league=${leagueId} season=${season}`);
        await markSchedule(checkpointId, leagueId, season, from, to, "ok:0");
        continue;
      }
      const saved = await persistFixtureResponse(envelope.response);
      await markSchedule(checkpointId, leagueId, season, from, to, `ok:${saved.fixtures}`);
      stored += saved.fixtures;
      console.log(`fixtures league=${leagueId} season=${season}: ${saved.fixtures}`);
    } catch (cause) {
      if (cause instanceof ApiFootballQuotaError) {
        console.log("stopped before the daily quota reserve");
        break;
      }
      console.log(`fixtures league=${leagueId} season=${season} failed ${cause instanceof Error ? cause.message : cause}`);
    }

    if ((index + 1) % 25 === 0) console.log(`fixtures progress ${index + 1}/${leagues.length}`);
  }

  console.log(`fixture schedule done stored=${stored} skipped=${skipped}`);
  return { fixtures: stored, from, to };
}

async function markSchedule(
  id: string,
  leagueId: number,
  season: number,
  from: string,
  to: string,
  lastStatus: string,
) {
  const supabase = createIngestClient();
  const { error } = await supabase.from("ingest_checkpoints").upsert(
    {
      id,
      resource: "fixtures",
      params: { leagueId, season, from, to },
      last_status: lastStatus,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function syncLiveFixturesOnce() {
  const groups = liveLeagueGroups(await activeLeagueIds());
  let fixtures = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (index > 0) await sleep(LIVE_FIXTURE_GAP_MS);
    const envelope = await getLiveFixtures(groups[index]);
    if (isEmptyApiResponse(envelope)) {
      console.log("Data Not Yet Available resource=live-fixtures");
      continue;
    }
    const saved = await persistFixtureResponse(envelope.response);
    fixtures += saved.fixtures;
    console.log(`live fixtures ${saved.fixtures} status and scores updated`);
  }
  return { fixtures, calls: groups.length };
}

export async function runLiveFixturePoll() {
  for (;;) {
    try {
      await syncLiveFixturesOnce();
    } catch (cause) {
      if (cause instanceof ApiFootballQuotaError) {
        console.log("stopped before the daily quota reserve");
        return;
      }
      console.log(`live fixtures failed ${cause instanceof Error ? cause.message : cause}`);
    }
    await sleep(LIVE_FIXTURE_GAP_MS);
  }
}
