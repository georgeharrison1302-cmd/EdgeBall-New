import {
  ingestCountries,
  ingestSeasons,
  ingestTargetCompetitions,
  ingestTimezones,
} from "../src/utils/api-football/ingest";

async function main() {
  try {
    const timezones = await ingestTimezones();
    console.log(`timezones: ${timezones.count}`);
  } catch (error) {
    console.error("timezones failed:", error instanceof Error ? error.message : error);
  }

  const countries = await ingestCountries();
  console.log(`countries: ${countries.count}`);

  try {
    const seasons = await ingestSeasons();
    console.log(`seasons: ${seasons.count}`);
  } catch (error) {
    console.error("seasons failed:", error instanceof Error ? error.message : error);
  }

  const result = await ingestTargetCompetitions();
  console.log(`matched: ${result.matched.length}`);
  for (const league of result.matched) {
    console.log(
      `- ${league.requested} -> ${league.id} ${league.name} (${league.country}) season ${league.season}`,
    );
  }
  if (result.missing.length > 0) {
    console.log("missing:");
    for (const item of result.missing) {
      console.log(`- ${item.requested} (${item.country})`);
    }
  }
  for (const item of result.teams) {
    console.log(`teams ${item.requested} ${item.season}: ${item.teams}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
