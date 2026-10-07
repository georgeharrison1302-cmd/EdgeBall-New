import { createIngestClient } from "../src/utils/supabase/admin";

const REQUEST_GAP_MS = 200;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ApiPredictionItem = {
  predictions?: {
    winner?: unknown;
    win_or_draw?: boolean | null;
    under_over?: string | null;
    goals?: unknown;
    advice?: string | null;
    percent?: unknown;
  } | null;
  league?: unknown;
  teams?: unknown;
  comparison?: unknown;
  h2h?: unknown;
};

type PredictionsEnvelope = {
  response?: ApiPredictionItem[];
};

type PredictionRow = {
  fixture_id: number;
  winner: unknown;
  win_or_draw: boolean | null;
  under_over: string | null;
  goals: unknown;
  advice: string | null;
  percent: unknown;
  comparison: unknown;
  teams: unknown;
  h2h: unknown;
  prediction_data: ApiPredictionItem;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const fixtureIds = await upcomingFixtureIds(supabase);
  console.log(`upcoming predictions ${fixtureIds.length} (next 7 days)`);

  if (fixtureIds.length === 0) {
    console.log("predictions sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, fixtureId] of fixtureIds.entries()) {
    try {
      const payload = await fetchPredictions(apiKey, fixtureId);
      const item = payload.response?.[0];
      const row = item ? mapPrediction(fixtureId, item) : null;

      if (row) {
        const { error } = await supabase.from("predictions").upsert(row, {
          onConflict: "fixture_id",
        });
        if (error) throw error;
        cached += 1;
        const home = percentLabel(item.predictions?.percent, "home");
        const draw = percentLabel(item.predictions?.percent, "draw");
        const away = percentLabel(item.predictions?.percent, "away");
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: cached ${home}/${draw}/${away}`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: no prediction`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`predictions sync done cached=${cached} skipped=${skipped}`);
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

async function fetchPredictions(apiKey: string, fixtureId: number) {
  const url = new URL("https://v3.football.api-sports.io/predictions");
  url.searchParams.set("fixture", String(fixtureId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as PredictionsEnvelope;
}

function mapPrediction(fixtureId: number, item: ApiPredictionItem): PredictionRow {
  const pred = item.predictions ?? {};
  return {
    fixture_id: fixtureId,
    winner: pred.winner ?? null,
    win_or_draw: pred.win_or_draw ?? null,
    under_over: pred.under_over ?? null,
    goals: pred.goals ?? null,
    advice: pred.advice ?? null,
    percent: pred.percent ?? null,
    comparison: item.comparison ?? {},
    teams: item.teams ?? {},
    h2h: item.h2h ?? [],
    prediction_data: item,
    updated_at: new Date().toISOString(),
  };
}

function percentLabel(percent: unknown, key: "home" | "draw" | "away") {
  if (!percent || typeof percent !== "object") return "?";
  const value = (percent as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "?";
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
