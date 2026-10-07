import "server-only";

import { loadBuilderBoard } from "@/app/builder/load";
import type { GeneratorProp } from "@/components/AdvancedGenerator";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LADDER_MAX_COMBINED,
  LADDER_MAX_LEGS,
  LADDER_MIN_COMBINED,
  LADDER_MIN_HIT_RATE,
  LADDER_STARTING_BANKROLL,
  LADDER_TARGET_POT,
  type LadderLeg,
  type LadderRun,
  type LadderStep,
} from "@/lib/ladder/types";
import {
  validateSlipCandidate,
  type GeneratorLegLike,
} from "@/utils/betslip/slipValidator";

export type GenerateLadderStepResult =
  | { ok: true; created: boolean; run: LadderRun; step: LadderStep }
  | { ok: false; reason: string; run?: LadderRun };

/**
 * Pick today's Ladder Challenge step (1.20–2.00 combined, ≤2 legs, hitRate ≥ 60).
 * Idempotent per run+date via unique constraint.
 */
export async function generateNextLadderStep(): Promise<GenerateLadderStepResult> {
  const admin = createAdminClient();
  const run = await ensureActiveRun(admin);
  const today = londonToday();

  const existing = await loadStepForDate(admin, run.id, today);
  if (existing) {
    return { ok: true, created: false, run, step: existing };
  }

  const board = await loadBuilderBoard();
  const candidates = board.generatorProps
    .filter((prop) => isLadderCandidate(prop))
    .sort(
      (left, right) =>
        right.hitRate - left.hitRate ||
        (right.edgePct ?? right.hitRate) - (left.edgePct ?? left.hitRate) ||
        (left.odds ?? 99) - (right.odds ?? 99),
    );

  const slip = pickLadderSlip(candidates);
  if (!slip || slip.length === 0) {
    return {
      ok: false,
      reason: `No valid ladder slip today — need hitRate ≥ ${LADDER_MIN_HIT_RATE}% with combined odds between ${LADDER_MIN_COMBINED.toFixed(2)} and ${LADDER_MAX_COMBINED.toFixed(2)}.`,
      run,
    };
  }

  const combinedOdds = round2(slip.reduce((acc, leg) => acc * (leg.odds as number), 1));
  const stake = Number(run.current_pot);
  const potentialReturn = round2(stake * combinedOdds);
  const legs = slip.map(toLadderLeg);
  const stepNumber = await nextStepNumber(admin, run.id);

  // Service-role client (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS for cron writes.
  const { data, error } = await admin
    .from("ladder_steps")
    .insert({
      ladder_run_id: run.id,
      step_number: stepNumber,
      date: today,
      legs,
      combined_odds: combinedOdds,
      stake,
      potential_return: potentialReturn,
      result: "pending",
    })
    .select("*")
    .single();

  if (error) {
    // Race: another worker inserted today's step.
    const raced = await loadStepForDate(admin, run.id, today);
    if (raced) return { ok: true, created: false, run, step: raced };
    throw new Error(error.message);
  }

  const { data: updatedRun, error: runError } = await admin
    .from("ladder_runs")
    .update({ current_step: stepNumber })
    .eq("id", run.id)
    .select("*")
    .single();
  if (runError) throw new Error(runError.message);

  return {
    ok: true,
    created: true,
    run: mapRun(updatedRun ?? run),
    step: mapStep(data),
  };
}

async function ensureActiveRun(
  admin: ReturnType<typeof createAdminClient>,
): Promise<LadderRun> {
  const { data: active, error } = await admin
    .from("ladder_runs")
    .select("*")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (active) return mapRun(active);

  const { data: created, error: createError } = await admin
    .from("ladder_runs")
    .insert({
      status: "active",
      current_step: 1,
      starting_bankroll: LADDER_STARTING_BANKROLL,
      current_pot: LADDER_STARTING_BANKROLL,
      target_pot: LADDER_TARGET_POT,
    })
    .select("*")
    .single();
  if (createError) throw new Error(createError.message);
  return mapRun(created);
}

async function loadStepForDate(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  date: string,
): Promise<LadderStep | null> {
  const { data, error } = await admin
    .from("ladder_steps")
    .select("*")
    .eq("ladder_run_id", runId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapStep(data) : null;
}

async function nextStepNumber(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("ladder_steps")
    .select("step_number")
    .eq("ladder_run_id", runId)
    .order("step_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const last = data?.step_number != null ? Number(data.step_number) : 0;
  return last + 1;
}

function isLadderCandidate(prop: GeneratorProp): boolean {
  if (prop.hitRate < LADDER_MIN_HIT_RATE) return false;
  if (prop.odds == null || !Number.isFinite(prop.odds) || prop.odds <= 1) return false;
  // Singles must be able to land in-band alone; doubles can use shorter prices.
  return prop.odds < LADDER_MAX_COMBINED;
}

function pickLadderSlip(candidates: GeneratorProp[]): GeneratorProp[] | null {
  // Prefer a high-hit-rate single inside the band.
  for (const leg of candidates) {
    if (!inOddsBand(leg.odds)) continue;
    if (!validateSlipCandidate([], toLegLike(leg)).ok) continue;
    return [leg];
  }

  // Otherwise search doubles whose product sits in-band and pass SlipValidator.
  for (let i = 0; i < candidates.length; i += 1) {
    const first = candidates[i]!;
    const slip: GeneratorLegLike[] = [];
    if (!validateSlipCandidate(slip, toLegLike(first)).ok) continue;
    slip.push(toLegLike(first));

    for (let j = i + 1; j < candidates.length; j += 1) {
      const second = candidates[j]!;
      const combined = (first.odds as number) * (second.odds as number);
      if (!inOddsBand(combined)) continue;
      if (slip.length >= LADDER_MAX_LEGS) break;
      if (!validateSlipCandidate(slip, toLegLike(second)).ok) continue;
      return [first, second];
    }
  }

  return null;
}

function inOddsBand(odds: number | null | undefined) {
  if (odds == null || !Number.isFinite(odds)) return false;
  return odds >= LADDER_MIN_COMBINED && odds <= LADDER_MAX_COMBINED;
}

function toLegLike(prop: GeneratorProp): GeneratorLegLike {
  return {
    id: prop.id,
    match: prop.match,
    selection: prop.selection,
    marketType: prop.marketType,
    edgePct: prop.edgePct,
    hitRate: prop.hitRate,
    playerId: prop.playerId ?? null,
    playerName: prop.playerName ?? null,
    lineHalf: prop.lineHalf ?? null,
  };
}

function toLadderLeg(prop: GeneratorProp): LadderLeg {
  const player =
    prop.playerName?.trim() ||
    (isPlayerMarket(prop.marketType) ? parsePlayerFromSelection(prop.selection) : null);
  return {
    player,
    market: prop.marketType,
    selection: prop.selection,
    match: prop.match,
    odds: Number(prop.odds),
    hit_rate: prop.hitRate,
    player_id: prop.playerId ?? null,
  };
}

function isPlayerMarket(marketType: string) {
  return (
    marketType === "Shots on Target" ||
    marketType === "Total Shots" ||
    marketType === "To Be Carded" ||
    marketType === "Fouls Committed" ||
    marketType === "Fouls Drawn" ||
    marketType === "Tackles" ||
    marketType === "GK Saves"
  );
}

function parsePlayerFromSelection(selection: string) {
  const match = selection.match(/^(.+?)\s+(?:\d+\+|To Be Carded)/i);
  return match?.[1]?.trim() || null;
}

function mapRun(row: Record<string, unknown> | LadderRun): LadderRun {
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function londonToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
