import "server-only";

import type { UserBetLeg, UserBetRow, UserBetStatus } from "@/utils/portfolio/types";
import { createClient } from "@/utils/supabase/server";

import { buildPerformanceInsights, type PerformanceInsight } from "./insights";

export type PortfolioSummary = {
  signedIn: boolean;
  email: string | null;
  active: UserBetRow[];
  settled: UserBetRow[];
  openStake: number;
  settledProfit: number;
  settledCount: number;
  winCount: number;
  hitRate: number | null;
  roi30d: number | null;
  chart: Array<{ day: string; cumulative: number }>;
  insights: PerformanceInsight[];
};

function asLegs(value: unknown): UserBetLeg[] {
  if (!Array.isArray(value)) return [];
  return value as UserBetLeg[];
}

function mapRow(row: Record<string, unknown>): UserBetRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    created_at: String(row.created_at),
    settled_at: row.settled_at == null ? null : String(row.settled_at),
    status: row.status as UserBetStatus,
    stake: Number(row.stake),
    combined_odds: Number(row.combined_odds),
    potential_return: Number(row.potential_return),
    profit: row.profit == null ? null : Number(row.profit),
    currency: String(row.currency ?? "GBP"),
    legs: asLegs(row.legs),
    notes: row.notes == null ? null : String(row.notes),
  };
}

export async function loadPortfolio(): Promise<PortfolioSummary> {
  const empty: PortfolioSummary = {
    signedIn: false,
    email: null,
    active: [],
    settled: [],
    openStake: 0,
    settledProfit: 0,
    settledCount: 0,
    winCount: 0,
    hitRate: null,
    roi30d: null,
    chart: [],
    insights: [],
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data, error } = await supabase
    .from("user_bets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  const bets = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  const active = bets.filter((bet) => bet.status === "active" || bet.status === "partial");
  const settled = bets.filter((bet) => bet.status === "won" || bet.status === "lost" || bet.status === "void");
  const openStake = active.reduce((sum, bet) => sum + bet.stake, 0);
  const settledProfit = settled.reduce((sum, bet) => sum + (bet.profit ?? 0), 0);
  const decided = settled.filter((bet) => bet.status === "won" || bet.status === "lost");
  const winCount = decided.filter((bet) => bet.status === "won").length;
  const hitRate = decided.length ? winCount / decided.length : null;

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = settled
    .filter((bet) => new Date(bet.settled_at ?? bet.created_at).getTime() >= since)
    .slice()
    .sort(
      (left, right) =>
        new Date(left.settled_at ?? left.created_at).getTime() -
        new Date(right.settled_at ?? right.created_at).getTime(),
    );
  const stake30 = recent.reduce((sum, bet) => sum + bet.stake, 0);
  const profit30 = recent.reduce((sum, bet) => sum + (bet.profit ?? 0), 0);
  const roi30d = stake30 > 0 ? profit30 / stake30 : null;

  const byDay = new Map<string, number>();
  let cumulative = 0;
  for (const bet of recent) {
    const day = (bet.settled_at ?? bet.created_at).slice(0, 10);
    cumulative += bet.profit ?? 0;
    byDay.set(day, cumulative);
  }
  const chart = [...byDay.entries()].map(([day, value]) => ({ day, cumulative: value }));

  return {
    signedIn: true,
    email: user.email ?? null,
    active,
    settled,
    openStake,
    settledProfit,
    settledCount: settled.length,
    winCount,
    hitRate,
    roi30d,
    chart,
    insights: buildPerformanceInsights(settled),
  };
}
