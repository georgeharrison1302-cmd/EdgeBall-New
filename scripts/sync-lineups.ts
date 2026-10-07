import { cadence } from "../src/utils/api-football/cadence";
import { createIngestClient } from "../src/utils/supabase/admin";

const WINDOW_MS = cadence.lineupsBefore;
const REQUEST_GAP_MS = 200;

type ApiLineup = {
  team?: { id?: number | null } | null;
  formation?: string | null;
  coach?: { id?: number | null; name?: string | null; photo?: string | null } | null;
  startXI?: unknown;
  substitutes?: unknown;
};

type LineupsEnvelope = {
  response?: ApiLineup[];
};

type LineupRow = {
  fixture_id: number;
  team_id: number;
  formation: string | null;
  coach: unknown;
  start_xi: unknown;
  substitutes: unknown;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const fixtureIds = await upcomingFixtureIds(supabase);
  console.log(`lineup window fixtures ${fixtureIds.length} (next 90 minutes)`);

  if (fixtureIds.length === 0) {
    console.log("lineup sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, fixtureId] of fixtureIds.entries()) {
    try {
      const payload = await fetchLineups(apiKey, fixtureId);
      const lineups = payload.response ?? [];
      const rows = lineups
        .map((lineup) => mapLineup(fixtureId, lineup))
        .filter((row): row is LineupRow => row != null);

      if (rows.length > 0) {
        const { error } = await supabase.from("fixture_lineups").upsert(rows, {
          onConflict: "fixture_id,team_id",
        });
        if (error) throw error;
        cached += rows.length;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: cached ${rows.length} teams`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: no lineups`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: failed ${
          cause instanceof Error ? cause.message : cause
        }`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`lineup sync done cached=${cached} skipped=${skipped}`);
}

async function upcomingFixtureIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + WINDOW_MS).toISOString();
  const ids: number[] = [];

  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id")
      .gte("date", from)
      .lt("date", to)
      .order("date")
      .range(start, start + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
    if (!data || data.length < 1000) break;
  }

  return ids;
}

async function fetchLineups(apiKey: string, fixtureId: number) {
  const url = new URL("https://v3.football.api-sports.io/fixtures/lineups");
  url.searchParams.set("fixture", String(fixtureId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as LineupsEnvelope;
}

function mapLineup(fixtureId: number, lineup: ApiLineup): LineupRow | null {
  const teamId = lineup.team?.id;
  if (!teamId) return null;

  return {
    fixture_id: fixtureId,
    team_id: teamId,
    formation: lineup.formation ?? null,
    coach: lineup.coach ?? {},
    start_xi: lineup.startXI ?? [],
    substitutes: lineup.substitutes ?? [],
    updated_at: new Date().toISOString(),
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
