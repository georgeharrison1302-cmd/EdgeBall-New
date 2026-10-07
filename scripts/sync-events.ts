import { createIngestClient } from "../src/utils/supabase/admin";
import { sleep, upsertFixtureEvents } from "./fixture-event-sync";

const LIVE_STATUSES = ["1H", "HT", "2H", "ET"] as const;
const FINISHED_STATUSES = ["FT", "AET", "PEN"] as const;
const RECENT_FINISHED_MS = 3 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 200;

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const fixtureIds = await eventFixtureIds(supabase);
  console.log(`event fixtures ${fixtureIds.length} (live + recently finished)`);

  if (fixtureIds.length === 0) {
    console.log("event sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, fixtureId] of fixtureIds.entries()) {
    try {
      const count = await upsertFixtureEvents(supabase, apiKey, fixtureId);
      if (count > 0) {
        cached += count;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: cached ${count} events`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: no events`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: failed ${
          cause instanceof Error ? cause.message : cause
        }`,
      );
    }

    await sleep(REQUEST_GAP_MS);
  }

  console.log(`event sync done cached=${cached} skipped=${skipped}`);
}

async function eventFixtureIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();

  const live = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...LIVE_STATUSES]);
  if (live.error) throw live.error;
  addIds(ids, live.data);

  const from = new Date(Date.now() - RECENT_FINISHED_MS).toISOString();
  const to = new Date().toISOString();
  const finished = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...FINISHED_STATUSES])
    .gte("date", from)
    .lt("date", to);
  if (finished.error) throw finished.error;
  addIds(ids, finished.data);

  return [...ids];
}

function addIds(ids: Set<number>, rows: Array<{ id?: unknown }> | null) {
  for (const row of rows ?? []) {
    const id = Number(row.id);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
