import { createIngestClient } from "../src/utils/supabase/admin";

const SEASON = 2026;
const CHUNK = 500;

type ApiTopRedItem = {
  player?: {
    id?: number;
    name?: string | null;
    photo?: string | null;
  };
  statistics?: Array<{
    team?: { id?: number | null; name?: string | null } | null;
    league?: { id?: number | null; season?: number | null } | null;
    games?: {
      appearences?: number | null;
      minutes?: number | null;
    } | null;
    cards?: {
      yellow?: number | null;
      yellowred?: number | null;
      red?: number | null;
    } | null;
  }>;
};

type TopRedEnvelope = {
  response?: ApiTopRedItem[];
};

type TopRedRow = {
  league_id: number;
  season: number;
  rank: number;
  player_id: number;
  player_name: string | null;
  photo: string | null;
  team_id: number | null;
  team_name: string | null;
  appearences: number | null;
  yellow: number | null;
  yellowred: number | null;
  red: number | null;
  minutes: number | null;
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

  for (const leagueId of leagueIds) {
    try {
      const items = await fetchTopRed(apiKey, leagueId);
      const rows = uniqueByPlayer(
        items
          .map((item, rankIndex) => mapTopRed(item, leagueId, rankIndex + 1))
          .filter((row): row is TopRedRow => row != null),
      );
      await upsertRows(supabase, rows);
      totalCached += rows.length;
      console.log(`league ${leagueId}: ${rows.length} top red cards`);
    } catch (cause) {
      console.log(
        `league ${leagueId} failed ${cause instanceof Error ? cause.message : cause}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.log(`top red cards upserted ${totalCached}`);
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

async function fetchTopRed(apiKey: string, leagueId: number) {
  const url = new URL("https://v3.football.api-sports.io/players/topredcards");
  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", String(SEASON));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status} league=${leagueId}`);
  }

  const payload = (await response.json()) as TopRedEnvelope;
  return payload.response ?? [];
}

function mapTopRed(
  item: ApiTopRedItem,
  leagueId: number,
  rank: number,
): TopRedRow | null {
  const playerId = item.player?.id;
  const stats = item.statistics?.[0];
  if (!playerId || !stats) return null;

  return {
    league_id: stats.league?.id ?? leagueId,
    season: stats.league?.season ?? SEASON,
    rank,
    player_id: playerId,
    player_name: item.player?.name ?? null,
    photo: item.player?.photo ?? null,
    team_id: stats.team?.id ?? null,
    team_name: stats.team?.name ?? null,
    appearences: stats.games?.appearences ?? null,
    yellow: stats.cards?.yellow ?? null,
    yellowred: stats.cards?.yellowred ?? null,
    red: stats.cards?.red ?? null,
    minutes: stats.games?.minutes ?? null,
  };
}

function uniqueByPlayer(rows: TopRedRow[]) {
  return [...new Map(rows.map((row) => [row.player_id, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: TopRedRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("top_red_cards").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "league_id,season,player_id" },
    );
    if (error) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
