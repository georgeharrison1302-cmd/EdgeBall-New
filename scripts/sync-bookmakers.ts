import { createIngestClient } from "../src/utils/supabase/admin";

const CHUNK = 500;

type ApiBookmaker = {
  id?: number | null;
  name?: string | null;
};

type BookmakersEnvelope = {
  paging?: { current?: number; total?: number };
  response?: ApiBookmaker[];
};

type BookmakerRow = {
  bookmaker_id: number;
  name: string | null;
  bookmaker_data: ApiBookmaker;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  console.log("bookmakers sync starting GET /odds/bookmakers");

  const payload = await fetchBookmakers(apiKey);
  const rows = uniqueRows(
    (payload.response ?? [])
      .map(mapBookmaker)
      .filter((row): row is BookmakerRow => row != null),
  );

  if (rows.length === 0) {
    console.log("bookmakers sync done cached=0 skipped=0 (empty response)");
    return;
  }

  await upsertRows(supabase, rows);
  console.log(
    `bookmakers sync done cached=${rows.length} paging=${payload.paging?.current ?? 1}/${payload.paging?.total ?? 1}`,
  );
}

async function fetchBookmakers(apiKey: string) {
  const response = await fetch("https://v3.football.api-sports.io/odds/bookmakers", {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as BookmakersEnvelope;
}

function mapBookmaker(item: ApiBookmaker): BookmakerRow | null {
  const bookmakerId = Number(item.id);
  if (!Number.isInteger(bookmakerId) || bookmakerId <= 0) return null;

  return {
    bookmaker_id: bookmakerId,
    name: item.name ?? null,
    bookmaker_data: item,
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: BookmakerRow[]) {
  return [...new Map(rows.map((row) => [row.bookmaker_id, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: BookmakerRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("bookmakers").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "bookmaker_id" },
    );
    if (error) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
