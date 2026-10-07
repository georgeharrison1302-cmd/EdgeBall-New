import "server-only";

import {
  backtestFactor,
  FACTOR_DEFAULT_MARKET,
  type BacktestMarket,
  type FactorBacktestResult,
} from "@/lib/factors/backtester";
import { evaluateFixtureFactors } from "@/lib/factors/evaluator";
import { loadFixtureFactorInput } from "@/lib/factors/load-input";
import {
  FACTOR_CATALOG,
  type FactorEvaluation,
  type FixtureFactorId,
} from "@/lib/factors/types";
import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import {
  BET365_BOOKMAKER_ID,
  prematchBets,
} from "@/utils/api-football/bet-catalogs";
import { cachedLogo } from "@/utils/logos";
import {
  betsFromOddsData,
  latestOddsSnapshots,
  oddFor,
  type StoredOddsRow,
} from "@/utils/odds-api-io/stored";
import { createIngestClient } from "@/utils/supabase/admin";

const PREMATCH = ["NS", "TBD"] as const;
const UPCOMING_LIMIT = 60;

export type FactorScreenerMatch = {
  fixtureId: number;
  kickoff: string;
  kickoffAt: string | null;
  competition: string;
  home: { id: number; name: string; logo: string | null };
  away: { id: number; name: string; logo: string | null };
  evaluation: FactorEvaluation;
  market: BacktestMarket;
  marketLabel: string;
  marketOdd: number | null;
  hubHref: string;
};

export type FactorScreenerData = {
  factorId: FixtureFactorId;
  factors: Array<{
    id: FixtureFactorId;
    name: string;
    badgeLabel: string;
    description: string;
  }>;
  backtest: FactorBacktestResult;
  market: BacktestMarket;
  marketLabel: string;
  matches: FactorScreenerMatch[];
};

export type FactorFeedGroup = {
  factorId: FixtureFactorId;
  badgeLabel: string;
  name: string;
  description: string;
  headline: string;
  market: BacktestMarket;
  marketLabel: string;
  backtest: FactorBacktestResult;
  matches: FactorScreenerMatch[];
};

export type FactorFeedData = {
  groups: FactorFeedGroup[];
  totalMatches: number;
};

const MARKET_LABEL: Record<BacktestMarket, string> = {
  over_2_5_goals: "Over 2.5 Goals",
  over_3_5_cards: "Over 3.5 Cards",
  btts_yes: "BTTS Yes",
};

const FACTOR_ORDER: FixtureFactorId[] = [
  "disciplinary_storm",
  "fatigue_disparity",
  "form_clash",
  "relegation_fight",
];

/** Curated smart feed — push triggered factors to the user. */
export async function loadFactorFeed(): Promise<FactorFeedData> {
  const matchedByFactor = await loadAllTriggeredMatches();
  const groups: FactorFeedGroup[] = [];

  for (const factorId of FACTOR_ORDER) {
    const matches = matchedByFactor.get(factorId) ?? [];
    if (matches.length === 0) continue;
    const market = FACTOR_DEFAULT_MARKET[factorId];
    const backtest = await backtestFactor(factorId, market);
    const catalog = FACTOR_CATALOG[factorId];
    groups.push({
      factorId,
      badgeLabel: catalog.badgeLabel,
      name: catalog.name,
      description: catalog.description,
      headline: feedHeadline(catalog.badgeLabel, matches.length),
      market,
      marketLabel: MARKET_LABEL[market],
      backtest,
      matches,
    });
  }

  return {
    groups,
    totalMatches: groups.reduce((sum, group) => sum + group.matches.length, 0),
  };
}

export async function loadFactorScreener(
  factorId: FixtureFactorId,
): Promise<FactorScreenerData> {
  const market = FACTOR_DEFAULT_MARKET[factorId];
  const [backtest, matches] = await Promise.all([
    backtestFactor(factorId, market),
    loadUpcomingForFactor(factorId, market),
  ]);

  return {
    factorId,
    factors: (Object.keys(FACTOR_CATALOG) as FixtureFactorId[]).map((id) => ({
      id,
      name: FACTOR_CATALOG[id].name,
      badgeLabel: FACTOR_CATALOG[id].badgeLabel,
      description: FACTOR_CATALOG[id].description,
    })),
    backtest,
    market,
    marketLabel: MARKET_LABEL[market],
    matches,
  };
}

function feedHeadline(badgeLabel: string, count: number): string {
  const plural =
    count === 1
      ? badgeLabel
      : badgeLabel.endsWith("s")
        ? badgeLabel
        : `${badgeLabel}s`;
  return `We found ${count} ${plural} today`;
}

async function loadUpcomingForFactor(
  factorId: FixtureFactorId,
  market: BacktestMarket,
): Promise<FactorScreenerMatch[]> {
  const all = await loadAllTriggeredMatches();
  return (all.get(factorId) ?? []).map((match) => ({
    ...match,
    market,
    marketLabel: MARKET_LABEL[market],
  }));
}

async function loadAllTriggeredMatches(): Promise<Map<FixtureFactorId, FactorScreenerMatch[]>> {
  const empty = new Map<FixtureFactorId, FactorScreenerMatch[]>(
    FACTOR_ORDER.map((id) => [id, []]),
  );

  const supabase = createIngestClient();
  const now = new Date().toISOString();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, date, league_id, home_team_id, away_team_id, status_short")
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .in("status_short", [...PREMATCH])
    .gte("date", now)
    .order("date", { ascending: true })
    .limit(UPCOMING_LIMIT);
  if (error) throw error;

  const rows = fixtures ?? [];
  if (rows.length === 0) return empty;

  const teamIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.home_team_id, row.away_team_id]
          .filter((id): id is number => id != null)
          .map(Number),
      ),
    ),
  ];
  const leagueIds = [
    ...new Set(
      rows
        .map((row) => (row.league_id == null ? null : Number(row.league_id)))
        .filter((id): id is number => id != null),
    ),
  ];
  const fixtureIds = rows.map((row) => Number(row.id));

  const [{ data: teams }, { data: leagues }, { data: oddsRows }] = await Promise.all([
    supabase.from("teams").select("id, name, logo").in("id", teamIds),
    supabase.from("leagues").select("id, name").in("id", leagueIds),
    supabase
      .from("prematch_odds")
      .select("fixture_id, bookmaker_id, odds_data, updated_at")
      .in("fixture_id", fixtureIds)
      .eq("bookmaker_id", BET365_BOOKMAKER_ID)
      .order("updated_at", { ascending: false }),
  ]);

  const teamById = new Map((teams ?? []).map((team) => [Number(team.id), team]));
  const leagueById = new Map((leagues ?? []).map((league) => [Number(league.id), league.name]));
  const oddsByFixture = new Map<number, StoredOddsRow>();
  for (const row of latestOddsSnapshots((oddsRows ?? []) as StoredOddsRow[])) {
    const id = Number(row.fixture_id);
    if (!oddsByFixture.has(id)) oddsByFixture.set(id, row);
  }

  for (let index = 0; index < rows.length; index += 8) {
    const chunk = rows.slice(index, index + 8);
    const batch = await Promise.all(
      chunk.map(async (row) => {
        const fixtureId = Number(row.id);
        const input = await loadFixtureFactorInput(fixtureId);
        if (!input) return null;
        return { row, evaluations: evaluateFixtureFactors(fixtureId, input) };
      }),
    );

    for (const item of batch) {
      if (!item) continue;
      const { row, evaluations } = item;
      const fixtureId = Number(row.id);
      const homeId = Number(row.home_team_id);
      const awayId = Number(row.away_team_id);
      const homeRow = teamById.get(homeId);
      const awayRow = teamById.get(awayId);
      if (!homeRow || !awayRow) continue;

      const oddsRow = oddsByFixture.get(fixtureId);
      const bets = betsFromOddsData(oddsRow?.odds_data);
      const kickoffMs = row.date ? Date.parse(String(row.date)) : Number.NaN;
      const homeLogo = await cachedLogo("teams", homeId, homeRow.logo);
      const awayLogo = await cachedLogo("teams", awayId, awayRow.logo);

      for (const evaluation of evaluations) {
        if (!evaluation.matched) continue;
        const factorId = evaluation.factor.id;
        const market = FACTOR_DEFAULT_MARKET[factorId];
        const marketOdd = bets ? oddForMarket(bets, market) : null;
        empty.get(factorId)!.push({
          fixtureId,
          kickoff: formatKickoff(row.date),
          kickoffAt: Number.isFinite(kickoffMs) ? new Date(kickoffMs).toISOString() : null,
          competition: leagueById.get(Number(row.league_id)) ?? "Competition",
          home: { id: homeId, name: homeRow.name, logo: homeLogo },
          away: { id: awayId, name: awayRow.name, logo: awayLogo },
          evaluation,
          market,
          marketLabel: MARKET_LABEL[market],
          marketOdd,
          hubHref: `/fixtures/${fixtureId}`,
        });
      }
    }
  }

  return empty;
}

function oddForMarket(
  bets: NonNullable<ReturnType<typeof betsFromOddsData>>,
  market: BacktestMarket,
): number | null {
  if (market === "btts_yes") {
    return (
      oddFor(bets, prematchBets.bothTeamsToScore, ["Yes"]) ??
      oddByBetName(bets, /both teams|btts/i, (text) => text.includes("yes"))
    );
  }
  if (market === "over_2_5_goals") {
    const fromCatalog = oddForGoalsOver(bets.get(prematchBets.goalsOverUnder)?.values);
    if (fromCatalog != null) return fromCatalog;
    return oddByBetName(bets, /goals?\s*over\/?under|total goals/i, (text, handicap) => {
      const line25 =
        /\b2\.5\b/.test(text) || handicap === "2.5" || handicap === "2.50";
      return line25 && text.includes("over");
    });
  }
  // Cards OU is not always in Bet365 catalog — honest null when missing.
  return null;
}

function oddForGoalsOver(values: unknown): number | null {
  if (!Array.isArray(values)) return null;
  for (const value of values) {
    const row = value as {
      odd?: string | number | null;
      value?: string | null;
      handicap?: string | null;
    };
    const odd = Number(row.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const text = String(row.value ?? "").toLowerCase();
    const handicap = String(row.handicap ?? "").toLowerCase();
    const line25 = /\b2\.5\b/.test(text) || handicap === "2.5" || handicap === "2.50";
    if (line25 && text.includes("over")) return odd;
  }
  return null;
}

function oddByBetName(
  bets: NonNullable<ReturnType<typeof betsFromOddsData>>,
  nameRe: RegExp,
  accept: (text: string, handicap: string) => boolean,
): number | null {
  for (const bet of bets.values()) {
    if (!nameRe.test(String(bet.name ?? ""))) continue;
    for (const value of bet.values ?? []) {
      const odd = Number(value.odd);
      if (!Number.isFinite(odd) || odd <= 1) continue;
      const text = String(value.value ?? "").toLowerCase();
      const handicap = String(value.handicap ?? "").toLowerCase();
      if (accept(text, handicap)) return odd;
    }
  }
  return null;
}

function formatKickoff(value: string | null) {
  if (!value) return "Kickoff TBC";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Kickoff TBC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function parseFactorId(raw: string | undefined): FixtureFactorId {
  const keys = Object.keys(FACTOR_CATALOG) as FixtureFactorId[];
  if (raw && (keys as string[]).includes(raw)) return raw as FixtureFactorId;
  return "disciplinary_storm";
}
