import { apiFootballClient } from "../src/utils/api-football/client";
import type { ApiFootballOddsItem } from "../src/utils/api-football/endpoints";
import type { ApiFootballFixtureStatistic } from "../src/utils/api-football/endpoints";
import { createIngestClient } from "../src/utils/supabase/admin";

const STATISTICS_PROBE_PERIOD = "NULL_PROBE";
const ODDS_PROBE_VALUE = "__schema_probe__";

const STATISTICS_COLUMNS: Record<string, string> = {
  "team.id": "fixture_statistics.team_id",
  "statistics[].type": "fixture_statistics.stats key",
  "statistics[].value": "fixture_statistics.stats value",
};

const ODDS_COLUMNS: Record<string, string> = {
  "fixture.id": "odds.fixture_id",
  update: "odds.captured_at",
  "bookmakers[].id": "bookmakers.id",
  "bookmakers[].name": "bookmakers.name",
  "bookmakers[].bets[].id": "bets.id",
  "bookmakers[].bets[].name": "bets.name",
  "bookmakers[].bets[].values[].value": "odds.value",
  "bookmakers[].bets[].values[].odd": "odds.odd",
};

function compactRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined && value !== null),
  );
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectKeys(item, `${prefix}[]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...collectKeys(child, path)];
    });
  }
  return [];
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function utcInstant(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isContainerKey(key: string, keys: string[]) {
  return keys.some((other) => other.startsWith(`${key}.`) || other.startsWith(`${key}[]`));
}

function logMismatches(label: string, payload: unknown, mapped: Record<string, string>) {
  const keys = unique(collectKeys(payload));
  const unmapped = keys.filter((key) => !(key in mapped) && !isContainerKey(key, keys));
  console.log(`\n${label} key map`);
  for (const [key, column] of Object.entries(mapped)) {
    console.log(`  ${key} -> ${column}`);
  }
  console.log(unmapped.length === 0 ? "  unmapped API keys: none" : "  unmapped API keys:");
  for (const key of unmapped) console.log(`  - ${key}`);
  const responseKeys = new Set(keys);
  const missingFromResponse = Object.keys(mapped).filter((key) => !responseKeys.has(key));
  if (missingFromResponse.length > 0) {
    console.log("  mapped keys absent from this response:");
    for (const key of missingFromResponse) console.log(`  - ${key}`);
  }
}

async function main() {
  const supabase = createIngestClient();
  const { data: statRows, error: statError } = await supabase
    .from("fixture_statistics")
    .select("fixture_id")
    .order("updated_at", { ascending: false })
    .limit(3);
  if (statError) throw statError;
  const { data: oddRows, error: oddError } = await supabase
    .from("odds")
    .select("fixture_id")
    .order("captured_at", { ascending: false })
    .limit(1);
  if (oddError) throw oddError;

  const statisticsIds = unique((statRows ?? []).map((row) => String(row.fixture_id))).map(Number);
  const oddsId = oddRows?.[0]?.fixture_id as number | undefined;
  if (statisticsIds.length === 0 || oddsId == null) {
    throw new Error("Need one stored statistics fixture and one stored odds fixture");
  }

  let statistics: ApiFootballFixtureStatistic[] = [];
  let statisticsFixtureId = statisticsIds[0];
  for (const fixtureId of statisticsIds) {
    const envelope = await apiFootballClient.get<ApiFootballFixtureStatistic[]>(
      "/fixtures/statistics",
      { fixture: fixtureId },
    );
    statisticsFixtureId = fixtureId;
    statistics = envelope.response ?? [];
    console.log(
      `GET /fixtures/statistics fixture=${fixtureId} results=${envelope.results} paging=${envelope.paging?.current ?? 1}/${envelope.paging?.total ?? 1}`,
    );
    if (statistics.length > 0) break;
  }

  const oddsEnvelope = await apiFootballClient.get<ApiFootballOddsItem[]>("/odds", {
    fixture: oddsId,
    page: 1,
  });
  const oddsItem = oddsEnvelope.response?.[0];
  console.log(
    `GET /odds fixture=${oddsId} results=${oddsEnvelope.results} paging=${oddsEnvelope.paging?.current ?? 1}/${oddsEnvelope.paging?.total ?? 1}`,
  );

  logMismatches("statistics", statistics[0] ?? {}, STATISTICS_COLUMNS);
  console.log(
    "  columns with no API field: fixture_id (request), period (fixed FT), created_at, updated_at",
  );
  logMismatches("odds", oddsItem ?? {}, ODDS_COLUMNS);
  console.log("  columns with no API field: odds row has no created_at; bookmakers/bets have created_at, updated_at");

  await checkStatisticsNulls(supabase, statisticsFixtureId, statistics);
  if (oddsItem) await checkOdds(supabase, oddsId, oddsItem);
  else console.log("\nodds response was empty, so timestamp and null inserts were not run");
}

async function checkStatisticsNulls(
  supabase: ReturnType<typeof createIngestClient>,
  fixtureId: number,
  statistics: ApiFootballFixtureStatistic[],
) {
  console.log("\nstatistics null insert");
  const teamId = statistics.find((item) => item.team?.id)?.team?.id ?? null;
  const nullStats = statistics.flatMap((item) =>
    item.statistics.filter((stat) => stat.value == null).map((stat) => stat.type),
  );
  console.log(
    `  API null statistic values: ${nullStats.length === 0 ? "none in this match" : nullStats.join(", ")}`,
  );
  console.log(
    `  rows skipped for null team.id: ${statistics.filter((item) => item.team?.id == null).length}`,
  );

  if (teamId == null) {
    console.log("  insert skipped: this response has no team id");
    return;
  }

  const stats = Object.fromEntries(
    statistics[0]?.statistics.map((stat) => [stat.type ?? "unknown", stat.value]) ?? [],
  );
  stats["Null probe"] = null;

  const { error: insertError } = await supabase.from("fixture_statistics").insert({
    fixture_id: fixtureId,
    team_id: teamId,
    period: STATISTICS_PROBE_PERIOD,
    stats,
  });
  if (insertError) {
    console.log(`  insert with null jsonb values threw: ${insertError.message}`);
    return;
  }

  const { data: stored, error: readError } = await supabase
    .from("fixture_statistics")
    .select("stats")
    .eq("fixture_id", fixtureId)
    .eq("team_id", teamId)
    .eq("period", STATISTICS_PROBE_PERIOD)
    .maybeSingle();
  if (readError) throw readError;
  const storedNull = (stored?.stats as Record<string, unknown> | null)?.["Null probe"] ?? null;
  console.log(
    `  insert with null jsonb values: ok, read back ${storedNull === null ? "null" : JSON.stringify(storedNull)}`,
  );

  const { error: teamError } = await supabase.from("fixture_statistics").insert({
    fixture_id: fixtureId,
    team_id: null,
    period: STATISTICS_PROBE_PERIOD,
    stats: { "Null probe": null },
  });
  console.log(
    teamError
      ? `  direct insert of null team_id threw: ${teamError.message}`
      : "  direct insert of null team_id succeeded",
  );

  const { error: deleteError } = await supabase
    .from("fixture_statistics")
    .delete()
    .eq("fixture_id", fixtureId)
    .eq("period", STATISTICS_PROBE_PERIOD);
  if (deleteError) throw deleteError;
  console.log("  probe row removed");
}

async function checkOdds(
  supabase: ReturnType<typeof createIngestClient>,
  fixtureId: number,
  item: ApiFootballOddsItem,
) {
  console.log("\nodds timestamps");
  const { data: fixture, error: fixtureError } = await supabase
    .from("fixtures")
    .select("kickoff_at, timestamp, timezone")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureError) throw fixtureError;

  const apiDate = item.fixture.date;
  const apiUtc = utcInstant(apiDate);
  const storedUtc = utcInstant(fixture?.kickoff_at as string | null);
  console.log(`  API fixture.date: ${apiDate ?? "null"}`);
  console.log(`  API fixture.date as UTC: ${apiUtc ?? "unparseable"}`);
  console.log(`  fixtures.kickoff_at raw: ${fixture?.kickoff_at ?? "null"}`);
  console.log(`  fixtures.kickoff_at as UTC: ${storedUtc ?? "unparseable"}`);
  console.log(`  kickoff instant matches fixture.date: ${apiUtc != null && apiUtc === storedUtc}`);
  const apiUnix = item.fixture.timestamp;
  const storedUnix = fixture?.timestamp as number | null;
  console.log(`  API fixture.timestamp: ${apiUnix ?? "null"}`);
  console.log(`  fixtures.timestamp: ${storedUnix ?? "null"}`);
  console.log(`  unix timestamp matches: ${apiUnix != null && apiUnix === storedUnix}`);
  if (apiUtc && apiUnix != null) {
    console.log(`  fixture.timestamp matches fixture.date instant: ${Math.floor(new Date(apiUtc).getTime() / 1000) === apiUnix}`);
  }

  const bookmaker = item.bookmakers[0];
  const bet = bookmaker?.bets[0];
  if (!bookmaker || !bet) {
    console.log("  null insert skipped: response has no bookmaker bet");
    return;
  }

  console.log("\nodds null insert");
  const { error: bookmakerError } = await supabase.from("bookmakers").upsert(
    { id: bookmaker.id, name: bookmaker.name },
    { onConflict: "id" },
  );
  if (bookmakerError) throw bookmakerError;
  const { error: betError } = await supabase.from("bets").upsert(
    { id: bet.id, name: bet.name },
    { onConflict: "id" },
  );
  if (betError) throw betError;

  const capturedAt = item.update ?? apiDate ?? new Date().toISOString();
  const seeded = compactRow({
    fixture_id: fixtureId,
    bookmaker_id: bookmaker.id,
    market_id: bet.id,
    values: [{ value: ODDS_PROBE_VALUE, odd: 1.23 }],
    captured_at: capturedAt,
  });
  const { error: seedError } = await supabase
    .from("odds")
    .upsert(seeded, { onConflict: "fixture_id,bookmaker_id,market_id" });
  if (seedError) {
    console.log(`  seed upsert threw: ${seedError.message}`);
    return;
  }

  const cleared = compactRow({
    fixture_id: fixtureId,
    bookmaker_id: bookmaker.id,
    market_id: bet.id,
    values: [{ value: ODDS_PROBE_VALUE, odd: null }],
    captured_at: capturedAt,
  });
  console.log(`  compactRow kept the market values: ${"values" in cleared}`);
  const { error: clearError } = await supabase
    .from("odds")
    .upsert(cleared, { onConflict: "fixture_id,bookmaker_id,market_id" });
  if (clearError) {
    console.log(`  upsert after compactRow threw: ${clearError.message}`);
  }

  const { data: stored, error: readError } = await supabase
    .from("odds")
    .select("values, captured_at")
    .eq("fixture_id", fixtureId)
    .eq("bookmaker_id", bookmaker.id)
    .eq("market_id", bet.id)
    .maybeSingle();
  if (readError) throw readError;
  console.log(`  values after upsert: ${JSON.stringify(stored?.values ?? null)}`);
  console.log(`  captured_at raw: ${stored?.captured_at ?? "null"}`);
  console.log(`  captured_at as UTC: ${utcInstant(stored?.captured_at as string | null) ?? "unparseable"}`);
  console.log(
    `  captured_at matches API update instant: ${utcInstant(capturedAt) != null && utcInstant(capturedAt) === utcInstant(stored?.captured_at as string | null)}`,
  );

  const missingValue = compactRow({
    fixture_id: fixtureId,
    bookmaker_id: bookmaker.id,
    market_id: bet.id,
    values: [],
    captured_at: capturedAt,
  });
  const { error: nullValueError } = await supabase
    .from("odds")
    .upsert(missingValue, { onConflict: "fixture_id,bookmaker_id,market_id" });
  console.log(
    nullValueError
      ? `  empty values upsert threw: ${nullValueError.message}`
      : "  empty values upsert succeeded",
  );

  const { error: explicitNullError } = await supabase.from("odds").insert({
    fixture_id: fixtureId,
    bookmaker_id: bookmaker.id,
    market_id: bet.id,
    values: [{ value: `${ODDS_PROBE_VALUE}_explicit`, odd: null }],
    captured_at: capturedAt,
  });
  console.log(
    explicitNullError
      ? `  explicit null odd insert threw: ${explicitNullError.message}`
      : "  explicit null odd insert succeeded",
  );

  const { error: deleteError } = await supabase
    .from("odds")
    .delete()
    .eq("fixture_id", fixtureId)
    .eq("bookmaker_id", bookmaker.id)
    .eq("market_id", bet.id);
  if (deleteError) throw deleteError;
  console.log("  probe rows removed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
