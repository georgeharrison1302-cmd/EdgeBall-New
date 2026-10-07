import { createIngestClient } from "../src/utils/supabase/admin";

const SEASON = 2026;

type Combo = {
  team_id: number;
  league_id: number;
};

type StatisticsEnvelope = {
  results?: number;
  response?: Record<string, unknown> | null;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const combos = await uniqueCombos(supabase);
  console.log(`unique team/league combos ${combos.length} season ${SEASON}`);

  let cached = 0;
  let skipped = 0;

  for (const [index, combo] of combos.entries()) {
    try {
      const payload = await fetchStatistics(apiKey, combo);
      const stats = payload.response;
      const hasData =
        stats != null &&
        typeof stats === "object" &&
        !Array.isArray(stats) &&
        Object.keys(stats).length > 0;

      if (hasData) {
        const { error } = await supabase.from("team_statistics").upsert(
          {
            team_id: combo.team_id,
            league_id: combo.league_id,
            season: SEASON,
            update_time: new Date().toISOString(),
            stats,
          },
          { onConflict: "team_id,league_id,season" },
        );
        if (error) throw error;
        cached += 1;
        console.log(
          `progress ${index + 1}/${combos.length} team ${combo.team_id} league ${combo.league_id}: cached`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${combos.length} team ${combo.team_id} league ${combo.league_id}: no stats`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${combos.length} team ${combo.team_id} league ${combo.league_id}: failed ${
          cause instanceof Error ? cause.message : cause
        }`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`team statistics done cached=${cached} skipped=${skipped}`);
}

async function uniqueCombos(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const seen = new Set<string>();
  const combos: Combo[] = [];

  const add = (teamId: unknown, leagueId: unknown) => {
    const team_id = Number(teamId);
    const league_id = Number(leagueId);
    if (!Number.isInteger(team_id) || team_id <= 0) return;
    if (!Number.isInteger(league_id) || league_id <= 0) return;
    const key = `${team_id}:${league_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    combos.push({ team_id, league_id });
  };

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("standings")
      .select("team_id, league_id")
      .eq("season", SEASON)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) add(row.team_id, row.league_id);
    if (!data || data.length < 1000) break;
  }

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("league_id, home_team_id, away_team_id")
      .eq("season", SEASON)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      add(row.home_team_id, row.league_id);
      add(row.away_team_id, row.league_id);
    }
    if (!data || data.length < 1000) break;
  }

  return combos;
}

async function fetchStatistics(apiKey: string, combo: Combo) {
  const url = new URL("https://v3.football.api-sports.io/teams/statistics");
  url.searchParams.set("league", String(combo.league_id));
  url.searchParams.set("season", String(SEASON));
  url.searchParams.set("team", String(combo.team_id));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as StatisticsEnvelope;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
