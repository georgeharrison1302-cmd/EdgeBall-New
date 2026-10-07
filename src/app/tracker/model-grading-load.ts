import "server-only";

import { BET365_BOOKMAKER_ID } from "@/utils/api-football/bet-catalogs";
import { asNumber, asRecord, predictionPercents } from "@/utils/pyth";
import { betsFromOddsData, latestOddsSnapshots, pickBookmaker, type StoredOddsRow } from "@/utils/odds-api-io/stored";
import { extractModelEdge, parsePlayerPropValue } from "@/utils/odds/player-prop-value";
import {
  emptyCardBook,
  ingestCardEventRow,
  wasPlayerBooked,
  type FixtureCardBook,
} from "@/utils/portfolio/card-events";
import { createAdminClient } from "@/utils/supabase/admin";

const EDGE_FLOOR = 5;
const UNIT_STAKE = 1;
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const CARD_MARKETS = /player cards|player to be booked|player props - cards/i;

export type GradedTip = {
  id: string;
  fixtureId: number;
  match: string;
  kickoff: string | null;
  market: string;
  selection: string;
  odds: number;
  modelProb: number;
  edgePct: number;
  source: "card_poisson" | "match_prediction";
  status: "pending" | "won" | "lost" | "void";
  profit: number | null;
};

export type ModelMarketLedger = {
  family: string;
  label: string;
  tips: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  profit: number;
  roi: number | null;
  avgEdge: number | null;
};

export type ModelGradingSummary = {
  tipCount: number;
  settledCount: number;
  pendingCount: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  unitStake: number;
  totalProfit: number;
  roi: number | null;
  markets: ModelMarketLedger[];
  tips: GradedTip[];
};

type FixtureRow = {
  id: number;
  date: string | null;
  status_short: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
};

export async function loadModelGrading(): Promise<ModelGradingSummary> {
  const supabase = createAdminClient();
  const oddsRows: StoredOddsRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at, model_prob, edge_pct")
      .eq("bookmaker_id", BET365_BOOKMAKER_ID)
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as StoredOddsRow[];
    oddsRows.push(...page);
    if (page.length < 1000) break;
  }

  const latest = pickBookmaker(latestOddsSnapshots(oddsRows));
  const fixtureIds = [...latest.keys()];
  const fixtures = new Map<number, FixtureRow>();
  const teams = new Map<number, string>();
  const predictions = new Map<number, { home: number | null; draw: number | null; away: number | null }>();
  const cardBooks = new Map<number, FixtureCardBook>();

  for (let i = 0; i < fixtureIds.length; i += 200) {
    const chunk = fixtureIds.slice(i, i + 200);
    const [{ data: fix }, { data: pred }, { data: events }] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, date, status_short, home_goals, away_goals, home_team_id, away_team_id")
        .in("id", chunk),
      supabase.from("predictions").select("fixture_id, percent").in("fixture_id", chunk),
      supabase
        .from("fixture_events")
        .select("fixture_id, player_id, player_name, type, detail")
        .in("fixture_id", chunk),
    ]);
    for (const row of fix ?? []) {
      fixtures.set(Number(row.id), row as FixtureRow);
    }
    for (const row of pred ?? []) {
      const perc = predictionPercents(row.percent);
      predictions.set(Number(row.fixture_id), {
        home: percentToUnit(perc.home),
        draw: percentToUnit(perc.draw),
        away: percentToUnit(perc.away),
      });
    }
    for (const row of events ?? []) {
      const fixtureId = Number(row.fixture_id);
      const book = cardBooks.get(fixtureId) ?? emptyCardBook(true);
      ingestCardEventRow(book, row);
      cardBooks.set(fixtureId, book);
    }
  }

  const teamIds = [
    ...new Set(
      [...fixtures.values()].flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null),
    ),
  ];
  for (let i = 0; i < teamIds.length; i += 200) {
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds.slice(i, i + 200));
    for (const row of data ?? []) teams.set(Number(row.id), String(row.name));
  }

  const tips: GradedTip[] = [];

  for (const [fixtureId, odds] of latest) {
    const fixture = fixtures.get(fixtureId);
    const home = fixture?.home_team_id != null ? teams.get(fixture.home_team_id) ?? "Home" : "Home";
    const away = fixture?.away_team_id != null ? teams.get(fixture.away_team_id) ?? "Away" : "Away";
    const match = `${home} vs ${away}`;
    const finished = fixture?.status_short != null && FINISHED.has(fixture.status_short);

    // Card Poisson tips — value-level edge only (never paint row best-edge onto every selection).
    const oddsData = asRecord(odds.odds_data);
    const betList = Array.isArray(oddsData?.bets) ? oddsData.bets : [];
    for (const bet of betList) {
      const record = asRecord(bet);
      const name = String(record?.name ?? "");
      if (!CARD_MARKETS.test(name)) continue;
      const values = Array.isArray(record?.values) ? record.values : [];
      for (const value of values) {
        const parsed = parsePlayerPropValue(value);
        if (!parsed) continue;
        const { modelProb, edgePct } = extractModelEdge(value, null, null);
        const odd = parsed.odd;
        if (modelProb == null || edgePct == null || odd == null || odd <= 1) continue;
        if (edgePct <= EDGE_FLOOR) continue;
        const playerId = parsed.playerId;
        let status: GradedTip["status"] = "pending";
        let profit: number | null = null;
        if (finished) {
          const booked = wasPlayerBooked(
            cardBooks.get(fixtureId),
            playerId,
            parsed.playerName,
          );
          if (booked != null) {
            status = booked ? "won" : "lost";
            profit = booked ? UNIT_STAKE * (odd - 1) : -UNIT_STAKE;
          }
        }
        tips.push({
          id: `card:${fixtureId}:${playerId ?? parsed.playerName}:${odd}`,
          fixtureId,
          match,
          kickoff: fixture?.date ?? null,
          market: "Player to be Booked",
          selection: parsed.playerName || parsed.rawLabel || "Player",
          odds: odd,
          modelProb,
          edgePct,
          source: "card_poisson",
          status,
          profit,
        });
      }
    }

    // Match 1X2 tips from stored predictions vs Bet365 winner odds (score-settleable).
    const bets = betsFromOddsData(odds.odds_data) ?? new Map();
    const winner = bets.get(1);
    const perc = predictions.get(fixtureId);
    if (winner?.values && perc) {
      const map: Array<{ key: "Home" | "Draw" | "Away"; model: number | null; goalsCheck: () => boolean | null }> = [
        {
          key: "Home",
          model: perc.home,
          goalsCheck: () =>
            fixture?.home_goals == null || fixture.away_goals == null
              ? null
              : fixture.home_goals > fixture.away_goals,
        },
        {
          key: "Draw",
          model: perc.draw,
          goalsCheck: () =>
            fixture?.home_goals == null || fixture.away_goals == null
              ? null
              : fixture.home_goals === fixture.away_goals,
        },
        {
          key: "Away",
          model: perc.away,
          goalsCheck: () =>
            fixture?.home_goals == null || fixture.away_goals == null
              ? null
              : fixture.away_goals > fixture.home_goals,
        },
      ];
      for (const outcome of map) {
        const value = winner.values.find(
          (row: { value?: string | number | null; odd?: string | number | null }) =>
            String(row.value ?? "").toLowerCase() === outcome.key.toLowerCase(),
        );
        const odd = asNumber(value?.odd);
        if (odd == null || odd <= 1 || outcome.model == null || outcome.model <= 0) continue;
        const edgePct = (odd * outcome.model - 1) * 100;
        if (edgePct <= EDGE_FLOOR) continue;
        let status: GradedTip["status"] = "pending";
        let profit: number | null = null;
        if (finished) {
          const hit = outcome.goalsCheck();
          if (hit == null) status = "pending";
          else {
            status = hit ? "won" : "lost";
            profit = hit ? UNIT_STAKE * (odd - 1) : -UNIT_STAKE;
          }
        }
        tips.push({
          id: `1x2:${fixtureId}:${outcome.key}`,
          fixtureId,
          match,
          kickoff: fixture?.date ?? null,
          market: "Match Winner",
          selection: outcome.key === "Home" ? `${home} win` : outcome.key === "Away" ? `${away} win` : "Draw",
          odds: odd,
          modelProb: outcome.model,
          edgePct,
          source: "match_prediction",
          status,
          profit,
        });
      }
    }
  }

  tips.sort((left, right) => right.edgePct - left.edgePct || right.odds - left.odds);
  const settled = tips.filter((tip) => tip.status === "won" || tip.status === "lost");
  const wins = settled.filter((tip) => tip.status === "won").length;
  const losses = settled.filter((tip) => tip.status === "lost").length;
  const totalProfit = settled.reduce((sum, tip) => sum + (tip.profit ?? 0), 0);
  const stake = settled.length * UNIT_STAKE;

  return {
    tipCount: tips.length,
    settledCount: settled.length,
    pendingCount: tips.filter((tip) => tip.status === "pending").length,
    wins,
    losses,
    hitRate: settled.length ? wins / settled.length : null,
    unitStake: UNIT_STAKE,
    totalProfit,
    roi: stake > 0 ? totalProfit / stake : null,
    markets: buildMarketLedgers(tips),
    tips: tips.slice(0, 80),
  };
}

const FAMILY_ORDER = [
  "match_winner",
  "goals_ou",
  "btts",
  "team_cards",
  "player_cards",
  "fouls",
  "corners",
  "other",
] as const;

const FAMILY_LABELS: Record<string, string> = {
  match_winner: "Match Selection",
  goals_ou: "Over/Under Goals",
  btts: "BTTS",
  team_cards: "Team Cards",
  player_cards: "Player Cards",
  fouls: "Fouls",
  corners: "Corners",
  other: "Other",
};

function marketFamily(tip: GradedTip): string {
  const name = tip.market.toLowerCase();
  if (tip.source === "card_poisson" || /booked|player.*card/.test(name)) return "player_cards";
  if (/match winner|1x2/.test(name)) return "match_winner";
  if (/over|under|goals|total/.test(name)) return "goals_ou";
  if (/btts|both teams/.test(name)) return "btts";
  if (/team card|cards/.test(name)) return "team_cards";
  if (/foul/.test(name)) return "fouls";
  if (/corner/.test(name)) return "corners";
  return "other";
}

function buildMarketLedgers(tips: GradedTip[]): ModelMarketLedger[] {
  const buckets = new Map<string, GradedTip[]>();
  for (const tip of tips) {
    const family = marketFamily(tip);
    const list = buckets.get(family) ?? [];
    list.push(tip);
    buckets.set(family, list);
  }
  const ledgers: ModelMarketLedger[] = [];
  for (const [family, list] of buckets) {
    const settled = list.filter((tip) => tip.status === "won" || tip.status === "lost");
    const wins = settled.filter((tip) => tip.status === "won").length;
    const profit = settled.reduce((sum, tip) => sum + (tip.profit ?? 0), 0);
    const edgeSum = list.reduce((sum, tip) => sum + tip.edgePct, 0);
    ledgers.push({
      family,
      label: FAMILY_LABELS[family] ?? family,
      tips: list.length,
      settled: settled.length,
      pending: list.length - settled.length,
      wins,
      losses: settled.length - wins,
      hitRate: settled.length ? wins / settled.length : null,
      profit,
      roi: settled.length ? profit / settled.length : null,
      avgEdge: list.length ? edgeSum / list.length : null,
    });
  }
  ledgers.sort(
    (a, b) =>
      FAMILY_ORDER.indexOf(a.family as (typeof FAMILY_ORDER)[number]) -
      FAMILY_ORDER.indexOf(b.family as (typeof FAMILY_ORDER)[number]),
  );
  return ledgers;
}

function percentToUnit(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
