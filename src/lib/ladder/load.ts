import "server-only";

import { createClient } from "@/utils/supabase/server";
import type { LadderLeg, LadderRun, LadderStep } from "@/lib/ladder/types";

export type LadderPageData = {
  activeRun: LadderRun | null;
  steps: LadderStep[];
  history: LadderRun[];
};

/** Public read of Ladder Challenge state (anon RLS select). */
export async function loadLadderPageData(): Promise<LadderPageData> {
  const supabase = await createClient();

  const { data: activeRunRow, error: activeError } = await supabase
    .from("ladder_runs")
    .select("*")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) throw new Error(activeError.message);

  const { data: historyRows, error: historyError } = await supabase
    .from("ladder_runs")
    .select("*")
    .neq("status", "active")
    .order("started_at", { ascending: false })
    .limit(20);
  if (historyError) throw new Error(historyError.message);

  const activeRun = activeRunRow ? mapRun(activeRunRow as Record<string, unknown>) : null;
  const history = (historyRows ?? []).map((row) => mapRun(row as Record<string, unknown>));

  if (!activeRun) {
    return { activeRun: null, steps: [], history };
  }

  const { data: stepRows, error: stepsError } = await supabase
    .from("ladder_steps")
    .select("*")
    .eq("ladder_run_id", activeRun.id)
    .order("step_number", { ascending: true });
  if (stepsError) throw new Error(stepsError.message);

  return {
    activeRun,
    steps: (stepRows ?? []).map((row) => mapStep(row as Record<string, unknown>)),
    history,
  };
}

function mapRun(row: Record<string, unknown>): LadderRun {
  return {
    id: String(row.id),
    status: row.status as LadderRun["status"],
    started_at: String(row.started_at),
    ended_at: row.ended_at == null ? null : String(row.ended_at),
    current_step: Number(row.current_step),
    starting_bankroll: Number(row.starting_bankroll),
    current_pot: Number(row.current_pot),
    target_pot: Number(row.target_pot),
  };
}

function mapStep(row: Record<string, unknown>): LadderStep {
  const legsRaw = row.legs;
  const legs = Array.isArray(legsRaw) ? (legsRaw as LadderLeg[]) : [];
  return {
    id: String(row.id),
    ladder_run_id: String(row.ladder_run_id),
    step_number: Number(row.step_number),
    date: String(row.date).slice(0, 10),
    legs,
    combined_odds: Number(row.combined_odds),
    stake: Number(row.stake),
    potential_return: Number(row.potential_return),
    result: row.result as LadderStep["result"],
    created_at: String(row.created_at),
  };
}
