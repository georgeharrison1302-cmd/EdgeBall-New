import "server-only";

import { asNumber, asRecord, isMissingRelation } from "@/utils/pyth";
import { normalizeReferee } from "@/utils/stats/referee-name";
import { createIngestClient } from "@/utils/supabase/admin";

export { normalizeReferee } from "@/utils/stats/referee-name";

export type StrictRef = {
  name: string;
  avg: number;
  matches: number;
  vsLeaguePct: number | null;
};

const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export function fixtureStatNumber(stats: unknown, key: string) {
  const record = asRecord(stats);
  if (record) {
    const direct = asNumber(record[key]);
    if (direct != null) return direct;
    const nested = asRecord(record[key]);
    if (nested) return asNumber(nested.total ?? nested.value);
  }
  if (Array.isArray(stats)) {
    for (const item of stats) {
      const row = asRecord(item);
      if (!row) continue;
      if (String(row.type ?? "") === key) return asNumber(row.value);
    }
  }
  return null;
}

export function fixtureYellows(stats: unknown) {
  return fixtureStatNumber(stats, "Yellow Cards") ?? fixtureStatNumber(stats, "yellow cards");
}

export async function loadRefereeRates(
  names: string[],
  scope: { leagueId?: number; season?: number } = {},
) {
  const map = new Map<string, StrictRef>();
  const wanted = [...new Set(names.map(normalizeReferee).filter((name): name is string => name != null))];
  if (wanted.length === 0) return map;
  const supabase = createIngestClient();
  // Stored API-Football values include a country suffix ("Name, England").
  // Query the scoped referee pool, then compare normalized names in memory;
  // exact `.in(referee, wanted)` silently misses those rows.
  let query = supabase
    .from("fixtures")
    .select("id, referee, status_short, date")
    .not("referee", "is", null)
    .in("status_short", [...FINISHED])
    .order("date", { ascending: false });
  if (scope.leagueId != null) query = query.eq("league_id", scope.leagueId);
  if (scope.season != null) query = query.eq("season", scope.season);
  const { data: fixtures, error } = await query.limit(2000);
  if (error) {
    if (isMissingRelation(error)) return map;
    throw error;
  }
  const wantedSet = new Set(wanted.map((name) => name.toLowerCase()));
  const rows = (fixtures ?? []).filter((fixture) => {
    const name = normalizeReferee(fixture.referee);
    return name != null && wantedSet.has(name.toLowerCase());
  });
  if (rows.length === 0) return map;
  const ids = rows.map((row) => Number(row.id));
  const yellowsByFixture = new Map<number, number>();
  for (let index = 0; index < ids.length; index += 200) {
    const { data: stats, error: statsError } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, statistics")
      .in("fixture_id", ids.slice(index, index + 200));
    if (statsError) {
      if (isMissingRelation(statsError) || /column .* does not exist/i.test(statsError.message)) return map;
      throw statsError;
    }
    for (const row of stats ?? []) {
      const yellows = fixtureYellows(row.statistics);
      if (yellows == null) continue;
      const fixtureId = Number(row.fixture_id);
      yellowsByFixture.set(fixtureId, (yellowsByFixture.get(fixtureId) ?? 0) + yellows);
    }
  }
  if (yellowsByFixture.size === 0) return map;

  const buckets = new Map<string, { sum: number; n: number }>();
  let leagueSum = 0;
  let leagueN = 0;
  for (const fixture of rows) {
    const yellows = yellowsByFixture.get(Number(fixture.id));
    const name = normalizeReferee(fixture.referee);
    if (yellows == null || !name) continue;
    const bucket = buckets.get(name) ?? { sum: 0, n: 0 };
    bucket.sum += yellows;
    bucket.n += 1;
    buckets.set(name, bucket);
    leagueSum += yellows;
    leagueN += 1;
  }
  const leagueAvg = leagueN > 0 ? leagueSum / leagueN : null;
  for (const [name, bucket] of buckets) {
    if (bucket.n <= 0) continue;
    const avg = bucket.sum / bucket.n;
    map.set(name.toLowerCase(), {
      name,
      avg: Number(avg.toFixed(1)),
      matches: bucket.n,
      vsLeaguePct: leagueAvg && leagueAvg > 0 ? Number((((avg - leagueAvg) / leagueAvg) * 100).toFixed(0)) : null,
    });
  }
  return map;
}

export function lookupReferee(map: Map<string, StrictRef>, name: string | null | undefined) {
  const key = normalizeReferee(name);
  return key ? map.get(key.toLowerCase()) ?? null : null;
}
