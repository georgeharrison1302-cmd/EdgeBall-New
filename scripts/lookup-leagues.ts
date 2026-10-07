import { getLeagues } from "../src/utils/api-football/endpoints";

async function main() {
  for (const term of [
    "Qualification South",
    "Qualification CONCACAF",
    "Qualification Asia",
    "Qualification Oceania",
  ]) {
    const { response } = await getLeagues({ search: term });
    console.log(`\nSEARCH ${term} (${response.length})`);
    for (const item of response.slice(0, 20)) {
      const current = item.seasons.find((season) => season.current)?.year;
      console.log(
        `${item.league.id} | ${item.league.name} | ${item.country.name} | current ${current ?? "-"}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
