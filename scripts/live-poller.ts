import { createIngestClient } from "../src/utils/supabase/admin";
import { sleep, upsertFixtureEvents } from "./fixture-event-sync";

const ACTIVE_STATUSES = ["1H", "HT", "2H", "ET"] as const;
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const POLL_MS = 60_000;
const REQUEST_GAP_MS = 200;
const TIMEZONE = "Europe/London";

type ApiFixtureItem = {
  fixture?: {
    id?: number;
    timezone?: string | null;
    status?: { short?: string | null; long?: string | null; elapsed?: number | null } | null;
  };
  goals?: { home?: number | null; away?: number | null } | null;
  score?: unknown;
};

type FixturesEnvelope = {
  response?: ApiFixtureItem[];
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const previousLive = new Set<number>();

  while (true) {
    const liveIds = await activeFixtureIds(supabase);
    const droppedIds = [...previousLive].filter((id) => !liveIds.includes(id));

    if (liveIds.length === 0 && droppedIds.length === 0) {
      console.log("no live matches; exiting");
      return;
    }

    const finishedThisCycle = new Set<number>(droppedIds);
    const stillLive = new Set<number>();

    if (liveIds.length > 0) {
      console.log(`polling ${liveIds.length} live fixtures: ${liveIds.join(",")}`);
      const items = await fetchLiveFixtures(apiKey, liveIds);
      await updateFixtures(supabase, items);

      for (const item of items) {
        const id = item.fixture?.id;
        const short = item.fixture?.status?.short ?? "";
        if (!id) continue;
        if (FINISHED_STATUSES.has(short)) {
          finishedThisCycle.add(id);
        } else if ((ACTIVE_STATUSES as readonly string[]).includes(short)) {
          stillLive.add(id);
        }
      }

      console.log(`updated ${items.length} fixtures`);
    }

    const eventIds = uniqueIds([...liveIds, ...finishedThisCycle]);
    for (const [index, fixtureId] of eventIds.entries()) {
      const isFinal = finishedThisCycle.has(fixtureId);
      try {
        const count = await upsertFixtureEvents(supabase, apiKey, fixtureId);
        console.log(
          `${isFinal ? "final events" : "live events"} ${index + 1}/${eventIds.length} fixture ${fixtureId}: ${count} events`,
        );
      } catch (cause) {
        console.log(
          `${isFinal ? "final events" : "live events"} ${index + 1}/${eventIds.length} fixture ${fixtureId}: failed ${
            cause instanceof Error ? cause.message : cause
          }`,
        );
      }
      await sleep(REQUEST_GAP_MS);
    }

    previousLive.clear();
    for (const id of stillLive) previousLive.add(id);
    for (const id of liveIds) {
      if (!finishedThisCycle.has(id)) previousLive.add(id);
    }

    if (previousLive.size === 0) {
      console.log("no live matches; exiting");
      return;
    }

    console.log(`next poll in 60s (${previousLive.size} still live)`);
    await sleep(POLL_MS);
  }
}

async function activeFixtureIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const { data, error } = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...ACTIVE_STATUSES]);
  if (error) throw error;
  return (data ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function fetchLiveFixtures(apiKey: string, ids: number[]) {
  const items: ApiFixtureItem[] = [];

  for (let index = 0; index < ids.length; index += 20) {
    const chunk = ids.slice(index, index + 20);
    const url = new URL("https://v3.football.api-sports.io/fixtures");
    url.searchParams.set("ids", chunk.join("-"));
    url.searchParams.set("timezone", TIMEZONE);

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API-Football ${response.status}`);
    }

    const payload = (await response.json()) as FixturesEnvelope;
    items.push(...(payload.response ?? []));
  }

  return items;
}

async function updateFixtures(
  supabase: ReturnType<typeof createIngestClient>,
  items: ApiFixtureItem[],
) {
  const rows = items
    .map((item) => {
      const id = item.fixture?.id;
      if (!id) return null;
      return {
        id,
        status_short: item.fixture?.status?.short ?? null,
        status_long: item.fixture?.status?.long ?? null,
        elapsed: item.fixture?.status?.elapsed ?? null,
        timezone: item.fixture?.timezone ?? TIMEZONE,
        home_goals: item.goals?.home ?? null,
        away_goals: item.goals?.away ?? null,
        score: item.score ?? {},
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (rows.length === 0) return;

  const { error } = await supabase.from("fixtures").upsert(rows, {
    onConflict: "id",
  });
  if (error) throw error;
}

function uniqueIds(ids: number[]) {
  return [...new Set(ids)];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
