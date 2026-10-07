/**
 * Sync API-Football /fixtures/events for recently finished fixtures that still
 * need card settlement (pending user card bets and/or missing event rows).
 *
 *   npm run sync:fixture-events
 */
import { createIngestClient } from "../src/utils/supabase/admin";
import { sleep, upsertFixtureEvents } from "./fixture-event-sync";

const FINISHED = ["FT", "AET", "PEN"] as const;
const WINDOW_MS = 48 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 220;

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY");

  const supabase = createIngestClient();
  const fixtureIds = await targetFixtureIds(supabase);
  console.log(`sync-fixture-events targets=${fixtureIds.length} (FT last 48h needing cards)`);

  if (fixtureIds.length === 0) {
    console.log("sync-fixture-events done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, fixtureId] of fixtureIds.entries()) {
    try {
      const count = await upsertFixtureEvents(supabase, apiKey, fixtureId);
      if (count > 0) {
        cached += count;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: cached ${count} events`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: no events`,
        );
      }
    } catch (cause) {
      const message =
        cause && typeof cause === "object" && "message" in cause
          ? String((cause as { message: unknown }).message)
          : cause instanceof Error
            ? cause.message
            : String(cause);
      console.log(
        `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: failed ${message}`,
      );
    }
    await sleep(REQUEST_GAP_MS);
  }

  console.log(`sync-fixture-events done cached=${cached} skipped=${skipped}`);
}

async function targetFixtureIds(supabase: ReturnType<typeof createIngestClient>) {
  const from = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: finished, error } = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...FINISHED])
    .gte("date", from)
    .order("date", { ascending: false })
    .limit(300);
  if (error) throw error;

  const finishedIds = (finished ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (finishedIds.length === 0) return [];

  const needing = new Set<number>();

  // 1) Active user slips with unsettled card legs on these fixtures.
  const { data: bets, error: betError } = await supabase
    .from("user_bets")
    .select("legs, status")
    .eq("status", "active")
    .limit(500);
  if (betError) throw betError;
  const finishedSet = new Set(finishedIds);
  for (const bet of bets ?? []) {
    const legs = Array.isArray(bet.legs) ? bet.legs : [];
    for (const leg of legs) {
      const row = leg as {
        fixtureId?: number;
        marketKind?: string;
        result?: string;
        marketName?: string;
        label?: string;
      };
      const fixtureId = Number(row.fixtureId);
      if (!finishedSet.has(fixtureId)) continue;
      const isCard =
        row.marketKind === "player_card" ||
        /card|booked/i.test(String(row.marketName ?? "")) ||
        /card|booked/i.test(String(row.label ?? ""));
      const pending = row.result == null || row.result === "pending";
      if (isCard && pending) needing.add(fixtureId);
    }
  }

  // 2) Finished fixtures with no stored events (model tracker stays pending).
  for (let i = 0; i < finishedIds.length; i += 100) {
    const chunk = finishedIds.slice(i, i + 100);
    const { data: events, error: eventError } = await supabase
      .from("fixture_events")
      .select("fixture_id, type, detail")
      .in("fixture_id", chunk);
    if (eventError) throw eventError;

    const withAny = new Set<number>();
    const withCards = new Set<number>();
    for (const row of events ?? []) {
      const fixtureId = Number(row.fixture_id);
      withAny.add(fixtureId);
      const type = String(row.type ?? "").toLowerCase();
      const detail = String(row.detail ?? "").toLowerCase();
      if (type.includes("card") || detail.includes("yellow") || detail.includes("red card")) {
        withCards.add(fixtureId);
      }
    }
    for (const fixtureId of chunk) {
      if (!withAny.has(fixtureId)) needing.add(fixtureId);
      else if (needing.has(fixtureId) && !withCards.has(fixtureId)) {
        // Pending card bet but no card rows yet — pull again.
        needing.add(fixtureId);
      }
    }
  }

  return [...needing];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
