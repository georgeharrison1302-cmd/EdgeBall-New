/**
 * Settle pending player-card legs on active user_bets from fixture_events.
 * Also logs how many finished model-tracker card tips can now resolve.
 *
 *   npm run grade:card-props
 *   npm run grade:all
 */
import { createClient } from "@supabase/supabase-js";

import {
  emptyCardBook,
  ingestCardEventRow,
  wasPlayerBooked,
  type FixtureCardBook,
} from "../src/utils/portfolio/card-events";
import {
  isFixtureFinished,
  payoutForWin,
  profitForStatus,
  settleSlip,
  type FixtureScore,
} from "../src/utils/portfolio/grade-leg";
import type { UserBetLeg } from "../src/utils/portfolio/types";

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

  const active = (bets ?? []).filter((bet) => {
    const legs = (bet.legs ?? []) as UserBetLeg[];
    return legs.some(
      (leg) =>
        leg.marketKind === "player_card" &&
        (leg.result == null || leg.result === "pending"),
    );
  });

  if (active.length === 0) {
    console.log("No active slips with pending card props.");
  }

  const fixtureIds = new Set<number>();
  for (const bet of active) {
    for (const leg of (bet.legs ?? []) as UserBetLeg[]) {
      if (leg.fixtureId != null) fixtureIds.add(leg.fixtureId);
    }
  }

  const fixturesById = new Map<number, FixtureScore>();
  const cardBooks = new Map<number, FixtureCardBook>();
  const ids = [...fixtureIds];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: fixtures, error: fixError }, { data: events, error: eventError }] =
      await Promise.all([
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
    for (const row of fixtures ?? []) {
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

  let slipsUpdated = 0;
  let cardWins = 0;
  let cardLosses = 0;

  for (const bet of active) {
    const legs = (bet.legs ?? []) as UserBetLeg[];
    const before = legs.map((leg) => leg.result ?? "pending");
    const settled = settleSlip(legs, fixturesById, cardBooks);

    for (const leg of settled.legs) {
      if (leg.marketKind !== "player_card") continue;
      if (leg.result === "won") {
        cardWins += 1;
        const payout = payoutForWin(Number(bet.stake), leg.decimalOdds);
        console.log(
          `card won slip=${bet.id} player=${leg.player ?? leg.label} payout=${payout.toFixed(2)}`,
        );
      } else if (leg.result === "lost") {
        cardLosses += 1;
      }
    }

    const changed = settled.legs.some(
      (leg, index) => (leg.result ?? "pending") !== before[index],
    );
    if (!changed) continue;

    if (settled.status === "active") {
      const { error: upError } = await supabase
        .from("user_bets")
        .update({ legs: settled.legs })
        .eq("id", bet.id);
      if (upError) throw upError;
    } else {
      const profit = profitForStatus(
        settled.status,
        Number(bet.stake),
        settled.settledOdds,
      );
      const { error: upError } = await supabase
        .from("user_bets")
        .update({
          legs: settled.legs,
          status: settled.status,
          settled_at: new Date().toISOString(),
          profit,
          combined_odds: settled.settledOdds ?? undefined,
        })
        .eq("id", bet.id);
      if (upError) throw upError;
    }
    slipsUpdated += 1;
  }

  // Model tracker settles live from fixture_events — report ready FT books.
  let trackerReady = 0;
  for (const [fixtureId, fixture] of fixturesById) {
    if (!isFixtureFinished(fixture.status_short)) continue;
    if (cardBooks.get(fixtureId)?.synced) trackerReady += 1;
  }

  console.log(
    `grade-card-props slipsUpdated=${slipsUpdated} cardWins=${cardWins} cardLosses=${cardLosses} trackerFixturesWithEvents=${trackerReady}`,
  );

  // Sanity: name match helper available for spot checks
  void wasPlayerBooked;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
