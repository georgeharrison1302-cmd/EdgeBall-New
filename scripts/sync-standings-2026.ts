import { createIngestClient } from "../src/utils/supabase/admin";

const SEASON = 2026;
const CHUNK = 500;
const REQUEST_GAP_MS = 250;

type StandingAll = {
  played?: number | null;
  win?: number | null;
  draw?: number | null;
  lose?: number | null;
  goals?: { for?: number | null; against?: number | null } | null;
};

type ApiStandingRow = {
  rank?: number | null;
  team?: { id?: number | null; name?: string | null; logo?: string | null } | null;
  points?: number | null;
  goalsDiff?: number | null;
  group?: string | null;
  form?: string | null;
  status?: string | null;
  description?: string | null;
  all?: StandingAll | null;
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
  errors?: unknown;
  results?: number;
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

  let totalCached = 0;

  for (const [index, leagueId] of leagueIds.entries()) {
    if (index > 0) {
      await sleep(REQUEST_GAP_MS);
    }

    const items = await fetchStandings(apiKey, leagueId);
    const rows = uniqueStandings(items.flatMap(mapStandings));
    await upsertChunks(supabase, rows);
    totalCached += rows.length;
    console.log(`league ${leagueId}: ${rows.length} standings`);
  }

  console.log(`standings upserted ${totalCached}`);
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
    throw new Error(`API-Football ${response.status} league=${leagueId} season=${SEASON}`);
  }

  const payload = (await response.json()) as StandingsEnvelope;
  return payload.response ?? [];
}

function mapStandings(item: ApiStandingsItem): StandingRow[] {
  const leagueId = item.league?.id;
  const season = item.league?.season ?? SEASON;
  const tables = item.league?.standings ?? [];
  if (!leagueId) return [];

  return tables.flatMap((table) =>
    table.flatMap((row) => {
      const teamId = row.team?.id;
      if (!teamId) return [];
      return [
        {
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
        },
      ];
    }),
  );
}

async function upsertChunks(
  supabase: ReturnType<typeof createIngestClient>,
  rows: StandingRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("standings").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "league_id,season,team_id" },
    );
    if (error) throw error;
  }
}

function uniqueStandings(rows: StandingRow[]) {
  const byKey = new Map<string, StandingRow>();
  for (const row of rows) {
    byKey.set(`${row.league_id}:${row.season}:${row.team_id}`, row);
  }
  return [...byKey.values()];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
