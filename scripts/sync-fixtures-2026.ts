import { createIngestClient } from "../src/utils/supabase/admin";

const SEASON = 2026;
const CHUNK = 500;
const REQUEST_GAP_MS = 250;

type ApiFixtureItem = {
  fixture?: {
    id?: number;
    date?: string | null;
    timestamp?: number | null;
    referee?: string | null;
    venue?: { id?: number | null } | null;
    status?: { short?: string | null; long?: string | null; elapsed?: number | null } | null;
    timezone?: string | null;
  };
  league?: {
    id?: number;
    season?: number;
  };
  teams?: {
    home?: { id?: number | null } | null;
    away?: { id?: number | null } | null;
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  } | null;
  score?: unknown;
};

type FixturesEnvelope = {
  errors?: unknown;
  results?: number;
  paging?: { current?: number; total?: number };
  response?: ApiFixtureItem[];
};

type FixtureRow = {
  id: number;
  date: string | null;
  timestamp: number | null;
  referee: string | null;
  status_short: string | null;
  status_long: string | null;
  elapsed: number | null;
  timezone: string | null;
  league_id: number;
  season: number;
  venue_id: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
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

    const items = await fetchFixtures(apiKey, leagueId);
    const rows = items.map(mapFixture).filter((row): row is FixtureRow => row != null);
    await upsertChunks(supabase, rows);
    totalCached += rows.length;
    console.log(`league ${leagueId}: ${rows.length} fixtures`);
  }

  console.log(`fixtures upserted ${totalCached}`);
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

async function fetchFixtures(apiKey: string, leagueId: number) {
  const items: ApiFixtureItem[] = [];

  for (let page = 1; ; page += 1) {
    const url = new URL("https://v3.football.api-sports.io/fixtures");
    url.searchParams.set("league", String(leagueId));
    url.searchParams.set("season", String(SEASON));
    url.searchParams.set("timezone", "Europe/London");
    if (page > 1) url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API-Football ${response.status} league=${leagueId} season=${SEASON}`);
    }

    const payload = (await response.json()) as FixturesEnvelope;
    const errors = payload.errors;
    if (errors && typeof errors === "object" && "page" in errors && page > 1) {
      break;
    }

    items.push(...(payload.response ?? []));

    const current = payload.paging?.current ?? page;
    const total = payload.paging?.total ?? 1;
    if (current >= total) break;
  }

  return items;
}

function mapFixture(item: ApiFixtureItem): FixtureRow | null {
  const id = item.fixture?.id;
  const leagueId = item.league?.id;
  const season = item.league?.season ?? SEASON;
  if (!id || !leagueId) return null;

  return {
    id,
    date: item.fixture?.date ?? null,
    timestamp: item.fixture?.timestamp ?? null,
    referee: item.fixture?.referee ?? null,
    status_short: item.fixture?.status?.short ?? null,
    status_long: item.fixture?.status?.long ?? null,
    elapsed: item.fixture?.status?.elapsed ?? null,
    timezone: item.fixture?.timezone ?? "Europe/London",
    league_id: leagueId,
    season,
    venue_id: item.fixture?.venue?.id || null,
    home_team_id: item.teams?.home?.id ?? null,
    away_team_id: item.teams?.away?.id ?? null,
    home_goals: item.goals?.home ?? null,
    away_goals: item.goals?.away ?? null,
    score: item.score ?? {},
  };
}

async function upsertChunks(
  supabase: ReturnType<typeof createIngestClient>,
  rows: FixtureRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase
      .from("fixtures")
      .upsert(rows.slice(index, index + CHUNK), { onConflict: "id" });
    if (error) throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
