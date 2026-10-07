import { authorizeCron } from "@/utils/api/cron-auth";
import { generateNextLadderStep } from "@/lib/ladder/engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Secure cron entry — requires `Authorization: Bearer ${CRON_SECRET}`
 * or `x-cron-secret: ${CRON_SECRET}`.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await generateNextLadderStep();
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: result.reason,
          runId: result.run?.id ?? null,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      created: result.created,
      runId: result.run.id,
      stepId: result.step.id,
      stepNumber: result.step.step_number,
      combinedOdds: result.step.combined_odds,
      stake: result.step.stake,
      potentialReturn: result.step.potential_return,
      legs: result.step.legs,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "ladder cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
