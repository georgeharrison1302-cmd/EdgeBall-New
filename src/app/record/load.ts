import "server-only";

import {
  buildMarketLedgers,
  type GradedTip,
  type ModelMarketLedger,
} from "@/app/tracker/model-grading-load";
import {
  calibrationBins,
  closingLineValue,
  cumulativeCurve,
  drawdown,
  priceVsResult,
  type CalibrationBin,
  type ClosingLine,
  type CurvePoint,
  type SettledTip,
} from "@/lib/record/metrics";
import { MODEL_V2_CUTOFF } from "@/lib/model/probability";
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
  clv: ClosingLine;
  curve: CurvePoint[];
  calibration: CalibrationBin[];
  markets: ModelMarketLedger[];
  versions: ModelVersionRecord[];
};

export type ModelVersionRecord = {
  label: string;
  note: string;
  tips: number;
  settled: number;
  wins: number;
  profit: number;
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
  closing_odds?: number | null;
};

export async function loadModelRecord(): Promise<ModelRecord> {
  const supabase = createAdminClient();
  const base =
    "tip_key, fixture_id, market, selection, source, odds, model_prob, edge_pct, kickoff, generated_at, status, profit";
  const first = await supabase
    .from("model_tips")
    .select(`${base}, closing_odds`)
    .order("generated_at", { ascending: true })
    .limit(10000);
  let data: unknown[] | null = first.data;
  if (first.error) {
    // closing_odds migration not applied yet — fall back without it.
    const second = await supabase
      .from("model_tips")
      .select(base)
      .order("generated_at", { ascending: true })
      .limit(10000);
    if (second.error) throw second.error;
    data = second.data;
  }
  const rows = (data ?? []) as Row[];

  const settledRows = rows.filter((row) => row.status === "won" || row.status === "lost");
  const settled: SettledTip[] = settledRows.map((row) => ({
    at: row.kickoff ?? row.generated_at,
    odds: Number(row.odds),
    closingOdds: row.closing_odds == null ? null : Number(row.closing_odds),
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

  const versionOf = (row: Row) => (Date.parse(row.generated_at) < Date.parse(MODEL_V2_CUTOFF) ? "v1" : "v2");
  const versions: ModelVersionRecord[] = [
    { label: "v1", note: "Raw third-party win probabilities compared directly to Bet365 prices" },
    { label: "v2", note: "Probabilities shrunk toward the de-vigged market, implausible edges rejected" },
  ].map((meta) => {
    const mine = rows.filter((row) => versionOf(row) === meta.label);
    const done = mine.filter((row) => row.status === "won" || row.status === "lost");
    return {
      ...meta,
      tips: mine.length,
      settled: done.length,
      wins: done.filter((row) => row.status === "won").length,
      profit: done.reduce((sum, row) => sum + Number(row.profit ?? 0), 0),
    };
  });

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
    clv: closingLineValue(settled),
    curve,
    calibration: calibrationBins(settled),
    markets: buildMarketLedgers(graded),
    versions,
  };
}
