import { createIngestClient } from "../src/utils/supabase/admin";

const SEASON = 2026;
const REQUEST_GAP_MS = 200;

type ApiStandingRow = {
  rank?: number | null;
  team?: { id?: number | null } | null;
  points?: number | null;
  goalsDiff?: number | null;
  group?: string | null;
  form?: string | null;
  status?: string | null;
  description?: string | null;
  all?: unknown;
  home?: unknown;
  away?: unknown;
  update?: string | null;
};

type ApiStandingsItem = {
  league?: {
    id?: number;
    season?: number;
    standings?: ApiStandingRow[][];
  };
};

type StandingsEnvelope = {
  response?: ApiStandingsItem[];
};

type StandingRow = {
  league_id: number;
  season: number;
  team_id: number;
  rank: number | null;
  points: number | null;
  goals_diff: number | null;
  form: string | null;
  group_name: string | null;
  status: string | null;
  description: string | null;
  all_stats: unknown;
  home_stats: unknown;
  away_stats: unknown;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const leagueIds = await cachedLeagueIds(supabase);
  console.log(`cached leagues ${leagueIds.length} season ${SEASON}`);

  let cached = 0;
  let skipped = 0;

  for (const [index, leagueId] of leagueIds.entries()) {
    try {
      const payload = await fetchStandings(apiKey, leagueId);
      const tables = payload.response?.[0]?.league?.standings ?? [];
      const rows = uniqueStandings(
        tables.flatMap((table) =>
          table
            .map((row) => mapStanding(payload.response?.[0], row))
            .filter((row): row is StandingRow => row != null),
        ),
      );

      if (rows.length > 0) {
        const { error } = await supabase.from("standings").upsert(rows, {
          onConflict: "league_id,season,team_id",
        });
        if (error) throw error;
        cached += rows.length;
        console.log(
          `progress ${index + 1}/${leagueIds.length} league ${leagueId}: cached ${rows.length} teams`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${leagueIds.length} league ${leagueId}: no standings`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${leagueIds.length} league ${leagueId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`standings sync done cached=${cached} skipped=${skipped}`);
}

async function cachedLeagueIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("leagues")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function fetchStandings(apiKey: string, leagueId: number) {
  const url = new URL("https://v3.football.api-sports.io/standings");
  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", String(SEASON));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as StandingsEnvelope;
}

function mapStanding(
  item: ApiStandingsItem | undefined,
  row: ApiStandingRow,
): StandingRow | null {
  const leagueId = item?.league?.id;
  const season = item?.league?.season ?? SEASON;
  const teamId = row.team?.id;
  if (!leagueId || !teamId) return null;

  return {
    league_id: leagueId,
    season,
    team_id: teamId,
    rank: row.rank ?? null,
    points: row.points ?? null,
    goals_diff: row.goalsDiff ?? null,
    form: row.form ?? null,
    group_name: row.group ?? null,
    status: row.status ?? null,
    description: row.description ?? null,
    all_stats: row.all ?? {},
    home_stats: row.home ?? {},
    away_stats: row.away ?? {},
    updated_at: row.update ?? new Date().toISOString(),
  };
}

function uniqueStandings(rows: StandingRow[]) {
  const byKey = new Map<string, StandingRow>();
  for (const row of rows) {
    byKey.set(`${row.league_id}:${row.season}:${row.team_id}`, row);
  }
  return [...byKey.values()];
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
