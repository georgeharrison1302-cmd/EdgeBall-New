/**
 * Settle active user_bets against finished fixture scores + card events.
 *
 *   npm run grade:user-bets
 */
import { createClient } from "@supabase/supabase-js";

import {
  emptyCardBook,
  ingestCardEventRow,
  type FixtureCardBook,
} from "@/utils/portfolio/card-events";
import {
  profitForStatus,
  settleSlip,
  type FixtureScore,
} from "@/utils/portfolio/grade-leg";
import type { UserBetLeg } from "@/utils/portfolio/types";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or service role key");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const supabase = admin();
  const { data: bets, error } = await supabase
    .from("user_bets")
    .select("id, stake, legs, status")
    .eq("status", "active")
    .limit(500);
  if (error) throw error;
  if (!bets?.length) {
    console.log("No active user bets.");
    return;
  }

  const fixtureIds = new Set<number>();
  for (const bet of bets) {
    const legs = (bet.legs ?? []) as UserBetLeg[];
    for (const leg of legs) {
      if (leg.fixtureId != null) fixtureIds.add(leg.fixtureId);
    }
  }

  const fixturesById = new Map<number, FixtureScore>();
  const cardBooks = new Map<number, FixtureCardBook>();
  const ids = [...fixtureIds];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data, error: fixError }, { data: events, error: eventError }] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, status_short, home_goals, away_goals")
        .in("id", chunk),
      supabase
        .from("fixture_events")
        .select("fixture_id, player_id, player_name, type, detail")
        .in("fixture_id", chunk),
    ]);
    if (fixError) throw fixError;
    if (eventError) throw eventError;
    for (const row of data ?? []) {
      fixturesById.set(Number(row.id), {
        id: Number(row.id),
        status_short: row.status_short,
        home_goals: row.home_goals,
        away_goals: row.away_goals,
      });
    }
    for (const row of events ?? []) {
      const fixtureId = Number(row.fixture_id);
      const book = cardBooks.get(fixtureId) ?? emptyCardBook(true);
      ingestCardEventRow(book, row);
      cardBooks.set(fixtureId, book);
    }
  }

  let updated = 0;
  let cardLegsSettled = 0;
  for (const bet of bets) {
    const legs = (bet.legs ?? []) as UserBetLeg[];
    const settled = settleSlip(legs, fixturesById, cardBooks);
    const newlySettledCards = settled.legs.filter(
      (leg, index) =>
        leg.marketKind === "player_card" &&
        leg.result !== "pending" &&
        legs[index]?.result === "pending",
    ).length;
    cardLegsSettled += newlySettledCards;

    if (settled.status === "active" && newlySettledCards === 0) {
      // Persist partial leg results when some card legs settled but slip still active.
      const changed = settled.legs.some(
        (leg, index) => leg.result !== (legs[index]?.result ?? "pending"),
      );
      if (!changed) continue;
      const { error: upError } = await supabase
        .from("user_bets")
        .update({ legs: settled.legs })
        .eq("id", bet.id);
      if (upError) throw upError;
      updated += 1;
      continue;
    }
    if (settled.status === "active") {
      const { error: upError } = await supabase
        .from("user_bets")
        .update({ legs: settled.legs })
        .eq("id", bet.id);
      if (upError) throw upError;
      updated += 1;
      continue;
    }

    const profit = profitForStatus(settled.status, Number(bet.stake), settled.settledOdds);
    const { error: upError } = await supabase
      .from("user_bets")
      .update({
        legs: settled.legs,
        status: settled.status,
        settled_at: new Date().toISOString(),
        profit,
        combined_odds:
          settled.settledOdds != null ? settled.settledOdds : undefined,
      })
      .eq("id", bet.id);
    if (upError) throw upError;
    updated += 1;
  }

  console.log(
    `Graded ${updated} / ${bets.length} active slips (card legs settled this run: ${cardLegsSettled}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
