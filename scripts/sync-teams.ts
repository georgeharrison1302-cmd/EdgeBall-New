import { ApiFootballQuotaError, isEmptyApiResponse } from "../src/utils/api-football/client";
import { getTeams, teamLogoUrl, type ApiFootballTeamItem } from "../src/utils/api-football/endpoints";
import { getActiveSeasonYear } from "../src/utils/api-football/season";
import { createIngestClient } from "../src/utils/supabase/admin";

const CHUNK = 200;

async function main() {
  const supabase = createIngestClient();
  const list = await activeLeagues();
  console.log(`active leagues ${list.length}`);

  let fetched = 0;
  let linked = 0;
  let skipped = 0;

  for (let index = 0; index < list.length; index += 1) {
    const league = list[index];
    const leagueId = Number(league.id);
    const year = await getActiveSeasonYear(leagueId);
    if (year == null) {
      console.log(`no current season league=${leagueId}`);
      continue;
    }

    const checkpointId = `teams:${leagueId}:${year}`;
    const { data: checkpoint, error: checkpointError } = await supabase
      .from("ingest_checkpoints")
      .select("last_status")
      .eq("id", checkpointId)
      .maybeSingle();
    if (checkpointError) throw checkpointError;
    if (String(checkpoint?.last_status ?? "").startsWith("ok")) {
      skipped += 1;
      continue;
    }

    const { data: storedTeams, error: storedError } = await supabase
      .from("team_seasons")
      .select("team_id")
      .eq("league_id", leagueId)
      .eq("season", year);
    if (storedError) throw storedError;
    if (storedTeams && storedTeams.length > 0) {
      const teamIds = storedTeams.map((row) => Number(row.team_id));
      await linkLeagueTeams(leagueId, teamIds);
      await markOk(checkpointId, leagueId, year, `ok:linked=${teamIds.length}`);
      linked += 1;
      console.log(`teams ${league.name} ${year} linked ${teamIds.length}`);
      continue;
    }

    try {
      const envelope = await getTeams({ league: leagueId, season: year });
      if (isEmptyApiResponse(envelope)) {
        console.log(`Data Not Yet Available resource=teams league=${leagueId} season=${year}`);
        await markOk(checkpointId, leagueId, year, "ok:0");
        continue;
      }
      const saved = await persistTeams(leagueId, envelope.response);
      await markOk(checkpointId, leagueId, year, `ok:teams=${saved.teams};venues=${saved.venues}`);
      fetched += 1;
      console.log(`teams ${league.name} ${year}: ${saved.teams}`);
    } catch (cause) {
      if (cause instanceof ApiFootballQuotaError) {
        console.log("stopped before the daily quota reserve");
        break;
      }
      console.log(`teams league=${leagueId} season=${year} failed ${cause instanceof Error ? cause.message : cause}`);
    }

    if ((index + 1) % 25 === 0) console.log(`teams progress ${index + 1}/${list.length}`);
  }

  console.log(`teams sync done fetched=${fetched} linked=${linked} skipped=${skipped}`);
}

async function persistTeams(leagueId: number, items: ApiFootballTeamItem[]) {
  const venues = new Map<number, Record<string, unknown>>();
  const teams = new Map<number, Record<string, unknown>>();

  for (const item of items) {
    if (!item.team?.id || !item.team.name) continue;
    const venueId = item.venue?.id && item.venue.id > 0 ? item.venue.id : null;
    if (venueId) {
      venues.set(venueId, {
        id: venueId,
        name: item.venue?.name ?? null,
        address: item.venue?.address ?? null,
        city: item.venue?.city ?? null,
        country_name: item.venue?.country ?? item.team.country ?? null,
        capacity: item.venue?.capacity ?? null,
        surface: item.venue?.surface ?? null,
        image_url: item.venue?.image ?? null,
      });
    }
    teams.set(item.team.id, {
      id: item.team.id,
      name: item.team.name,
      code: item.team.code,
      country_name: item.team.country,
      founded: item.team.founded,
      national: item.team.national,
      logo_url: item.team.logo ?? teamLogoUrl(item.team.id),
      venue_id: venueId,
    });
  }

  await upsertChunks("venues", [...venues.values()], "id");
  await upsertChunks("teams", [...teams.values()], "id");
  await linkLeagueTeams(leagueId, [...teams.keys()]);
  return { teams: teams.size, venues: venues.size };
}

async function linkLeagueTeams(leagueId: number, teamIds: number[]) {
  const rows = [...new Set(teamIds.filter((id) => Number.isInteger(id) && id > 0))].map((teamId) => ({
    league_id: leagueId,
    team_id: teamId,
  }));
  await upsertChunks("league_teams", rows, "league_id,team_id");
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (rows.length === 0) return;
  const supabase = createIngestClient();
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + CHUNK), { onConflict });
    if (error) throw error;
  }
}

async function markOk(id: string, leagueId: number, season: number, lastStatus: string) {
  const supabase = createIngestClient();
  const { error } = await supabase.from("ingest_checkpoints").upsert(
    {
      id,
      resource: "teams",
      params: { leagueId, season },
      last_status: lastStatus,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function activeLeagues() {
  const supabase = createIngestClient();
  const rows: { id: number; name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("leagues").select("id, name").order("id").range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) rows.push({ id: Number(row.id), name: String(row.name) });
    if (!data || data.length < 1000) break;
  }
  return rows;
}
