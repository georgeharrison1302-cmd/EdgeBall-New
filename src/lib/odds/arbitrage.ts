import "server-only";

import { asList, oddsApiIoKey, redactOddsApiIo } from "@/utils/odds-api-io/client";

const ARB_URL = "https://api.odds-api.io/v3/arbitrage-bets";
const SELECTED_URL = "https://api.odds-api.io/v3/bookmakers/selected";
/** Preferred UK books when the plan allows them (exact /v3/bookmakers names). */
const PREFERRED_BOOKMAKERS = [
  "Bet365",
  "Skybet",
  "William Hill",
  "Paddy Power",
  "Betfair Sportsbook",
] as const;
const LIMIT = 10;

export type ArbitrageLeg = {
  side: string;
  bookmaker: string;
  odds: number;
  directLink: string | null;
  label: string | null;
};

export type ArbitrageStake = {
  side: string;
  bookmaker: string;
  /** Fraction of total stake (0–1) from the API optimal stake. */
  stakePercent: number;
  /** API stake at their reference totalStake (usually 100). */
  referenceStake: number;
};

export type ArbitrageOpportunity = {
  id: string;
  eventId: number | null;
  matchName: string;
  league: string;
  marketLabel: string;
  /** Profit margin as percent points (e.g. 2.15 for 2.15%). */
  profitMarginPct: number;
  totalStake: number;
  legs: ArbitrageLeg[];
  stakes: ArbitrageStake[];
};

type ApiLeg = {
  side?: string | null;
  bookmaker?: string | null;
  odds?: string | number | null;
  directLink?: string | null;
  href?: string | null;
  label?: string | null;
};

type ApiStake = {
  side?: string | null;
  bookmaker?: string | null;
  stake?: number | null;
  potentialReturn?: number | null;
};

type ApiEvent = {
  home?: string | null;
  away?: string | null;
  league?: string | { name?: string | null } | null;
  sport?: string | { name?: string | null } | null;
  date?: string | null;
};

type ApiMarket = {
  name?: string | null;
  hdp?: number | null;
  label?: string | null;
};

type ApiOpportunity = {
  id?: string | null;
  eventId?: number | null;
  profitMargin?: number | null;
  impliedProbability?: number | null;
  totalStake?: number | null;
  market?: ApiMarket | null;
  legs?: ApiLeg[] | null;
  optimalStakes?: ApiStake[] | null;
  event?: ApiEvent | null;
};

/**
 * Live SureBets from Odds-API.io `/v3/arbitrage-bets`.
 * Uses the account's selected books (plan-limited); prefers our UK set when available.
 * Cached for 60s via Next.js fetch revalidate.
 */
export async function fetchArbitrageBets(): Promise<ArbitrageOpportunity[]> {
  const apiKey = oddsApiIoKey();
  const bookmakers = await resolveBookmakers(apiKey);

  const url = new URL(ARB_URL);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("bookmakers", bookmakers.join(","));
  url.searchParams.set("includeEventDetails", "true");
  url.searchParams.set("limit", String(LIMIT));

  const response = await fetch(url, {
    next: { revalidate: 60 },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      redactOddsApiIo(`odds-api.io ${response.status} /arbitrage-bets ${body.slice(0, 400)}`),
    );
  }

  const payload = body.trim() === "" ? [] : (JSON.parse(body) as unknown);
  return asList<ApiOpportunity>(payload)
    .map(normalizeOpportunity)
    .filter((row): row is ArbitrageOpportunity => row != null);
}

/** Plan-selected books ∩ preferred UK list (falls back to whatever is selected). */
async function resolveBookmakers(apiKey: string): Promise<string[]> {
  const url = new URL(SELECTED_URL);
  url.searchParams.set("apiKey", apiKey);
  const response = await fetch(url, { next: { revalidate: 300 } });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      redactOddsApiIo(`odds-api.io ${response.status} /bookmakers/selected ${body.slice(0, 400)}`),
    );
  }
  const payload = body.trim() === "" ? {} : (JSON.parse(body) as { bookmakers?: string[] });
  const selected = (payload.bookmakers ?? []).map((name) => String(name).trim()).filter(Boolean);
  if (selected.length === 0) {
    return ["Bet365", "Paddy Power"];
  }
  const preferred = PREFERRED_BOOKMAKERS.filter((name) =>
    selected.some((row) => row.toLowerCase() === name.toLowerCase()),
  );
  return preferred.length >= 2 ? preferred : selected;
}

function normalizeOpportunity(row: ApiOpportunity): ArbitrageOpportunity | null {
  const legs = (row.legs ?? [])
    .map(normalizeLeg)
    .filter((leg): leg is ArbitrageLeg => leg != null);
  if (legs.length < 2) return null;

  const totalStake =
    row.totalStake != null && Number.isFinite(row.totalStake) && row.totalStake > 0
      ? Number(row.totalStake)
      : 100;

  const stakes = (row.optimalStakes ?? [])
    .map((stake) => normalizeStake(stake, totalStake))
    .filter((stake): stake is ArbitrageStake => stake != null);

  // Fall back: equal split if API omits optimal stakes.
  const resolvedStakes =
    stakes.length >= 2
      ? stakes
      : legs.map((leg) => ({
          side: leg.side,
          bookmaker: leg.bookmaker,
          stakePercent: 1 / legs.length,
          referenceStake: totalStake / legs.length,
        }));

  const margin = Number(row.profitMargin);
  const profitMarginPct = Number.isFinite(margin)
    ? margin <= 1
      ? margin * 100
      : margin
    : 0;

  const id =
    (typeof row.id === "string" && row.id.trim()) ||
    `arb-${row.eventId ?? "x"}-${row.market?.name ?? "m"}-${legs.map((l) => l.bookmaker).join("-")}`;

  return {
    id,
    eventId: row.eventId != null && Number.isInteger(row.eventId) ? row.eventId : null,
    matchName: matchName(row.event),
    league: leagueName(row.event),
    marketLabel: marketLabel(row.market),
    profitMarginPct,
    totalStake,
    legs,
    stakes: resolvedStakes,
  };
}

function normalizeLeg(leg: ApiLeg): ArbitrageLeg | null {
  const odds = Number(leg.odds);
  if (!Number.isFinite(odds) || odds <= 1) return null;
  const bookmaker = String(leg.bookmaker ?? "").trim();
  if (!bookmaker) return null;
  const side = String(leg.side ?? leg.label ?? "selection").trim() || "selection";
  const link = leg.directLink ?? leg.href ?? null;
  return {
    side,
    bookmaker,
    odds,
    directLink: typeof link === "string" && link.trim() ? link.trim() : null,
    label: typeof leg.label === "string" && leg.label.trim() ? leg.label.trim() : null,
  };
}

function normalizeStake(stake: ApiStake, totalStake: number): ArbitrageStake | null {
  const amount = Number(stake.stake);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const bookmaker = String(stake.bookmaker ?? "").trim();
  if (!bookmaker) return null;
  return {
    side: String(stake.side ?? "").trim() || "selection",
    bookmaker,
    stakePercent: amount / totalStake,
    referenceStake: amount,
  };
}

function matchName(event: ApiEvent | null | undefined) {
  const home = event?.home?.trim();
  const away = event?.away?.trim();
  if (home && away) return `${home} vs ${away}`;
  if (home) return home;
  if (away) return away;
  return "Match not stored";
}

function leagueName(event: ApiEvent | null | undefined) {
  const league = event?.league;
  if (typeof league === "string" && league.trim()) return league.trim();
  if (league && typeof league === "object" && typeof league.name === "string" && league.name.trim()) {
    return league.name.trim();
  }
  return "League not stored";
}

function marketLabel(market: ApiMarket | null | undefined) {
  const name = market?.name?.trim() || "Market";
  const player = market?.label?.trim();
  const hdp = market?.hdp;
  const line =
    hdp != null && Number.isFinite(hdp)
      ? ` ${hdp > 0 ? `+${hdp}` : String(hdp)}`
      : "";
  if (player) return `${name}${line} — ${player}`;
  return `${name}${line}`;
}
