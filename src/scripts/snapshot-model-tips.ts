/**
 * Freeze generated model tips into the model_tips ledger.
 *
 *   npm run sync:model-tips
 *
 * Insert-only: existing tip_keys are never overwritten, so odds, model
 * probability, edge and generated_at stay point-in-time forever. Settlement
 * is the only later mutation (grade:model-tips writes status/profit once a
 * fixture finishes).
 */
import { collectLiveTips } from "@/app/tracker/model-grading-load";
import { createIngestClient } from "@/utils/supabase/admin";

const CHUNK = 200;

async function main() {
  const supabase = createIngestClient();
  const tips = await collectLiveTips(supabase);
  if (tips.length === 0) {
    console.log("model tips snapshot: 0 generated");
    return;
  }

  const rows = tips.map((tip) => ({
    tip_key: tip.id,
    fixture_id: tip.fixtureId,
    market: tip.market,
    selection: tip.selection,
    player_id: tip.playerId ?? null,
    outcome: tip.outcome ?? null,
    odds: tip.odds,
    model_prob: tip.modelProb,
    edge_pct: tip.edgePct,
    source: tip.source,
    kickoff: tip.kickoff,
    status: tip.status,
    profit: tip.profit,
    settled_at: tip.status === "pending" ? null : new Date().toISOString(),
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("model_tips")
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: "tip_key",
        ignoreDuplicates: true,
      })
      .select("tip_key");
    if (error) throw error;
    inserted += data?.length ?? 0;
  }

  console.log(`model tips snapshot: ${inserted} new / ${rows.length} generated`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
