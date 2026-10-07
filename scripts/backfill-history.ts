import { createIngestClient } from "../src/utils/supabase/admin";

const FROM_YEAR = 2008;
const TO_YEAR = 2025;
const STANDINGS_FROM_YEAR = 2021;
const CHUNK = 500;

type ApiFixtureItem = {
  fixture?: {
    id?: number;
    date?: string | null;
    timestamp?: number | null;
    referee?: string | null;
    venue?: { id?: number | null } | null;
    status?: { short?: string | null; elapsed?: number | null } | null;
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
  paging?: { current?: number; total?: number };
  response?: ApiFixtureItem[];
};

type FixtureRow = {
  id: number;
  date: string | null;
  timestamp: number | null;
  referee: string | null;
  status_short: string | null;
  elapsed: number | null;
  league_id: number;
  season: number;
  venue_id: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
};

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
  console.log(
    `backfill leagues ${leagueIds.length} fixtures ${FROM_YEAR}-${TO_YEAR} standings ${STANDINGS_FROM_YEAR}-${TO_YEAR}`,
  );

  let fixturesCached = 0;
  let standingsCached = 0;

  for (const leagueId of leagueIds) {
    for (let year = FROM_YEAR; year <= TO_YEAR; year += 1) {
      const fixtureItems = await fetchFixtures(apiKey, leagueId, year);
      const fixtureRows = fixtureItems
        .map((item) => mapFixture(item, year))
        .filter((row): row is FixtureRow => row != null);
      await upsertFixtures(supabase, fixtureRows);
      fixturesCached += fixtureRows.length;

      let standingRows: StandingRow[] = [];
      if (year >= STANDINGS_FROM_YEAR) {
        const standingItems = await fetchStandings(apiKey, leagueId, year);
        standingRows = standingItems.flatMap((item) => mapStandings(item, year));
        await upsertStandings(supabase, standingRows);
        standingsCached += standingRows.length;
      }

      console.log(
        `league ${leagueId} ${year}: fixtures ${fixtureRows.length}` +
          (year >= STANDINGS_FROM_YEAR
            ? ` standings ${standingRows.length}`
            : ""),
      );

      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  console.log(
    `backfill done fixtures=${fixturesCached} standings=${standingsCached}`,
  );
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

async function fetchFixtures(apiKey: string, leagueId: number, season: number) {
  const items: ApiFixtureItem[] = [];

  for (let page = 1; ; page += 1) {
    const url = new URL("https://v3.football.api-sports.io/fixtures");
    url.searchParams.set("league", String(leagueId));
    url.searchParams.set("season", String(season));
    if (page > 1) url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(
        `API-Football ${response.status} fixtures league=${leagueId} season=${season}`,
      );
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

function mapFixture(item: ApiFixtureItem, seasonFallback: number): FixtureRow | null {
  const id = item.fixture?.id;
  const leagueId = item.league?.id;
  const season = item.league?.season ?? seasonFallback;
  if (!id || !leagueId) return null;

  return {
    id,
    date: item.fixture?.date ?? null,
    timestamp: item.fixture?.timestamp ?? null,
    referee: item.fixture?.referee ?? null,
    status_short: item.fixture?.status?.short ?? null,
    elapsed: item.fixture?.status?.elapsed ?? null,
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

async function upsertFixtures(
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

async function fetchStandings(apiKey: string, leagueId: number, season: number) {
  const url = new URL("https://v3.football.api-sports.io/standings");
  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", String(season));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `API-Football ${response.status} standings league=${leagueId} season=${season}`,
    );
  }

  const payload = (await response.json()) as StandingsEnvelope;
  return payload.response ?? [];
}

function mapStandings(item: ApiStandingsItem, seasonFallback: number): StandingRow[] {
  const leagueId = item.league?.id;
  const season = item.league?.season ?? seasonFallback;
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

async function upsertStandings(
  supabase: ReturnType<typeof createIngestClient>,
  rows: StandingRow[],
) {
  const unique = uniqueStandings(rows);
  for (let index = 0; index < unique.length; index += CHUNK) {
    const { error } = await supabase.from("standings").upsert(
      unique.slice(index, index + CHUNK),
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
