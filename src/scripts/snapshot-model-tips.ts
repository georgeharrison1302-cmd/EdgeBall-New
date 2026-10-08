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

  const keys = rows.map((row) => row.tip_key);
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("model_tips")
      .select("tip_key")
      .in("tip_key", keys.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data ?? []) existing.add(String(row.tip_key));
  }
  const fresh = rows.filter((row) => !existing.has(row.tip_key));
  if (fresh.length === 0) {
    console.log(`model tips snapshot: 0 new / ${rows.length} generated`);
    return;
  }
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const { error } = await supabase.from("model_tips").insert(fresh.slice(i, i + CHUNK));
    if (error) throw error;
  }

  console.log(`model tips snapshot: ${fresh.length} new / ${rows.length} generated`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
