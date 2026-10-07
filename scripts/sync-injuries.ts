import { createIngestClient } from "../src/utils/supabase/admin";
import type { ApiInjuryItem } from "../src/utils/api-football/endpoints";

const TIMEZONE = "Europe/London";
const LIVE_STATUSES = ["1H", "HT", "2H", "ET"] as const;
const REQUEST_GAP_MS = 200;

type InjuriesEnvelope = {
  response?: ApiInjuryItem[];
};

type InjuryRow = {
  fixture_id: number;
  team_id: number | null;
  player_id: number;
  player_name: string | null;
  player_photo: string | null;
  type: string | null;
  reason: string | null;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const fixtureIds = await targetFixtureIds(supabase);
  console.log(`injury fixtures ${fixtureIds.length} (today + live)`);

  if (fixtureIds.length === 0) {
    console.log("injury sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, fixtureId] of fixtureIds.entries()) {
    try {
      const payload = await fetchInjuries(apiKey, fixtureId);
      const rows = uniqueInjuries(
        (payload.response ?? [])
          .map((item) => mapInjury(fixtureId, item))
          .filter((row): row is InjuryRow => row != null),
      );

      if (rows.length > 0) {
        const { error } = await supabase.from("fixture_injuries").upsert(rows, {
          onConflict: "fixture_id,player_id",
        });
        if (error) throw error;
        cached += rows.length;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: cached ${rows.length} injuries`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: no injuries`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`injury sync done cached=${cached} skipped=${skipped}`);
}

async function targetFixtureIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();
  const { from, to } = londonDayBounds();

  const today = await supabase
    .from("fixtures")
    .select("id")
    .gte("date", from)
    .lt("date", to);
  if (today.error) throw today.error;
  addIds(ids, today.data);

  const live = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...LIVE_STATUSES]);
  if (live.error) throw live.error;
  addIds(ids, live.data);

  return [...ids];
}

async function fetchInjuries(apiKey: string, fixtureId: number) {
  const url = new URL("https://v3.football.api-sports.io/injuries");
  url.searchParams.set("fixture", String(fixtureId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as InjuriesEnvelope;
}

function mapInjury(fixtureId: number, item: ApiInjuryItem): InjuryRow | null {
  const playerId = item.player?.id;
  if (!playerId) return null;

  return {
    fixture_id: item.fixture?.id ?? fixtureId,
    team_id: item.team?.id ?? null,
    player_id: playerId,
    player_name: item.player?.name ?? null,
    player_photo: item.player?.photo ?? null,
    type: item.player?.type ?? null,
    reason: item.player?.reason ?? null,
    updated_at: new Date().toISOString(),
  };
}

function uniqueInjuries(rows: InjuryRow[]) {
  const byKey = new Map<string, InjuryRow>();
  for (const row of rows) {
    byKey.set(`${row.fixture_id}:${row.player_id}`, row);
  }
  return [...byKey.values()];
}

function addIds(ids: Set<number>, rows: Array<{ id?: unknown }> | null) {
  for (const row of rows ?? []) {
    const id = Number(row.id);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
}

function londonDayBounds() {
  const today = londonYmd(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return { from: today, to: tomorrow };
}

function londonYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
