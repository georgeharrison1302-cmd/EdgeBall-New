import { createIngestClient } from "../src/utils/supabase/admin";

type SeasonsEnvelope = {
  errors?: unknown;
  results?: number;
  response?: number[];
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const response = await fetch("https://v3.football.api-sports.io/players/seasons?", {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  const payload = (await response.json()) as SeasonsEnvelope;
  const rows = (payload.response ?? [])
    .filter((year) => Number.isInteger(year))
    .map((year) => ({ year }));

  const supabase = createIngestClient();
  const { error } = await supabase.from("player_season_years").upsert(rows, {
    onConflict: "year",
  });
  if (error) throw error;

  console.log(`player seasons cached ${rows.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
