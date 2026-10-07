import { createIngestClient } from "../src/utils/supabase/admin";
import type { SidelinedPeriod } from "../src/utils/api-football/endpoints";

const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type SidelinedEnvelope = {
  response?: SidelinedPeriod[];
};

type SidelinedRow = {
  player_id: number;
  type: string;
  start_date: string | null;
  end_date: string | null;
  sidelined_data: SidelinedPeriod;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const playerIds = await collectPlayerIds(supabase);
  const pending = await missingSidelinedIds(supabase, playerIds);
  console.log(
    `player sidelined unique=${playerIds.length} pending=${pending.length} (skip existing)`,
  );

  if (pending.length === 0) {
    console.log("player sidelined sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, playerId] of pending.entries()) {
    try {
      const payload = await fetchSidelined(apiKey, playerId);
      const rows = uniqueRows(
        (payload.response ?? [])
          .map((item) => mapSidelined(playerId, item))
          .filter((row): row is SidelinedRow => row != null),
      );

      if (rows.length > 0) {
        await upsertRows(supabase, rows);
        cached += rows.length;
        if ((index + 1) % 25 === 0 || index === 0) {
          console.log(
            `progress ${index + 1}/${pending.length} player ${playerId}: cached ${rows.length} spells`,
          );
        }
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${pending.length} player ${playerId}: no sidelined`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${pending.length} player ${playerId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`player sidelined sync done cached=${cached} skipped=${skipped}`);
}

async function collectPlayerIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();
  await addColumnIds(supabase, "player_profiles", "player_id", ids);
  await addColumnIds(supabase, "team_squads", "player_id", ids);
  return [...ids].sort((left, right) => left - right);
}

async function missingSidelinedIds(
  supabase: ReturnType<typeof createIngestClient>,
  playerIds: number[],
) {
  const have = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_sidelined")
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

async function fetchSidelined(apiKey: string, playerId: number) {
  const url = new URL("https://v3.football.api-sports.io/sidelined");
  url.searchParams.set("player", String(playerId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as SidelinedEnvelope;
}

function mapSidelined(playerId: number, item: SidelinedPeriod): SidelinedRow | null {
  const type = item.type?.trim() || null;
  if (!type) return null;

  return {
    player_id: playerId,
    type,
    start_date: dateOrNull(item.start),
    end_date: dateOrNull(item.end),
    sidelined_data: item,
    updated_at: new Date().toISOString(),
  };
}

function dateOrNull(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function uniqueRows(rows: SidelinedRow[]) {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.player_id}:${row.start_date ?? "null"}:${row.type}`,
        row,
      ]),
    ).values(),
  ];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: SidelinedRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("player_sidelined").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "player_id,start_date,type" },
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
