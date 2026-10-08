import "server-only";

import {
  buildMarketLedgers,
  type GradedTip,
  type ModelMarketLedger,
} from "@/app/tracker/model-grading-load";
import {
  calibrationBins,
  cumulativeCurve,
  drawdown,
  priceVsResult,
  type CalibrationBin,
  type CurvePoint,
  type SettledTip,
} from "@/lib/record/metrics";
import { createAdminClient } from "@/utils/supabase/admin";

export type ModelRecord = {
  tracked: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  profit: number;
  roi: number | null;
  maxDrawdown: number;
  firstTipAt: string | null;
  price: { implied: number; actual: number } | null;
  curve: CurvePoint[];
  calibration: CalibrationBin[];
  markets: ModelMarketLedger[];
};

type Row = {
  tip_key: string;
  fixture_id: number;
  market: string;
  selection: string;
  source: string;
  odds: number;
  model_prob: number;
  edge_pct: number;
  kickoff: string | null;
  generated_at: string;
  status: string;
  profit: number | null;
};

export async function loadModelRecord(): Promise<ModelRecord> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("model_tips")
    .select(
      "tip_key, fixture_id, market, selection, source, odds, model_prob, edge_pct, kickoff, generated_at, status, profit",
    )
    .order("generated_at", { ascending: true })
    .limit(10000);
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const settledRows = rows.filter((row) => row.status === "won" || row.status === "lost");
  const settled: SettledTip[] = settledRows.map((row) => ({
    at: row.kickoff ?? row.generated_at,
    odds: Number(row.odds),
    modelProb: Number(row.model_prob),
    won: row.status === "won",
    profit: Number(row.profit ?? 0),
  }));

  const graded: GradedTip[] = rows.map((row) => ({
    id: row.tip_key,
    fixtureId: Number(row.fixture_id),
    match: "",
    kickoff: row.kickoff,
    market: row.market,
    selection: row.selection,
    odds: Number(row.odds),
    modelProb: Number(row.model_prob),
    edgePct: Number(row.edge_pct),
    source: row.source === "card_poisson" ? "card_poisson" : "match_prediction",
    status: row.status as GradedTip["status"],
    profit: row.profit == null ? null : Number(row.profit),
  }));

  const wins = settled.filter((tip) => tip.won).length;
  const profit = settled.reduce((sum, tip) => sum + tip.profit, 0);
  const curve = cumulativeCurve(settled);

  return {
    tracked: rows.length,
    settled: settled.length,
    pending: rows.length - settled.length,
    wins,
    losses: settled.length - wins,
    hitRate: settled.length ? wins / settled.length : null,
    profit,
    roi: settled.length ? profit / settled.length : null,
    maxDrawdown: drawdown(curve),
    firstTipAt: rows[0]?.generated_at ?? null,
    price: priceVsResult(settled),
    curve,
    calibration: calibrationBins(settled),
    markets: buildMarketLedgers(graded),
  };
}
