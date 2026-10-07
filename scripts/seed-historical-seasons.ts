import { isEmptyApiResponse } from "../src/utils/api-football/client";
import { getSeasons } from "../src/utils/api-football/endpoints";
import { createIngestClient } from "../src/utils/supabase/admin";

const KEY = "historical_seasons";

async function main() {
  const supabase = createIngestClient();
  const { data: existing, error: existingError } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  if (existingError) throw existingError;
  if (Array.isArray(existing?.value) && existing.value.length > 0) {
    console.log(`historical seasons already stored ${existing.value.length}`);
    return;
  }

  const { data: stored, error: storedError } = await supabase.from("seasons").select("year").order("year");
  if (storedError) throw storedError;
  const storedYears = (stored ?? [])
    .map((row) => Number(row.year))
    .filter((year) => Number.isInteger(year));
  if (storedYears.length > 0) {
    await save(storedYears);
    console.log(`historical seasons stored ${storedYears.length} from the seasons table`);
    return;
  }

  console.log("fetching /leagues/seasons");
  const envelope = await getSeasons();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=seasons");
    return;
  }
  const years = envelope.response.filter((year) => Number.isInteger(year)).sort((left, right) => left - right);
  if (years.length === 0) {
    console.log("Data Not Yet Available resource=seasons");
    return;
  }
  await save(years);
  const { error } = await supabase.from("seasons").upsert(
    years.map((year) => ({ year })),
    { onConflict: "year" },
  );
  if (error) throw error;
  console.log(`historical seasons stored ${years.length}`);
}

async function save(years: number[]) {
  const supabase = createIngestClient();
  const { error } = await supabase.from("app_config").upsert(
    { key: KEY, value: years },
    { onConflict: "key" },
  );
  if (error) throw error;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
