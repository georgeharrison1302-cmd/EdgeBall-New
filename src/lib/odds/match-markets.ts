import { prematchBets } from "@/utils/api-football/bet-catalogs";
import { betsFromOddsData, oddFor, type StoredBet } from "@/utils/odds-api-io/stored";

export type MatchMarketPrices = {
  home: number | null;
  draw: number | null;
  away: number | null;
  bttsYes: number | null;
  bttsNo: number | null;
  over25: number | null;
  under25: number | null;
};

/** Extract the standard sportsbook markets shown on fixture boards. */
export function matchMarketPrices(oddsData: unknown): MatchMarketPrices {
  const bets = betsFromOddsData(oddsData);
  return {
    home: bets ? oddFor(bets, prematchBets.matchWinner, ["Home", "1"]) : null,
    draw: bets ? oddFor(bets, prematchBets.matchWinner, ["Draw", "X"]) : null,
    away: bets ? oddFor(bets, prematchBets.matchWinner, ["Away", "2"]) : null,
    bttsYes: bets ? oddFor(bets, prematchBets.bothTeamsToScore, ["Yes"]) : null,
    bttsNo: bets ? oddFor(bets, prematchBets.bothTeamsToScore, ["No"]) : null,
    over25: bets ? overUnderOdd(bets, "over", 2.5) : null,
    under25: bets ? overUnderOdd(bets, "under", 2.5) : null,
  };
}

export function hasMatchMarketPrices(prices: MatchMarketPrices) {
  return Object.values(prices).some((odd) => odd != null && Number.isFinite(odd) && odd > 1);
}

export function overUnderOdd(
  bets: Map<number, StoredBet>,
  side: "over" | "under",
  line: number,
) {
  const wanted = String(line);
  for (const value of bets.get(prematchBets.goalsOverUnder)?.values ?? []) {
    const odd = Number(value.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const text = String(value.value ?? "").toLowerCase();
    const handicap = String(value.handicap ?? "").trim();
    const lineMatches =
      new RegExp(`\\b${wanted.replace(".", "\\.")}\\b`).test(text) ||
      Number(handicap) === line;
    if (!lineMatches) continue;
    if (side === "over" && text.includes("over")) return odd;
    if (side === "under" && text.includes("under")) return odd;
  }
  return null;
}
