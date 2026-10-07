import { createIngestClient } from "../src/utils/supabase/admin";

const REQUEST_GAP_MS = 200;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ApiPlayer = {
  id?: number;
  name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  age?: number | null;
  birth?: { date?: string | null } | null;
  nationality?: string | null;
  height?: string | null;
  weight?: string | null;
  photo?: string | null;
};

type ProfilesEnvelope = {
  response?: Array<{ player?: ApiPlayer | null }>;
};

type ProfileRow = {
  player_id: number;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  birth_date: string | null;
  nationality: string | null;
  height: string | null;
  weight: string | null;
  photo: string | null;
  player_data: ApiPlayer;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const playerIds = await collectPlayerIds(supabase);
  const pending = await missingProfileIds(supabase, playerIds);
  console.log(`player profiles unique=${playerIds.length} pending=${pending.length}`);

  if (pending.length === 0) {
    console.log("player profiles sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, playerId] of pending.entries()) {
    try {
      const payload = await fetchProfile(apiKey, playerId);
      const player = payload.response?.[0]?.player;
      const row = player ? mapProfile(player) : null;

      if (row) {
        const { error } = await supabase.from("player_profiles").upsert(row, {
          onConflict: "player_id",
        });
        if (error) throw error;
        cached += 1;
        if ((index + 1) % 25 === 0 || index === 0) {
          console.log(
            `progress ${index + 1}/${pending.length} player ${playerId}: cached ${row.name ?? playerId}`,
          );
        }
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${pending.length} player ${playerId}: no profile`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${pending.length} player ${playerId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`player profiles sync done cached=${cached} skipped=${skipped}`);
}

async function collectPlayerIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();
  const priority = new Set<number>();

  await addColumnIds(supabase, "players", "id", ids);
  await addColumnIds(supabase, "fixture_injuries", "player_id", priority);
  await addColumnIds(supabase, "top_scorers", "player_id", priority);
  await addColumnIds(supabase, "top_assists", "player_id", priority);
  await addColumnIds(supabase, "top_yellow_cards", "player_id", priority);
  await addColumnIds(supabase, "top_red_cards", "player_id", priority);
  await addLineupPlayerIds(supabase, priority);

  const upcomingTeams = await upcomingTeamIds(supabase);
  if (upcomingTeams.size > 0) {
    console.log(`upcoming fixture teams ${upcomingTeams.size}`);
  }

  for (const id of priority) ids.add(id);
  const rest = [...ids].filter((id) => !priority.has(id)).sort((a, b) => a - b);
  return [...priority].sort((a, b) => a - b).concat(rest);
}

async function missingProfileIds(
  supabase: ReturnType<typeof createIngestClient>,
  playerIds: number[],
) {
  const have = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_profiles")
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

async function addLineupPlayerIds(
  supabase: ReturnType<typeof createIngestClient>,
  ids: Set<number>,
) {
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("fixture_lineups")
      .select("start_xi, substitutes")
      .range(from, from + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      extractPlayerIds(row.start_xi, ids);
      extractPlayerIds(row.substitutes, ids);
    }
    if (!data || data.length < 500) break;
  }
}

async function upcomingTeamIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + WINDOW_MS).toISOString();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("home_team_id, away_team_id")
      .gte("date", from)
      .lt("date", to)
      .range(start, start + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      addId(ids, row.home_team_id);
      addId(ids, row.away_team_id);
    }
    if (!data || data.length < 1000) break;
  }
  return ids;
}

function extractPlayerIds(value: unknown, ids: Set<number>) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const player = record.player;
    if (player && typeof player === "object") {
      addId(ids, (player as Record<string, unknown>).id);
    }
    addId(ids, record.id);
  }
}

async function fetchProfile(apiKey: string, playerId: number) {
  const url = new URL("https://v3.football.api-sports.io/players/profiles");
  url.searchParams.set("player", String(playerId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as ProfilesEnvelope;
}

function mapProfile(player: ApiPlayer): ProfileRow | null {
  const playerId = player.id;
  if (!playerId) return null;
  const birth = player.birth?.date?.trim() || null;

  return {
    player_id: playerId,
    name: player.name ?? null,
    firstname: player.firstname ?? null,
    lastname: player.lastname ?? null,
    age: player.age ?? null,
    birth_date: birth,
    nationality: player.nationality ?? null,
    height: player.height ?? null,
    weight: player.weight ?? null,
    photo: player.photo ?? null,
    player_data: player,
    updated_at: new Date().toISOString(),
  };
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
