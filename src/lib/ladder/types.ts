export type LadderRunStatus = "active" | "completed" | "busted";
export type LadderStepResult = "pending" | "won" | "lost" | "void";

export type LadderRun = {
  id: string;
  status: LadderRunStatus;
  started_at: string;
  ended_at: string | null;
  current_step: number;
  starting_bankroll: number;
  current_pot: number;
  target_pot: number;
};

export type LadderLeg = {
  player: string | null;
  market: string;
  selection: string;
  match: string;
  odds: number;
  hit_rate: number;
  fixture_id?: number | null;
  player_id?: number | null;
};

export type LadderStep = {
  id: string;
  ladder_run_id: string;
  step_number: number;
  date: string;
  legs: LadderLeg[];
  combined_odds: number;
  stake: number;
  potential_return: number;
  result: LadderStepResult;
  created_at: string;
};

export const LADDER_STARTING_BANKROLL = 10;
export const LADDER_TARGET_POT = 1000;
export const LADDER_MIN_COMBINED = 1.2;
export const LADDER_MAX_COMBINED = 2.0;
export const LADDER_MIN_HIT_RATE = 60;
export const LADDER_MAX_LEGS = 2;
