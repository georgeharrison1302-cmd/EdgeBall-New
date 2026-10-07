import { createIngestClient } from "../src/utils/supabase/admin";

const SEASON = 2026;
const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type Combo = {
  league_id: number;
  team_id: number;
};

type ApiGames = {
  appearences?: number | null;
  minutes?: number | null;
  rating?: string | number | null;
};

type ApiStatistic = {
  team?: { id?: number | null } | null;
  league?: { id?: number | null; season?: number | null } | null;
  games?: ApiGames | null;
  goals?: { total?: number | null; assists?: number | null } | null;
  cards?: { yellow?: number | null; red?: number | null } | null;
};

type ApiPlayerItem = {
  player?: { id?: number | null } | null;
  statistics?: ApiStatistic[] | null;
};

type PlayersEnvelope = {
  errors?: unknown;
  paging?: { current?: number; total?: number };
  response?: ApiPlayerItem[];
};

type StatRow = {
  player_id: number;
  league_id: number;
  season: number;
  team_id: number;
  appearances: number | null;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  stats_data: ApiStatistic;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const combos = await leagueTeamCombos(supabase);
  console.log(`league/team combos ${combos.length} season ${SEASON}`);

  let cached = 0;
  let skipped = 0;
  let firstRequest = true;

  for (const [index, combo] of combos.entries()) {
    try {
      const rows: StatRow[] = [];
      for (let page = 1; ; page += 1) {
        if (!firstRequest) {
          await sleep(REQUEST_GAP_MS);
        }
        firstRequest = false;

        const payload = await fetchPlayers(apiKey, combo, page);
        const items = payload.response ?? [];
        rows.push(
          ...items
            .map((item) => mapPlayer(item, combo))
            .filter((row): row is StatRow => row != null),
        );

        const current = payload.paging?.current ?? page;
        const total = payload.paging?.total ?? 1;
        if (current >= total || items.length === 0) break;
      }

      const unique = uniqueRows(rows);
      if (unique.length > 0) {
        await upsertRows(supabase, unique);
        cached += unique.length;
        console.log(
          `progress ${index + 1}/${combos.length} league ${combo.league_id} team ${combo.team_id}: cached ${unique.length} players`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${combos.length} league ${combo.league_id} team ${combo.team_id}: no players`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${combos.length} league ${combo.league_id} team ${combo.team_id}: failed ${errorMessage(cause)}`,
      );
    }
  }

  console.log(`player stats sync done cached=${cached} skipped=${skipped}`);
}

async function leagueTeamCombos(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const leagueIds = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("leagues").select("id").range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) addId(leagueIds, row.id);
    if (!data || data.length < 1000) break;
  }

  const seen = new Set<string>();
  const combos: Combo[] = [];
  const add = (leagueId: unknown, teamId: unknown) => {
    const league_id = Number(leagueId);
    const team_id = Number(teamId);
    if (!Number.isInteger(league_id) || league_id <= 0 || !leagueIds.has(league_id)) return;
    if (!Number.isInteger(team_id) || team_id <= 0) return;
    const key = `${league_id}:${team_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    combos.push({ league_id, team_id });
  };

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, team_id")
      .eq("season", SEASON)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) add(row.league_id, row.team_id);
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
      add(row.league_id, row.home_team_id);
      add(row.league_id, row.away_team_id);
    }
    if (!data || data.length < 1000) break;
  }

  return combos;
}

async function fetchPlayers(apiKey: string, combo: Combo, page: number) {
  const url = new URL("https://v3.football.api-sports.io/players");
  url.searchParams.set("league", String(combo.league_id));
  url.searchParams.set("season", String(SEASON));
  url.searchParams.set("team", String(combo.team_id));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as PlayersEnvelope;
}

function mapPlayer(item: ApiPlayerItem, combo: Combo): StatRow | null {
  const playerId = item.player?.id;
  const stats = item.statistics?.[0];
  if (!playerId || !stats) return null;

  const leagueId = stats.league?.id ?? combo.league_id;
  const teamId = stats.team?.id ?? combo.team_id;
  const season = stats.league?.season ?? SEASON;
  if (!leagueId || !teamId) return null;

  return {
    player_id: playerId,
    league_id: leagueId,
    season,
    team_id: teamId,
    appearances: stats.games?.appearences ?? null,
    minutes: stats.games?.minutes ?? null,
    rating: parseRating(stats.games?.rating),
    goals: stats.goals?.total ?? null,
    assists: stats.goals?.assists ?? null,
    yellow_cards: stats.cards?.yellow ?? null,
    red_cards: stats.cards?.red ?? null,
    stats_data: stats,
    updated_at: new Date().toISOString(),
  };
}

function parseRating(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueRows(rows: StatRow[]) {
  return [
    ...new Map(
      rows.map((row) => [`${row.player_id}:${row.league_id}:${row.season}:${row.team_id}`, row]),
    ).values(),
  ];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: StatRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("player_season_stats").upsert(rows.slice(index, index + CHUNK), {
      onConflict: "player_id,league_id,season,team_id",
    });
    if (error) throw error;
  }
}

function addId(ids: Set<number>, value: unknown) {
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) ids.add(id);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
