import "server-only";

import type { UserBetLeg, UserBetRow, UserBetStatus } from "@/utils/portfolio/types";
import { createClient } from "@/utils/supabase/server";

import {
  buildMarketBreakdown,
  buildPerformanceInsights,
  type MarketBreakdownRow,
  type PerformanceInsight,
} from "./insights";

export type PortfolioAlert = {
  id: string;
  kind: "won" | "lost" | "void" | "in_play";
  text: string;
  detail: string;
};

export type MonthlyPnl = {
  month: string;
  bets: number;
  stake: number;
  profit: number;
  roiPct: number;
};

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
  alerts: PortfolioAlert[];
  marketBreakdown: MarketBreakdownRow[];
  monthly: MonthlyPnl[];
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
    alerts: [],
    marketBreakdown: [],
    monthly: [],
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
    alerts: buildAlerts(bets),
    marketBreakdown: buildMarketBreakdown(settled),
    monthly: buildMonthlyPnl(settled),
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

const RECENT_SETTLE_MS = 48 * 60 * 60 * 1000;

/**
 * In-app alerts from stored bet rows: slips settled in the last 48h and
 * active slips whose legs have started grading.
 */
function buildAlerts(bets: UserBetRow[]): PortfolioAlert[] {
  const now = Date.now();
  const alerts: PortfolioAlert[] = [];

  for (const bet of bets) {
    const settledMs = bet.settled_at ? Date.parse(bet.settled_at) : null;
    if (
      (bet.status === "won" || bet.status === "lost" || bet.status === "void") &&
      settledMs != null &&
      now - settledMs <= RECENT_SETTLE_MS
    ) {
      const label =
        bet.status === "won" ? "Slip won" : bet.status === "lost" ? "Slip lost" : "Slip voided";
      alerts.push({
        id: `${bet.id}:settled`,
        kind: bet.status,
        text: `${label} — ${bet.legs.length} leg${bet.legs.length === 1 ? "" : "s"}`,
        detail: `Settled ${bet.settled_at?.slice(0, 10) ?? ""}`,
      });
      continue;
    }

    if (bet.status === "active" || bet.status === "partial") {
      const graded = bet.legs.filter((leg) => leg.result === "won" || leg.result === "lost").length;
      const pending = bet.legs.filter((leg) => !leg.result || leg.result === "pending").length;
      if (graded > 0 && pending > 0) {
        alerts.push({
          id: `${bet.id}:live`,
          kind: "in_play",
          text: `Slip in play — ${graded} of ${bet.legs.length} legs graded`,
          detail: `${pending} leg${pending === 1 ? "" : "s"} still pending`,
        });
      }
    }
  }

  return alerts.slice(0, 8);
}

/** Month buckets (YYYY-MM) over decided slips, newest first. */
function buildMonthlyPnl(settled: UserBetRow[]): MonthlyPnl[] {
  const byMonth = new Map<string, { bets: number; stake: number; profit: number }>();
  for (const bet of settled) {
    if (bet.status !== "won" && bet.status !== "lost") continue;
    const stamp = bet.settled_at ?? bet.created_at;
    const month = stamp.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const bucket = byMonth.get(month) ?? { bets: 0, stake: 0, profit: 0 };
    bucket.bets += 1;
    bucket.stake += bet.stake;
    bucket.profit += bet.profit ?? 0;
    byMonth.set(month, bucket);
  }
  return [...byMonth.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([month, bucket]) => ({
      month,
      bets: bucket.bets,
      stake: bucket.stake,
      profit: bucket.profit,
      roiPct: bucket.stake > 0 ? Math.round((bucket.profit / bucket.stake) * 1000) / 10 : 0,
    }));
}
