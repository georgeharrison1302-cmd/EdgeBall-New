import { BET365_BOOKMAKER_ID, prematchBets } from "@/utils/api-football/bet-catalogs";

export const PADDY_POWER_BOOKMAKER_ID = 38;
export const BOOK_IDS = [BET365_BOOKMAKER_ID, PADDY_POWER_BOOKMAKER_ID] as const;

export type StoredOddsRow = {
  fixture_id: number;
  bookmaker_id: number;
  odds_data: unknown;
  updated_at?: string | null;
};

type BetValue = {
  value?: string | number | null;
  odd?: string | number | null;
  handicap?: string | number | null;
  player_id?: number | null;
  label?: string | null;
  model_prob?: number | string | null;
  edge_pct?: number | string | null;
  price?: number | string | null;
};

export type StoredBet = {
  id?: number | null;
  name?: string | null;
  values?: BetValue[] | null;
};

export function latestOddsSnapshots(rows: StoredOddsRow[]) {
  const latest = new Map<string, StoredOddsRow>();
  for (const row of rows) {
    const key = `${row.fixture_id}:${row.bookmaker_id}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

export function pickBookmaker(rows: StoredOddsRow[]) {
  const byFixture = new Map<number, StoredOddsRow[]>();
  for (const row of rows) {
    const list = byFixture.get(row.fixture_id) ?? [];
    list.push(row);
    byFixture.set(row.fixture_id, list);
  }
  const chosen = new Map<number, StoredOddsRow>();
  for (const [fixtureId, list] of byFixture) {
    chosen.set(
      fixtureId,
      list.find((row) => row.bookmaker_id === BET365_BOOKMAKER_ID) ?? list[0],
    );
  }
  return chosen;
}

export function betsFromOddsData(oddsData: unknown) {
  if (!oddsData || typeof oddsData !== "object") return null;
  const bets = (oddsData as { bets?: StoredBet[] }).bets;
  if (!Array.isArray(bets)) return null;
  return new Map(
    bets.filter((bet) => Number.isInteger(Number(bet.id))).map((bet) => [Number(bet.id), bet]),
  );
}

export function oddFor(bets: Map<number, StoredBet>, betId: number, labels: string[]) {
  const wanted = labels.map((label) => label.toLowerCase().replace(/\s+/g, " ").trim());
  for (const value of bets.get(betId)?.values ?? []) {
    const odd = Number(value.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const text = String(value.value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (wanted.includes(text)) return odd;
  }
  return null;
}

export function matchWinnerOdds(oddsData: unknown) {
  const bets = betsFromOddsData(oddsData);
  if (!bets) return { home: null as number | null, draw: null as number | null, away: null as number | null };
  return {
    home: oddFor(bets, prematchBets.matchWinner, ["Home"]),
    draw: oddFor(bets, prematchBets.matchWinner, ["Draw"]),
    away: oddFor(bets, prematchBets.matchWinner, ["Away"]),
  };
}

export function flattenBetPrices(oddsData: unknown) {
  const bets = betsFromOddsData(oddsData);
  if (!bets) return [];
  const rows: Array<{ market: string; value: string; odd: string }> = [];
  for (const bet of bets.values()) {
    const market = String(bet.name ?? "Price");
    for (const value of bet.values ?? []) {
      const odd = Number(value.odd);
      if (!Number.isFinite(odd) || odd <= 1) continue;
      const label = String(value.value ?? value.label ?? "").trim();
      if (!label) continue;
      rows.push({ market, value: label, odd: odd.toFixed(2) });
    }
  }
  return rows;
}
