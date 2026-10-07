import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

export type LegResult = "won" | "lost" | "void" | "pending";

export type UserBetLeg = {
  fixtureId?: number;
  marketKind?: SlipMarketKind;
  line?: number;
  label: string;
  marketName: string;
  player?: string;
  match?: string;
  decimalOdds: number;
  selectionId: string | number;
  result?: LegResult;
};

export type UserBetStatus = "active" | "won" | "lost" | "void" | "partial";

export type UserBetRow = {
  id: string;
  user_id: string;
  created_at: string;
  settled_at: string | null;
  status: UserBetStatus;
  stake: number;
  combined_odds: number;
  potential_return: number;
  profit: number | null;
  currency: string;
  legs: UserBetLeg[];
  notes: string | null;
};
