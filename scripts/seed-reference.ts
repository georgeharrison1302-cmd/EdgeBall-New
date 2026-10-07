import { ApiFootballQuotaError, isEmptyApiResponse } from "../src/utils/api-football/client";
import { getCountries, getLeagues, leagueLogoUrl } from "../src/utils/api-football/endpoints";
import { storeLeagueCatalog } from "../src/utils/api-football/ingest";
import { createIngestClient } from "../src/utils/supabase/admin";

const CHECKPOINT = "seed:countries-leagues";
const CHUNK = 100;

async function main() {
  const supabase = createIngestClient();
  const { data: checkpoint, error: checkpointError } = await supabase
    .from("ingest_checkpoints")
    .select("last_status")
    .eq("id", CHECKPOINT)
    .maybeSingle();
  if (checkpointError) throw checkpointError;
  if (String(checkpoint?.last_status ?? "").startsWith("ok")) {
    await seedCurrentCoverage();
    console.log("reference seed already stored");
    return;
  }

  console.log("fetching /countries");
  const countriesEnvelope = await getCountries();
  if (isEmptyApiResponse(countriesEnvelope)) {
    console.log("Data Not Yet Available resource=countries");
    return;
  }
  const countries = countriesEnvelope.response
    .filter((country) => country.name)
    .map((country) => ({
      name: country.name,
      code: country.code,
      flag_url: country.flag,
    }));
  console.log(`countries received ${countries.length}`);
  await upsertChunks("countries", countries, "name");

  console.log("fetching /leagues?current=true");
  const leaguesEnvelope = await getLeagues({ current: true });
  if (isEmptyApiResponse(leaguesEnvelope)) {
    console.log("Data Not Yet Available resource=leagues");
    return;
  }
  const pageTotal = leaguesEnvelope.paging?.total ?? 1;
  if (pageTotal > 1) {
    console.log(`leagues paging.total=${pageTotal}; this endpoint rejects the page parameter, so only this response is stored`);
  }
  console.log(`leagues response ${leaguesEnvelope.response.length}`);

  const leagueCountries = unique(
    leaguesEnvelope.response.flatMap((item) =>
      item.country?.name
        ? [{ name: item.country.name, code: item.country.code, flag_url: item.country.flag }]
        : [],
    ),
    (country) => country.name,
  );
  if (leagueCountries.length > 0) {
    console.log(`league countries ${leagueCountries.length}`);
    await upsertChunks("countries", leagueCountries, "name");
  }

  const leagues = unique(
    leaguesEnvelope.response.flatMap((item) => {
      if (!item.league?.id) return [];
      const current = (item.seasons ?? []).find((season) => season.current);
      return [
        {
          id: item.league.id,
          name: item.league.name,
          type: item.league.type,
          logo_url: item.league.logo ?? leagueLogoUrl(item.league.id),
          country_name: item.country?.name ?? null,
          coverage: current?.coverage ?? null,
        },
      ];
    }),
    (league) => league.id,
  );
  console.log(`leagues received ${leagues.length}`);
  await upsertChunks("leagues", leagues, "id");

  const { error } = await supabase.from("ingest_checkpoints").upsert(
    {
      id: CHECKPOINT,
      resource: "seed-reference",
      params: {},
      last_status: `ok:countries=${countries.length};leagues=${leagues.length}`,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  console.log(`seed stored countries ${countries.length} leagues ${leagues.length}`);
  await seedCurrentCoverage();
}

async function seedCurrentCoverage() {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("ingest_checkpoints")
    .select("last_status")
    .eq("id", "seed:league-coverage")
    .maybeSingle();
  if (error) throw error;
  if (String(data?.last_status ?? "").startsWith("ok")) {
    console.log("league coverage already stored");
    return;
  }
  console.log("storing coverage for /leagues?current=true");
  const envelope = await getLeagues({ current: true });
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=leagues");
    return;
  }
  const stored = await storeLeagueCatalog(envelope.response);
  const { error: markError } = await supabase.from("ingest_checkpoints").upsert(
    {
      id: "seed:league-coverage",
      resource: "seed-league-coverage",
      params: {},
      last_status: `ok:leagues=${stored.leagues};seasons=${stored.seasons}`,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (markError) throw markError;
  console.log(`coverage stored leagues ${stored.leagues} seasons ${stored.seasons}`);
}

async function upsertChunks(table: "countries" | "leagues", rows: Array<Record<string, unknown>>, onConflict: string) {
  const supabase = createIngestClient();
  let written = 0;
  for (let index = 0; index < rows.length; index += CHUNK) {
    const chunk = rows.slice(index, index + CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
    written += chunk.length;
    console.log(`${table} ${written}/${rows.length}`);
  }
}

function unique<T>(rows: T[], key: (row: T) => string | number) {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

main().catch((error: unknown) => {
  if (error instanceof ApiFootballQuotaError) {
    console.log("stopped: quota reserve");
    process.exit(0);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
