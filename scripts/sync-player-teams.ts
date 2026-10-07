import { createIngestClient } from "../src/utils/supabase/admin";

const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type ApiTeamEntry = {
  team?: {
    id?: number | null;
    name?: string | null;
    logo?: string | null;
  } | null;
  seasons?: number[] | null;
};

type TeamsEnvelope = {
  response?: ApiTeamEntry[];
};

type HistoryRow = {
  player_id: number;
  team_id: number;
  team_name: string | null;
  team_logo: string | null;
  seasons: number[];
  teams_data: ApiTeamEntry;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const playerIds = await collectPlayerIds(supabase);
  const pending = await missingHistoryIds(supabase, playerIds);
  console.log(
    `player teams history unique=${playerIds.length} pending=${pending.length} (skip existing)`,
  );

  if (pending.length === 0) {
    console.log("player teams history sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, playerId] of pending.entries()) {
    try {
      const payload = await fetchPlayerTeams(apiKey, playerId);
      const rows = uniqueRows(
        (payload.response ?? [])
          .map((item) => mapTeam(playerId, item))
          .filter((row): row is HistoryRow => row != null),
      );

      if (rows.length > 0) {
        await upsertRows(supabase, rows);
        cached += rows.length;
        if ((index + 1) % 25 === 0 || index === 0) {
          console.log(
            `progress ${index + 1}/${pending.length} player ${playerId}: cached ${rows.length} teams`,
          );
        }
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${pending.length} player ${playerId}: no teams`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${pending.length} player ${playerId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`player teams history sync done cached=${cached} skipped=${skipped}`);
}

async function collectPlayerIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();
  await addColumnIds(supabase, "player_profiles", "player_id", ids);
  await addColumnIds(supabase, "team_squads", "player_id", ids);
  return [...ids].sort((left, right) => left - right);
}

async function missingHistoryIds(
  supabase: ReturnType<typeof createIngestClient>,
  playerIds: number[],
) {
  const have = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_teams_history")
      .select("player_id")
      .order("player_id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) addId(have, row.player_id);
    if (!data || data.length < 1000) break;
  }
  return playerIds.filter((id) => !have.has(id));
}

async function addColumnIds(
  supabase: ReturnType<typeof createIngestClient>,
  table: string,
  column: string,
  ids: Set<number>,
) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .not(column, "is", null)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) addId(ids, (row as Record<string, unknown>)[column]);
    if (!data || data.length < 1000) break;
  }
}

async function fetchPlayerTeams(apiKey: string, playerId: number) {
  const url = new URL("https://v3.football.api-sports.io/players/teams");
  url.searchParams.set("player", String(playerId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as TeamsEnvelope;
}

function mapTeam(playerId: number, item: ApiTeamEntry): HistoryRow | null {
  const teamId = item.team?.id;
  if (!teamId) return null;
  const seasons = Array.isArray(item.seasons)
    ? item.seasons.filter((year) => Number.isInteger(year))
    : [];

  return {
    player_id: playerId,
    team_id: teamId,
    team_name: item.team?.name ?? null,
    team_logo: item.team?.logo ?? null,
    seasons,
    teams_data: item,
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: HistoryRow[]) {
  return [...new Map(rows.map((row) => [`${row.player_id}:${row.team_id}`, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: HistoryRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("player_teams_history").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "player_id,team_id" },
    );
    if (error) throw error;
  }
}

function addId(ids: Set<number>, value: unknown) {
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) ids.add(id);
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
