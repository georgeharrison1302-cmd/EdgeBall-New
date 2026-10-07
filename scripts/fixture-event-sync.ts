import { createIngestClient } from "../src/utils/supabase/admin";

export type ApiEvent = {
  time?: { elapsed?: number | null; extra?: number | null } | null;
  team?: { id?: number | null } | null;
  player?: { id?: number | null; name?: string | null } | null;
  assist?: { id?: number | null; name?: string | null } | null;
  type?: string | null;
  detail?: string | null;
  comments?: string | null;
};

type EventsEnvelope = {
  response?: ApiEvent[];
};

export type EventRow = {
  fixture_id: number;
  team_id: number | null;
  time_elapsed: number | null;
  time_extra: number | null;
  type: string | null;
  detail: string | null;
  player_id: number | null;
  player_name: string | null;
  assist_id: number | null;
  assist_name: string | null;
  comments: string | null;
  event_data: ApiEvent;
};

export async function upsertFixtureEvents(
  supabase: ReturnType<typeof createIngestClient>,
  apiKey: string,
  fixtureId: number,
) {
  const payload = await fetchEvents(apiKey, fixtureId);
  const rows = (payload.response ?? [])
    .map((event) => mapEvent(fixtureId, event))
    .filter((row): row is EventRow => row != null);

  if (rows.length === 0) return 0;

  // Replace fixture sheet so re-syncs stay idempotent (matches ingest-detail).
  const { error: deleteError } = await supabase
    .from("fixture_events")
    .delete()
    .eq("fixture_id", fixtureId);
  if (deleteError) throw deleteError;

  const { error } = await supabase.from("fixture_events").insert(rows);
  if (error) throw error;
  return rows.length;
}

/** Card-only subset used when callers only need booking settlement inputs. */
export function cardEventsOnly(rows: EventRow[]): EventRow[] {
  return rows.filter((row) => {
    const type = String(row.type ?? "").toLowerCase();
    const detail = String(row.detail ?? "").toLowerCase();
    return (
      type.includes("card") ||
      detail === "yellow card" ||
      detail === "second yellow card" ||
      detail === "red card"
    );
  });
}

async function fetchEvents(apiKey: string, fixtureId: number) {
  const url = new URL("https://v3.football.api-sports.io/fixtures/events");
  url.searchParams.set("fixture", String(fixtureId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as EventsEnvelope;
}

function mapEvent(fixtureId: number, event: ApiEvent): EventRow {
  return {
    fixture_id: fixtureId,
    team_id: event.team?.id ?? null,
    time_elapsed: event.time?.elapsed ?? null,
    time_extra: event.time?.extra ?? null,
    type: event.type ?? null,
    detail: event.detail ?? null,
    player_id: event.player?.id ?? null,
    player_name: event.player?.name ?? null,
    assist_id: event.assist?.id ?? null,
    assist_name: event.assist?.name ?? null,
    comments: event.comments ?? null,
    event_data: event,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
