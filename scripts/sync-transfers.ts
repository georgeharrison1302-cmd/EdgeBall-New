import { createIngestClient } from "../src/utils/supabase/admin";
import type {
  ApiTransferResponse,
  TransferDetail,
} from "../src/utils/api-football/endpoints";

const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type TransfersEnvelope = {
  response?: ApiTransferResponse[];
};

type TransferRow = {
  player_id: number;
  transfer_date: string;
  transfer_type: string | null;
  team_in_id: number | null;
  team_in_name: string | null;
  team_out_id: number | null;
  team_out_name: string | null;
  transfer_data: unknown;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const playerIds = await collectPlayerIds(supabase);
  const pending = await missingTransferIds(supabase, playerIds);
  console.log(
    `player transfers unique=${playerIds.length} pending=${pending.length} (skip existing)`,
  );

  if (pending.length === 0) {
    console.log("player transfers sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, playerId] of pending.entries()) {
    try {
      const payload = await fetchTransfers(apiKey, playerId);
      const rows = uniqueRows(
        (payload.response ?? []).flatMap((item) => mapTransfers(playerId, item)),
      );

      if (rows.length > 0) {
        await upsertRows(supabase, rows);
        cached += rows.length;
        if ((index + 1) % 25 === 0 || index === 0) {
          console.log(
            `progress ${index + 1}/${pending.length} player ${playerId}: cached ${rows.length} transfers`,
          );
        }
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${pending.length} player ${playerId}: no transfers`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${pending.length} player ${playerId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`player transfers sync done cached=${cached} skipped=${skipped}`);
}

async function collectPlayerIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();
  await addColumnIds(supabase, "player_profiles", "player_id", ids);
  await addColumnIds(supabase, "team_squads", "player_id", ids);
  return [...ids].sort((left, right) => left - right);
}

async function missingTransferIds(
  supabase: ReturnType<typeof createIngestClient>,
  playerIds: number[],
) {
  const have = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_transfers")
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

async function fetchTransfers(apiKey: string, playerId: number) {
  const url = new URL("https://v3.football.api-sports.io/transfers");
  url.searchParams.set("player", String(playerId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as TransfersEnvelope;
}

function mapTransfers(playerId: number, item: ApiTransferResponse): TransferRow[] {
  const id = item.player?.id ?? playerId;
  return (item.transfers ?? [])
    .map((move) => mapMove(id, item, move))
    .filter((row): row is TransferRow => row != null);
}

function mapMove(
  playerId: number,
  item: ApiTransferResponse,
  move: TransferDetail,
): TransferRow | null {
  const transferDate = move.date?.trim() || null;
  if (!transferDate) return null;

  return {
    player_id: playerId,
    transfer_date: transferDate,
    transfer_type: move.type ?? null,
    team_in_id: move.teams?.in?.id ?? null,
    team_in_name: move.teams?.in?.name ?? null,
    team_out_id: move.teams?.out?.id ?? null,
    team_out_name: move.teams?.out?.name ?? null,
    transfer_data: { player: item.player ?? { id: playerId }, update: item.update ?? null, transfer: move },
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: TransferRow[]) {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.player_id}:${row.transfer_date}:${row.team_in_id ?? "null"}:${row.team_out_id ?? "null"}`,
        row,
      ]),
    ).values(),
  ];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: TransferRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("player_transfers").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "player_id,transfer_date,team_in_id,team_out_id" },
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
