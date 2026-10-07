import { apiFootballGetAllPages } from "../src/utils/api-football/client";
import type { ApiFootballOddsItem } from "../src/utils/api-football/endpoints";
import { syncFixtureOdds } from "../src/utils/api-football/ingest-detail";
import { createIngestClient } from "../src/utils/supabase/admin";

const PREMIER_LEAGUE_ID = 39;
const HIGH_PROFILE = [
  "Arsenal",
  "Liverpool",
  "Manchester City",
  "Chelsea",
  "Manchester United",
  "Tottenham",
  "Newcastle",
];

type FixtureRow = {
  id: number;
  kickoff_at: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
};

function pagesCoverTotal(pages: number[], total: number) {
  if (total < 1) return false;
  if (pages.length !== total) return false;
  return pages.every((page, index) => page === index + 1);
}

async function teamNames(supabase: ReturnType<typeof createIngestClient>, ids: number[]) {
  const { data, error } = await supabase.from("teams").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((team) => [team.id as number, team.name as string]));
}

async function upcomingPremierLeague() {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, kickoff_at, home_team_id, away_team_id")
    .eq("league_id", PREMIER_LEAGUE_ID)
    .eq("status_short", "NS")
    .gte("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  const fixtures = (data ?? []) as FixtureRow[];
  const ids = fixtures.flatMap((fixture) =>
    [fixture.home_team_id, fixture.away_team_id].filter((id): id is number => id != null),
  );
  const names = await teamNames(supabase, ids);
  return fixtures
    .map((fixture) => {
      const home = names.get(fixture.home_team_id ?? -1) ?? "Home";
      const away = names.get(fixture.away_team_id ?? -1) ?? "Away";
      const profile = [home, away].some((name) => HIGH_PROFILE.includes(name));
      return { ...fixture, home, away, profile };
    })
    .sort((left, right) => Number(right.profile) - Number(left.profile));
}

async function storedKeys(supabase: ReturnType<typeof createIngestClient>, fixtureId: number) {
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("odds")
      .select("bookmaker_id, market_id, values")
      .eq("fixture_id", fixtureId)
      .order("bookmaker_id", { ascending: true })
      .order("market_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const values = Array.isArray(row.values) ? row.values : [];
      for (const price of values) {
        const value = price && typeof price === "object" && "value" in price ? String(price.value) : "";
        keys.add(`${fixtureId}:${row.bookmaker_id}:${row.market_id}:${value}`);
      }
    }
    if (!data || data.length < 1000) break;
  }
  return keys;
}

function marketCount(items: ApiFootballOddsItem[], fixtureId: number) {
  let count = 0;
  for (const item of items) {
    if (item.fixture?.id !== fixtureId) continue;
    for (const bookmaker of item.bookmakers ?? []) {
      for (const bet of bookmaker.bets ?? []) count += bet.values?.length ?? 0;
    }
  }
  return count;
}

async function checkLeaguePages(fixtureId: number) {
  const envelope = await apiFootballGetAllPages<ApiFootballOddsItem>("/odds", {
    league: PREMIER_LEAGUE_ID,
    season: 2026,
  });
  const covered = pagesCoverTotal(envelope.pagesFetched, envelope.paging.total);
  const sizeSum = envelope.pageSizes.reduce((sum, size) => sum + size, 0);
  console.log(
    `league pages ${envelope.pagesFetched.join(",")} of ${envelope.paging.total} sizes ${envelope.pageSizes.join(",")} fixtures ${envelope.response.length}`,
  );
  console.log(covered ? "league pagination 1..N covered" : "league pagination did not cover 1..N");
  console.log(
    sizeSum === envelope.response.length
      ? "page sizes sum to the combined response"
      : `page sizes sum ${sizeSum} combined ${envelope.response.length}`,
  );
  const markets = marketCount(envelope.response, fixtureId);
  console.log(`fixture ${fixtureId} markets inside the league pages: ${markets}`);
  if (!covered || sizeSum !== envelope.response.length) {
    throw new Error("Paged /odds response did not keep every page");
  }
}

async function main() {
  const fixtures = await upcomingPremierLeague();
  if (fixtures.length === 0) throw new Error("No upcoming Premier League fixture is stored");

  const supabase = createIngestClient();
  for (const fixture of fixtures.slice(0, 5)) {
    console.log(
      `fixture ${fixture.id} ${fixture.home} v ${fixture.away} ${fixture.kickoff_at ?? ""}`,
    );
    const result = await syncFixtureOdds(fixture.id);
    console.log(
      `pages ${result.pagesFetched.join(",")} of ${result.pagingTotal} sizes ${result.pageSizes.join(",")} api=${result.apiRows} stored=${result.stored} dropped=${result.dropped.length} flag=${result.flag ?? "none"}`,
    );
    if (result.flag) continue;

    const covered = pagesCoverTotal(result.pagesFetched, result.pagingTotal);
    console.log(covered ? "pagination 1..N covered" : "pagination did not cover 1..N");

    const present = await storedKeys(supabase, fixture.id);
    const missing = result.keys.filter((key) => !present.has(key));
    const explained = result.stored + result.dropped.length;
    console.log(
      `api markets ${result.apiRows} stored ${result.stored} dropped ${result.dropped.length} supabase rows ${present.size}`,
    );
    console.log(`api markets explained by stored+dropped: ${explained}`);
    if (missing.length === 0 && explained === result.apiRows && covered) {
      console.log(`match ${result.stored} API markets are in the odds table`);
      await checkLeaguePages(fixture.id);
      return;
    }
    for (const key of missing) console.log(`missing in supabase ${key}`);
    for (const drop of result.dropped) console.log(`dropped ${drop.key}: ${drop.reason}`);
    throw new Error(`Odds page check failed for fixture ${fixture.id}`);
  }

  console.log("Data Not Yet Available for the upcoming Premier League fixtures that were checked");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
