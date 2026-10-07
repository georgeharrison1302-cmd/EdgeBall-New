import { createIngestClient } from "../src/utils/supabase/admin";

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
  errors?: unknown;
  results?: number;
  response?: Array<{
    team?: { id?: number };
    players?: ApiSquadPlayer[];
  }>;
};

type PlayerRow = {
  id: number;
  name: string | null;
  age: number | null;
  number: number | null;
  position: string | null;
  photo: string | null;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const teamIds = await cachedTeamIds(supabase);
  console.log(`cached teams ${teamIds.length}`);

  let totalCached = 0;

  for (const [index, teamId] of teamIds.entries()) {
    try {
      const players = await fetchSquad(apiKey, teamId);
      const rows = uniquePlayers(
        players.map(mapPlayer).filter((row): row is PlayerRow => row != null),
      );
      await upsertPlayers(supabase, rows);
      totalCached += rows.length;
      if ((index + 1) % 25 === 0 || index === 0) {
        console.log(`progress ${index + 1}/${teamIds.length} team ${teamId}: ${rows.length} players`);
      }
    } catch (cause) {
      console.log(
        `team ${teamId} failed ${cause instanceof Error ? cause.message : cause}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.log(`players upserted ${totalCached}`);
}

async function cachedTeamIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("teams")
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

async function fetchSquad(apiKey: string, teamId: number) {
  const url = new URL("https://v3.football.api-sports.io/players/squads");
  url.searchParams.set("team", String(teamId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status} team=${teamId}`);
  }

  const payload = (await response.json()) as SquadsEnvelope;
  return payload.response?.[0]?.players ?? [];
}

function uniquePlayers(rows: PlayerRow[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function mapPlayer(player: ApiSquadPlayer): PlayerRow | null {
  if (!player.id) return null;
  return {
    id: player.id,
    name: player.name ?? null,
    age: player.age ?? null,
    number: player.number ?? null,
    position: player.position ?? null,
    photo: player.photo ?? null,
  };
}

async function upsertPlayers(
  supabase: ReturnType<typeof createIngestClient>,
  rows: PlayerRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase
      .from("players")
      .upsert(rows.slice(index, index + CHUNK), { onConflict: "id" });
    if (error) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
