import { createIngestClient } from "../src/utils/supabase/admin";

const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type ApiSquadPlayer = {
  id?: number;
  name?: string | null;
  age?: number | null;
  number?: number | null;
  position?: string | null;
  photo?: string | null;
};

type SquadsEnvelope = {
  response?: Array<{
    team?: { id?: number };
    players?: ApiSquadPlayer[];
  }>;
};

type SquadRow = {
  team_id: number;
  player_id: number;
  player_name: string | null;
  age: number | null;
  number: number | null;
  position: string | null;
  photo: string | null;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const teamIds = await trackedTeamIds(supabase);
  console.log(`tracked league teams ${teamIds.length}`);

  let cached = 0;
  let skipped = 0;

  for (const [index, teamId] of teamIds.entries()) {
    try {
      const payload = await fetchSquad(apiKey, teamId);
      const teamFromApi = payload.response?.[0]?.team?.id ?? teamId;
      const players = payload.response?.[0]?.players ?? [];
      const rows = uniqueRows(
        players
          .map((player) => mapPlayer(teamFromApi, player))
          .filter((row): row is SquadRow => row != null),
      );

      if (rows.length > 0) {
        await upsertRows(supabase, rows);
        cached += rows.length;
        console.log(
          `progress ${index + 1}/${teamIds.length} team ${teamId}: cached ${rows.length} players`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${teamIds.length} team ${teamId}: no squad`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${teamIds.length} team ${teamId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`squads sync done cached=${cached} skipped=${skipped}`);
}

async function trackedTeamIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("standings")
      .select("team_id")
      .not("team_id", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) addId(ids, row.team_id);
    if (!data || data.length < 1000) break;
  }

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("home_team_id, away_team_id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      addId(ids, row.home_team_id);
      addId(ids, row.away_team_id);
    }
    if (!data || data.length < 1000) break;
  }

  return [...ids].sort((left, right) => left - right);
}

async function fetchSquad(apiKey: string, teamId: number) {
  const url = new URL("https://v3.football.api-sports.io/players/squads");
  url.searchParams.set("team", String(teamId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as SquadsEnvelope;
}

function mapPlayer(teamId: number, player: ApiSquadPlayer): SquadRow | null {
  const playerId = player.id;
  if (!playerId) return null;

  return {
    team_id: teamId,
    player_id: playerId,
    player_name: player.name ?? null,
    age: player.age ?? null,
    number: player.number ?? null,
    position: player.position ?? null,
    photo: player.photo ?? null,
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: SquadRow[]) {
  return [...new Map(rows.map((row) => [`${row.team_id}:${row.player_id}`, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: SquadRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("team_squads").upsert(rows.slice(index, index + CHUNK), {
      onConflict: "team_id,player_id",
    });
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
