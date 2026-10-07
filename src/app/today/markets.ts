import type { RankedProp } from "./load";

export const MARKET_FILTERS = [
  { id: "goals", label: "Goals", markets: ["score"] },
  { id: "assists", label: "Assists", markets: ["assists"] },
  { id: "shots", label: "Shots", markets: ["shots", "shotsOn"] },
  { id: "cards", label: "Cards", markets: [] },
  { id: "tackles", label: "Tackles", markets: ["tackles"] },
  { id: "fouls", label: "Fouls", markets: ["foulsCommitted", "foulsWon"] },
] as const;

export type MarketFilterId = (typeof MARKET_FILTERS)[number]["id"];

export function propsForFilter(props: RankedProp[], filterId: MarketFilterId) {
  const filter = MARKET_FILTERS.find((item) => item.id === filterId);
  if (!filter || filter.markets.length === 0) return [];
  return props.filter((prop) => (filter.markets as readonly string[]).includes(prop.market));
}

export function legKey(prop: Pick<RankedProp, "fixtureId" | "playerId" | "market">) {
  return `${prop.fixtureId}:${prop.playerId}:${prop.market}`;
}

export function combinedOdds(odds: number[]) {
  if (odds.length === 0) return 0;
  return odds.reduce((product, odd) => product * odd, 1);
}
