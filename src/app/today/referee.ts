import "server-only";

import { loadRefereeRates, normalizeReferee } from "@/utils/stats/referees";
import { createAdminClient } from "@/utils/supabase/admin";

const CARD_LINE = 5.5;
const MIN_GAMES = 10;

/** Fixture → avg yellows when referee clears the card line (from fixture_statistics). */
export async function loadRefereeCards(fixtureIds: number[]) {
  const flags = new Map<number, number | null>();
  for (const id of fixtureIds) flags.set(id, null);
  if (fixtureIds.length === 0) return flags;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("fixtures").select("id, referee").in("id", fixtureIds);
  if (error) throw error;

  const assigned = (data ?? []).flatMap((row) => {
    const referee = normalizeReferee(row.referee);
    return referee ? [{ id: row.id, referee }] : [];
  });
  const names = [...new Set(assigned.map((row) => row.referee))];
  if (names.length === 0) return flags;

  const rates = await loadRefereeRates(names);
  for (const row of assigned) {
    const summary = rates.get(row.referee);
    if (!summary || summary.matches < MIN_GAMES) continue;
    if (summary.avg >= CARD_LINE) flags.set(row.id, summary.avg);
  }
  return flags;
}
