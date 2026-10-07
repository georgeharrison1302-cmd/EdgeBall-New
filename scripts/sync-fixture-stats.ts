/**
 * Sync API-Football fixtures/statistics into public.fixture_statistics.
 *
 * Default: live matches + finished in the last 3 hours.
 * Backfill a league season (missing sheets only):
 *
 *   npm run sync:fixture-stats -- --league=39 --season=2026
 *   npm run sync:fixture-stats -- --league=39 --season=2026 --limit=80
 */
import { createIngestClient } from "../src/utils/supabase/admin";

const LIVE_STATUSES = ["1H", "HT", "2H", "ET"] as const;
const FINISHED_STATUSES = ["FT", "AET", "PEN"] as const;
const RECENT_FINISHED_MS = 3 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 220;

type ApiTeamStats = {
  team?: { id?: number | null } | null;
  statistics?: Array<{ type?: string | null; value?: string | number | null }> | Record<string, unknown> | null;
};

type StatsEnvelope = {
  response?: ApiTeamStats[];
};

type StatsRow = {
  fixture_id: number;
  team_id: number;
  statistics: Record<string, unknown>;
  updated_at: string;
};

type Args = {
  leagueId: number | null;
  season: number | null;
  limit: number | null;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const args = parseArgs(process.argv.slice(2));
  const supabase = createIngestClient();
  const fixtureIds =
    args.leagueId != null && args.season != null
      ? await missingSheetFixtureIds(supabase, args.leagueId, args.season, args.limit)
      : await targetFixtureIds(supabase);

  console.log(
    args.leagueId != null
      ? `fixture stats backfill league=${args.leagueId} season=${args.season} targets=${fixtureIds.length}`
      : `fixture stats window ${fixtureIds.length} (live + recently finished)`,
  );

  if (fixtureIds.length === 0) {
    console.log("fixture stats sync done cached=0 skipped=0");
    return;
  }

  let cached = 0;
  let skipped = 0;

  for (const [index, fixtureId] of fixtureIds.entries()) {
    try {
      const payload = await fetchFixtureStats(apiKey, fixtureId);
      const rows = (payload.response ?? [])
        .map((item) => mapStats(fixtureId, item))
        .filter((row): row is StatsRow => row != null);

      if (rows.length > 0) {
        const { error } = await supabase.from("fixture_statistics").upsert(rows, {
          onConflict: "fixture_id,team_id",
        });
        if (error) throw error;
        cached += rows.length;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: cached ${rows.length} teams`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: no stats`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`fixture stats sync done cached=${cached} skipped=${skipped}`);
}

function parseArgs(argv: string[]): Args {
  let leagueId: number | null = null;
  let season: number | null = null;
  let limit: number | null = null;
  for (const arg of argv) {
    const league = arg.match(/^--league=(\d+)$/);
    if (league) leagueId = Number(league[1]);
    const seasonMatch = arg.match(/^--season=(\d+)$/);
    if (seasonMatch) season = Number(seasonMatch[1]);
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch) limit = Number(limitMatch[1]);
  }
  return { leagueId, season, limit };
}

async function missingSheetFixtureIds(
  supabase: ReturnType<typeof createIngestClient>,
  leagueId: number,
  season: number,
  limit: number | null,
) {
  const { data, error } = await supabase
    .from("fixtures")
    .select("id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .in("status_short", [...FINISHED_STATUSES])
    .order("date", { ascending: false });
  if (error) throw error;
  const ids = (data ?? []).map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];

  const have = new Set<number>();
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    const { data: sheets, error: sheetError } = await supabase
      .from("fixture_statistics")
      .select("fixture_id")
      .in("fixture_id", chunk);
    if (sheetError) throw sheetError;
    for (const row of sheets ?? []) have.add(Number(row.fixture_id));
  }

  const missing = ids.filter((id) => !have.has(id));
  return limit != null && limit > 0 ? missing.slice(0, limit) : missing;
}

async function targetFixtureIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();

  const live = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...LIVE_STATUSES]);
  if (live.error) throw live.error;
  addIds(ids, live.data);

  const from = new Date(Date.now() - RECENT_FINISHED_MS).toISOString();
  const to = new Date().toISOString();
  const finished = await supabase
    .from("fixtures")
    .select("id")
    .in("status_short", [...FINISHED_STATUSES])
    .gte("date", from)
    .lt("date", to);
  if (finished.error) throw finished.error;
  addIds(ids, finished.data);

  return [...ids];
}

async function fetchFixtureStats(apiKey: string, fixtureId: number) {
  const url = new URL("https://v3.football.api-sports.io/fixtures/statistics");
  url.searchParams.set("fixture", String(fixtureId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as StatsEnvelope;
}

function mapStats(fixtureId: number, item: ApiTeamStats): StatsRow | null {
  const teamId = item.team?.id;
  if (!teamId) return null;

  return {
    fixture_id: fixtureId,
    team_id: teamId,
    statistics: statsObject(item.statistics),
    updated_at: new Date().toISOString(),
  };
}

function statsObject(
  raw: ApiTeamStats["statistics"],
): Record<string, unknown> {
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.flatMap((stat) => {
        const type = typeof stat?.type === "string" ? stat.type : null;
        if (!type) return [];
        return [[type, stat.value ?? null]];
      }),
    );
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function addIds(ids: Set<number>, rows: Array<{ id?: unknown }> | null) {
  for (const row of rows ?? []) {
    const id = Number(row.id);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
