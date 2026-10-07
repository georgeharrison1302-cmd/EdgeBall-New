import { createIngestClient } from "../src/utils/supabase/admin";
import { betIdFromLivePayload, type LiveBetId } from "../src/utils/api-football/bet-catalogs";

const CHUNK = 500;

type ApiBet = {
  id?: number | null;
  name?: string | null;
};

type LiveBetsEnvelope = {
  paging?: { current?: number; total?: number };
  response?: ApiBet[];
};

type BetRow = {
  bet_id: LiveBetId;
  name: string | null;
  bet_data: ApiBet;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  console.log("live bets master sync starting GET /odds/live/bets");

  const payload = await fetchLiveBets(apiKey);
  const rows = uniqueRows(
    (payload.response ?? [])
      .map(mapBet)
      .filter((row): row is BetRow => row != null),
  );

  if (rows.length === 0) {
    console.log("live bets master sync done cached=0 skipped=0 (empty response)");
    return;
  }

  await upsertRows(supabase, rows);
  console.log(
    `live bets master sync done cached=${rows.length} paging=${payload.paging?.current ?? 1}/${payload.paging?.total ?? 1}`,
  );
}

async function fetchLiveBets(apiKey: string) {
  const response = await fetch("https://v3.football.api-sports.io/odds/live/bets", {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as LiveBetsEnvelope;
}

function mapBet(item: ApiBet): BetRow | null {
  const rawId = Number(item.id);
  if (!Number.isInteger(rawId) || rawId <= 0) return null;
  const betId = betIdFromLivePayload(rawId);

  return {
    bet_id: betId,
    name: item.name ?? null,
    bet_data: item,
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: BetRow[]) {
  return [...new Map(rows.map((row) => [row.bet_id, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: BetRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("live_bets_master").upsert(
      rows.slice(index, index + CHUNK),
      { onConflict: "bet_id" },
    );
    if (error) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
