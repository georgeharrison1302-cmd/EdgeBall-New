import "server-only";
import { createIngestClient } from "@/utils/supabase/admin";

/** The 4-digit starting year for the league season marked current. */
export async function getActiveSeasonYear(leagueId: number): Promise<number | null> {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return null;
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("league_seasons")
    .select("year, is_current")
    .eq("league_id", leagueId)
    .order("year", { ascending: false });
  if (error) {
    if (/42703|does not exist|schema cache/i.test(error.message ?? "") || error.code === "42703" || error.code === "PGRST204") {
      const { data: years, error: yearError } = await supabase
        .from("league_seasons")
        .select("year")
        .eq("league_id", leagueId)
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (yearError) throw yearError;
      const year = Number(years?.year);
      return Number.isInteger(year) ? year : null;
    }
    throw error;
  }
  const rows = (data ?? []) as Array<{ year: number | null; is_current: boolean | null }>;
  const current = rows
    .filter((row) => row.is_current === true)
    .map((row) => Number(row.year))
    .filter((year) => Number.isInteger(year));
  if (current.length > 0) return current.sort((left, right) => right - left)[0] ?? null;
  const latest = Number(rows[0]?.year);
  return Number.isInteger(latest) ? latest : null;
}

/** A 4-digit starting year. "2026/2027" becomes 2026. "26/27" is not a year. */
export function seasonStartingYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1000 && value <= 9999) return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})(?:\/\d{2,4})?$/);
  return match ? Number(match[1]) : null;
}
