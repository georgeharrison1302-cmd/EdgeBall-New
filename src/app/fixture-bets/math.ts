export type FixtureBet = {
  fixtureId: number;
  match: string;
  kickoff: string;
  competition: string;
  type: string;
  pick: string;
  odd: number;
  rate: number;
  price: number;
  edge: number;
  roi: number;
  games: number;
};

export function atMost(lambda: number, count: number) {
  let term = Math.exp(-lambda);
  let sum = 0;
  for (let index = 0; index <= count; index += 1) {
    sum += term;
    term *= lambda / (index + 1);
  }
  return sum;
}

export function atLeast(lambda: number, count: number) {
  if (count <= 0) return 1;
  return 1 - atMost(lambda, count - 1);
}

export function edgeRow(input: {
  fixtureId: number;
  match: string;
  kickoff: string;
  competition: string;
  type: string;
  pick: string;
  odd: number;
  lambda: number;
  games: number;
  under: boolean;
  line: number;
}): FixtureBet | null {
  if (input.games < 2 || input.lambda < 0 || input.odd < 1.15 || input.odd > 6) return null;
  const model = input.under ? atMost(input.lambda, Math.floor(input.line)) : atLeast(input.lambda, Math.ceil(input.line));
  return fromChance({ ...input, model });
}

export function fromChance(input: {
  fixtureId: number;
  match: string;
  kickoff: string;
  competition: string;
  type: string;
  pick: string;
  odd: number;
  games: number;
  model: number;
}): FixtureBet | null {
  if (input.games < 2 || input.odd < 1.15 || input.odd > 6) return null;
  if (input.model >= 0.98 || input.model <= 0.02) return null;
  const price = 1 / input.odd;
  const edge = (input.model - price) * 100;
  if (edge <= 0) return null;
  return {
    fixtureId: input.fixtureId,
    match: input.match,
    kickoff: input.kickoff,
    competition: input.competition,
    type: input.type,
    pick: input.pick,
    odd: input.odd,
    rate: Math.round(input.model * 100),
    price: Math.round(price * 100),
    edge: Math.round(edge * 10) / 10,
    roi: Math.round((input.model * input.odd - 1) * 1000) / 10,
    games: input.games,
  };
}
