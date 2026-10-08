/**
 * Settle pending model_tips rows against finished fixtures + card events.
 *
 *   npm run grade:model-tips
 *
 * Only pending rows are touched — settled tips are never mutated, keeping
 * the ledger immutable after grading.
 */
import { BET365_BOOKMAKER_ID } from "@/utils/api-football/bet-catalogs";
import { betsFromOddsData } from "@/utils/odds-api-io/stored";
import {
  emptyCardBook,
  ingestCardEventRow,
  wasPlayerBooked,
  type FixtureCardBook,
} from "@/utils/portfolio/card-events";
import { asNumber } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

const UNIT_STAKE = 1;
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const CHUNK = 200;

const OUTCOME_LABEL: Record<string, string> = { home: "Home", draw: "Draw", away: "Away" };

type TipRow = {
  tip_key: string;
  fixture_id: number;
  player_id: number | null;
  selection: string;
  outcome: string | null;
  source: string;
  odds: number | string;
  kickoff: string | null;
};

type Supabase = ReturnType<typeof createIngestClient>;

/** True once the closing_odds migration has been applied. */
async function closingOddsSupported(supabase: Supabase) {
  const { error } = await supabase.from("model_tips").select("closing_odds").limit(1);
  return !error;
}

/**
 * Stamp the last stored Bet365 price as the closing line for tips whose
 * fixture has kicked off. CLV is only meaningful for match_prediction tips —
 * card props keep closing_odds null.
 */
async function stampClosingOdds(supabase: Supabase, pending: TipRow[]) {
  const now = Date.now();
  const targets = pending.filter(
    (row) =>
      row.source === "match_prediction" &&
      row.outcome != null &&
      OUTCOME_LABEL[row.outcome] != null &&
      row.kickoff != null &&
      Date.parse(row.kickoff) < now,
  );
  if (targets.length === 0) return 0;

  const fixtureIds = [...new Set(targets.map((row) => Number(row.fixture_id)))];
  const oddsByFixture = new Map<number, unknown>();
  for (let i = 0; i < fixtureIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("prematch_odds")
      .select("fixture_id, odds_data")
      .eq("bookmaker_id", BET365_BOOKMAKER_ID)
      .in("fixture_id", fixtureIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data ?? []) oddsByFixture.set(Number(row.fixture_id), row.odds_data);
  }

  let stamped = 0;
  for (const tip of targets) {
    const oddsData = oddsByFixture.get(Number(tip.fixture_id));
    const bets = betsFromOddsData(oddsData);
    if (!bets) continue;
    const winner = [...bets.values()].find(
      (bet) => String(bet.name ?? "").toLowerCase() === "match winner",
    );
    const wanted = OUTCOME_LABEL[tip.outcome!].toLowerCase();
    const closing = (winner?.values ?? [])
      .map((value) => ({ odd: Number(value.odd), label: String(value.value ?? "").toLowerCase() }))
      .find((value) => value.label === wanted && Number.isFinite(value.odd) && value.odd > 1);
    if (!closing) continue;
    const { error } = await supabase
      .from("model_tips")
      .update({ closing_odds: closing.odd, closed_at: new Date().toISOString() })
      .eq("tip_key", tip.tip_key)
      .eq("status", "pending")
      .is("closing_odds", null);
    if (error) throw error;
    stamped += 1;
  }
  return stamped;
}

async function main() {
  const supabase = createIngestClient();
  const { data: pending, error } = await supabase
    .from("model_tips")
    .select("tip_key, fixture_id, player_id, selection, outcome, source, odds, kickoff")
    .eq("status", "pending")
    .limit(2000);
  if (error) throw error;
  if (!pending?.length) {
    console.log("No pending model tips.");
    return;
  }

  if (await closingOddsSupported(supabase)) {
    const stamped = await stampClosingOdds(supabase, pending as TipRow[]);
    if (stamped > 0) console.log(`closing odds stamped: ${stamped}`);
  }

  const fixtureIds = [...new Set(pending.map((row: TipRow) => Number(row.fixture_id)))];
  const fixtures = new Map<
    number,
    { status_short: string | null; home_goals: number | null; away_goals: number | null }
  >();
  const cardBooks = new Map<number, FixtureCardBook>();

  for (let i = 0; i < fixtureIds.length; i += CHUNK) {
    const chunk = fixtureIds.slice(i, i + CHUNK);
    const [{ data: fix }, { data: events }] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, status_short, home_goals, away_goals")
        .in("id", chunk),
      supabase
        .from("fixture_events")
        .select("fixture_id, player_id, player_name, type, detail")
        .in("fixture_id", chunk),
    ]);
    for (const row of fix ?? []) fixtures.set(Number(row.id), row);
    for (const row of events ?? []) {
      const fixtureId = Number(row.fixture_id);
      const book = cardBooks.get(fixtureId) ?? emptyCardBook(true);
      ingestCardEventRow(book, row);
      cardBooks.set(fixtureId, book);
    }
  }

  let settled = 0;
  for (const row of pending as TipRow[]) {
    const fixture = fixtures.get(Number(row.fixture_id));
    if (!fixture || fixture.status_short == null || !FINISHED.has(fixture.status_short)) continue;

    const odds = asNumber(row.odds) ?? 0;
    let won: boolean | null = null;

    if (row.source === "card_poisson") {
      won = wasPlayerBooked(cardBooks.get(Number(row.fixture_id)), row.player_id, row.selection);
    } else if (row.source === "match_prediction" && row.outcome) {
      const hg = fixture.home_goals;
      const ag = fixture.away_goals;
      if (hg != null && ag != null) {
        won = row.outcome === "home" ? hg > ag : row.outcome === "draw" ? hg === ag : ag > hg;
      }
    }
    if (won == null) continue;

    const { error: updateError } = await supabase
      .from("model_tips")
      .update({
        status: won ? "won" : "lost",
        profit: won ? UNIT_STAKE * (odds - 1) : -UNIT_STAKE,
        settled_at: new Date().toISOString(),
      })
      .eq("tip_key", row.tip_key)
      .eq("status", "pending");
    if (updateError) throw updateError;
    settled += 1;
  }

  console.log(`model tips graded: ${settled} / ${pending.length} pending settled`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
