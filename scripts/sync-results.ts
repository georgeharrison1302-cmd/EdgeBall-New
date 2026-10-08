/**
 * Refresh status + final score for fixtures whose kickoff has passed but are
 * not stored as finished. The schedule sync only pulls upcoming fixtures, so
 * without this job results and grading would stall.
 *
 *   npm run sync:results
 */
import { createIngestClient } from "../src/utils/supabase/admin";

const TERMINAL = ["FT", "AET", "PEN", "AWD", "WO", "PST", "ABD", "CANC"];
const BATCH = 20;
const LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000;

type ApiFixture = {
  fixture?: { id?: number; status?: { short?: string | null } | null };
  goals?: { home?: number | null; away?: number | null } | null;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY");
  const supabase = createIngestClient();

  const now = new Date();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id")
    .lt("date", new Date(now.getTime() - 100 * 60 * 1000).toISOString())
    .gte("date", new Date(now.getTime() - LOOKBACK_MS).toISOString())
    .not("status_short", "in", `(${TERMINAL.join(",")})`)
    .limit(400);
  if (error) throw error;

  const ids = (data ?? []).map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
  if (ids.length === 0) {
    console.log("sync-results: nothing stale");
    return;
  }

  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?ids=${chunk.join("-")}`,
      { headers: { "x-apisports-key": apiKey } },
    );
    if (!response.ok) throw new Error(`API-Football ${response.status}`);
    const body = (await response.json()) as { response?: ApiFixture[] };
    for (const item of body.response ?? []) {
      const id = item.fixture?.id;
      const status = item.fixture?.status?.short;
      if (id == null || !status) continue;
      const { error: updateError } = await supabase
        .from("fixtures")
        .update({
          status_short: status,
          home_goals: item.goals?.home ?? null,
          away_goals: item.goals?.away ?? null,
        })
        .eq("id", id);
      if (updateError) throw updateError;
      updated += 1;
    }
  }
  console.log(`sync-results: refreshed ${updated} / ${ids.length} stale fixtures`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
