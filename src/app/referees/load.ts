import "server-only";

import { normalizeReferee } from "@/utils/stats/referee-name";
import { fixtureStatNumber } from "@/utils/stats/referees";
import { createIngestClient } from "@/utils/supabase/admin";

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"] as const;
const FIXTURE_LIMIT = 3000;
const MIN_MATCHES = 3;

export type RefereeDeskRow = {
  name: string;
  matches: number;
  avgYellows: number;
  avgReds: number;
  avgCards: number;
  avgFouls: number;
  over35Rate: number | null;
  over45Rate: number | null;
  vsAvgPct: number | null;
  strictness: "strict" | "average" | "lenient";
};

export type RefereeDeskLeague = {
  id: number;
  name: string;
};

export type RefereeDeskData = {
  rows: RefereeDeskRow[];
  leagues: RefereeDeskLeague[];
  selectedLeague: number | null;
  fixturePool: number;
  avgCards: number | null;
  smallSampleCount: number;
};

function statNumber(stats: unknown, key: string): number | null {
  return fixtureStatNumber(stats, key);
}

export async function loadRefereeDesk(leagueId?: number): Promise<RefereeDeskData> {
  const supabase = createIngestClient();

  let fixtureQuery = supabase
    .from("fixtures")
    .select("id, referee, league_id")
    .not("referee", "is", null)
    .in("status_short", [...FINISHED])
    .order("date", { ascending: false })
    .limit(FIXTURE_LIMIT);
  if (leagueId != null) fixtureQuery = fixtureQuery.eq("league_id", leagueId);
  const { data: fixtures, error } = await fixtureQuery;
  if (error) throw error;

  const rows = fixtures ?? [];
  const fixtureIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id));

  const totals = new Map<number, { yellows: number; reds: number; fouls: number }>();
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const { data: stats, error: statsError } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, statistics")
      .in("fixture_id", fixtureIds.slice(i, i + 200));
    if (statsError) throw statsError;
    for (const row of stats ?? []) {
      const fixtureId = Number(row.fixture_id);
      const bucket = totals.get(fixtureId) ?? { yellows: 0, reds: 0, fouls: 0 };
      bucket.yellows += statNumber(row.statistics, "Yellow Cards") ?? 0;
      bucket.reds += statNumber(row.statistics, "Red Cards") ?? 0;
      bucket.fouls += statNumber(row.statistics, "Fouls") ?? 0;
      totals.set(fixtureId, bucket);
    }
  }

  type Bucket = {
    matches: number;
    yellows: number;
    reds: number;
    fouls: number;
    over35: number;
    over45: number;
    withStats: number;
  };
  const buckets = new Map<string, Bucket>();
  let totalCards = 0;
  let totalWithStats = 0;
  for (const fixture of rows) {
    const name = normalizeReferee(fixture.referee);
    if (!name) continue;
    const bucket = buckets.get(name) ?? {
      matches: 0,
      yellows: 0,
      reds: 0,
      fouls: 0,
      over35: 0,
      over45: 0,
      withStats: 0,
    };
    bucket.matches += 1;
    const t = totals.get(Number(fixture.id));
    if (t) {
      bucket.yellows += t.yellows;
      bucket.reds += t.reds;
      bucket.fouls += t.fouls;
      const cards = t.yellows + t.reds;
      bucket.withStats += 1;
      totalCards += cards;
      totalWithStats += 1;
      if (cards > 3.5) bucket.over35 += 1;
      if (cards > 4.5) bucket.over45 += 1;
    }
    buckets.set(name, bucket);
  }

  const avgCards = totalWithStats > 0 ? totalCards / totalWithStats : null;

  let smallSampleCount = 0;
  const deskRows: RefereeDeskRow[] = [];
  for (const [name, bucket] of buckets) {
    if (bucket.withStats < MIN_MATCHES) {
      smallSampleCount += 1;
      continue;
    }
    const avgYellows = bucket.yellows / bucket.withStats;
    const avgReds = bucket.reds / bucket.withStats;
    const avgCardsForRef = avgYellows + avgReds;
    const vsAvgPct =
      avgCards != null && avgCards > 0
        ? Math.round(((avgCardsForRef - avgCards) / avgCards) * 100)
        : null;
    deskRows.push({
      name,
      matches: bucket.withStats,
      avgYellows: Number(avgYellows.toFixed(2)),
      avgReds: Number(avgReds.toFixed(2)),
      avgCards: Number(avgCardsForRef.toFixed(2)),
      avgFouls: Number((bucket.fouls / bucket.withStats).toFixed(1)),
      over35Rate: Number(((bucket.over35 / bucket.withStats) * 100).toFixed(0)),
      over45Rate: Number(((bucket.over45 / bucket.withStats) * 100).toFixed(0)),
      vsAvgPct,
      strictness:
        vsAvgPct == null ? "average" : vsAvgPct >= 15 ? "strict" : vsAvgPct <= -15 ? "lenient" : "average",
    });
  }
  deskRows.sort((a, b) => b.matches - a.matches || b.avgCards - a.avgCards);

  const leagueIds = [
    ...new Set(rows.map((row) => Number(row.league_id)).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  const { data: leagueRows } =
    leagueIds.length > 0
      ? await supabase.from("leagues").select("id, name").in("id", leagueIds)
      : { data: [] };
  const leagues = (leagueRows ?? [])
    .map((row) => ({ id: Number(row.id), name: String(row.name ?? "") }))
    .filter((row) => row.id > 0 && row.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows: deskRows,
    leagues,
    selectedLeague: leagueId ?? null,
    fixturePool: rows.length,
    avgCards: avgCards != null ? Number(avgCards.toFixed(2)) : null,
    smallSampleCount,
  };
}
