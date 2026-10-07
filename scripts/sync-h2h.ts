import { createIngestClient } from "../src/utils/supabase/admin";

const FROM_YEAR = 2021;
const TO_YEAR = 2026;
const CHUNK = 500;

type Pair = {
  home_team_id: number;
  away_team_id: number;
};

type ApiH2hMatch = {
  fixture?: {
    id?: number;
    date?: string | null;
  };
};

type H2hEnvelope = {
  response?: ApiH2hMatch[];
};

type H2hRow = {
  id: number;
  team1_id: number;
  team2_id: number;
  fixture_date: string | null;
  match_data: ApiH2hMatch;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const pairs = await upcomingPairs(supabase);
  console.log(
    `upcoming H2H pairs ${pairs.length} seasons ${FROM_YEAR}-${TO_YEAR}`,
  );

  let cached = 0;
  let skipped = 0;

  for (const [index, pair] of pairs.entries()) {
    for (let year = FROM_YEAR; year <= TO_YEAR; year += 1) {
      try {
        const payload = await fetchH2h(apiKey, pair, year);
        const matches = payload.response ?? [];

        if (matches.length > 0) {
          const rows = matches
            .map((match) => mapMatch(match, pair))
            .filter((row): row is H2hRow => row != null);
          await upsertRows(supabase, rows);
          cached += rows.length;
          console.log(
            `progress pair ${index + 1}/${pairs.length} ${pair.home_team_id}-${pair.away_team_id} ${year}: ${rows.length} meetings`,
          );
        } else {
          skipped += 1;
          console.log(
            `progress pair ${index + 1}/${pairs.length} ${pair.home_team_id}-${pair.away_team_id} ${year}: no h2h`,
          );
        }
      } catch (cause) {
        console.log(
          `progress pair ${index + 1}/${pairs.length} ${pair.home_team_id}-${pair.away_team_id} ${year}: failed ${
            cause instanceof Error ? cause.message : cause
          }`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log(`h2h sync done cached=${cached} skipped=${skipped}`);
}

async function upcomingPairs(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const seen = new Set<string>();
  const pairs: Pair[] = [];

  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("home_team_id, away_team_id")
      .gte("date", from)
      .lt("date", to)
      .not("home_team_id", "is", null)
      .not("away_team_id", "is", null)
      .order("date")
      .range(start, start + 999);
    if (error) throw error;

    for (const row of data ?? []) {
      const home_team_id = Number(row.home_team_id);
      const away_team_id = Number(row.away_team_id);
      if (!Number.isInteger(home_team_id) || home_team_id <= 0) continue;
      if (!Number.isInteger(away_team_id) || away_team_id <= 0) continue;
      const key = `${home_team_id}-${away_team_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ home_team_id, away_team_id });
    }

    if (!data || data.length < 1000) break;
  }

  return pairs;
}

async function fetchH2h(apiKey: string, pair: Pair, season: number) {
  const url = new URL("https://v3.football.api-sports.io/fixtures/headtohead");
  url.searchParams.set("h2h", `${pair.home_team_id}-${pair.away_team_id}`);
  url.searchParams.set("season", String(season));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as H2hEnvelope;
}

function mapMatch(match: ApiH2hMatch, pair: Pair): H2hRow | null {
  const id = match.fixture?.id;
  if (!id) return null;
  return {
    id,
    team1_id: pair.home_team_id,
    team2_id: pair.away_team_id,
    fixture_date: match.fixture?.date ?? null,
    match_data: match,
  };
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: H2hRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase
      .from("fixtures_h2h")
      .upsert(rows.slice(index, index + CHUNK), { onConflict: "id" });
    if (error) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
