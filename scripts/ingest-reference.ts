import {
  ingestCountries,
  ingestLeagues,
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

  const leagues = await ingestLeagues();
  console.log(`leagues: ${leagues.leagues}`);
  console.log(`league_seasons: ${leagues.seasons}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
