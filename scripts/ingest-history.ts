import { TARGET_SEASON_DEPTH } from "../src/utils/api-football/competitions";
import { ingestTargetHistory } from "../src/utils/api-football/ingest";
import { ApiFootballError } from "../src/utils/api-football/client";

async function main() {
  const result = await ingestTargetHistory();
  const byLeague = new Map<
    number,
    {
      name: string;
      country: string | null;
      seasons: number[];
      teams: number;
      fixtures: number;
      standings: number;
    }
  >();

  for (const item of result.teams) {
    const row = byLeague.get(item.leagueId) ?? {
      name: item.name,
      country: item.country,
      seasons: [],
      teams: 0,
      fixtures: 0,
      standings: 0,
    };
    row.seasons.push(item.season);
    row.teams += item.teams;
    byLeague.set(item.leagueId, row);
  }
  for (const item of result.fixtures) {
    const row = byLeague.get(item.leagueId);
    if (row) row.fixtures += item.fixtures;
  }
  for (const item of result.standings) {
    const row = byLeague.get(item.leagueId);
    if (row) row.standings += item.standings;
  }

  for (const [leagueId, item] of [...byLeague.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    const seasons = [...new Set(item.seasons)].sort((left, right) => left - right);
    console.log(
      `${leagueId} ${item.name} (${item.country ?? "?"}): ${seasons.join(",")} | teams ${item.teams} | fixtures ${item.fixtures} | standings ${item.standings}`,
    );
  }

  console.log(`leagues: ${byLeague.size}`);
  console.log(`season depth: ${TARGET_SEASON_DEPTH}`);
  console.log(`team-seasons: ${result.teams.length}`);
  console.log(`fixture-seasons: ${result.fixtures.length}`);
  console.log(`standing-seasons: ${result.standings.length}`);

  if (result.skipped.length > 0) {
    console.log("skipped standings:");
    for (const item of result.skipped) {
      console.log(`- ${item.leagueId} ${item.name} ${item.season}: ${item.reason}`);
    }
  }

  if (result.failed.length > 0) {
    console.log("failed:");
    for (const item of result.failed) {
      console.log(
        `- ${item.leagueId} ${item.name} ${item.season} ${item.stage}: ${item.error}`,
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  if (error instanceof ApiFootballError) {
    console.error(error.message, error.body ?? "");
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
