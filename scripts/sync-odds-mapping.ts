import { createIngestClient } from "../src/utils/supabase/admin";

const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type ApiMappingItem = {
  league?: {
    id?: number | null;
    season?: number | null;
  } | null;
  fixture?: {
    id?: number | null;
    date?: string | null;
    timestamp?: number | null;
  } | null;
  update?: string | null;
};

type MappingEnvelope = {
  paging?: { current?: number; total?: number };
  response?: ApiMappingItem[];
};

type MappingRow = {
  fixture_id: number;
  league_id: number | null;
  season: number | null;
  fixture_date: string | null;
  fixture_timestamp: number | null;
  update_time: string | null;
  mapping_data: ApiMappingItem;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  let cached = 0;
  let skipped = 0;

  for (let page = 1; ; page += 1) {
    if (page > 1) {
      await sleep(REQUEST_GAP_MS);
    }

    try {
      const payload = await fetchMappingPage(apiKey, page);
      const totalPages = Math.max(1, payload.paging?.total ?? 1);
      const rows = uniqueRows(
        (payload.response ?? [])
          .map(mapItem)
          .filter((row): row is MappingRow => row != null),
      );

      if (rows.length > 0) {
        await upsertRows(supabase, rows);
        cached += rows.length;
      } else {
        skipped += 1;
      }

      console.log(
        `odds mapping page ${page}/${totalPages}: cached ${rows.length} fixtures (total cached=${cached})`,
      );

      if (page >= totalPages) break;
    } catch (cause) {
      console.log(`odds mapping page ${page}: failed ${errorMessage(cause)}`);
      throw cause;
    }
  }

  console.log(`odds mapping sync done cached=${cached} emptyPages=${skipped}`);
}

async function fetchMappingPage(apiKey: string, page: number) {
  const url = new URL("https://v3.football.api-sports.io/odds/mapping");
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as MappingEnvelope;
}

function mapItem(item: ApiMappingItem): MappingRow | null {
  const fixtureId = Number(item.fixture?.id);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) return null;

  const leagueId = Number(item.league?.id);
  const season = Number(item.league?.season);
  const timestamp = Number(item.fixture?.timestamp);

  return {
    fixture_id: fixtureId,
    league_id: Number.isInteger(leagueId) && leagueId > 0 ? leagueId : null,
    season: Number.isInteger(season) && season > 0 ? season : null,
    fixture_date: item.fixture?.date ?? null,
    fixture_timestamp: Number.isFinite(timestamp) ? timestamp : null,
    update_time: item.update ?? null,
    mapping_data: item,
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: MappingRow[]) {
  return [...new Map(rows.map((row) => [row.fixture_id, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: MappingRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("odds_mapping").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "fixture_id" },
    );
    if (error) throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
