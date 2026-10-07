import { authorizeCron } from "@/utils/api/cron-auth";
import { createIngestClient } from "@/utils/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ApiTeamItem = {
  team?: {
    id: number;
    name: string;
    code: string | null;
    country: string | null;
    founded: number | null;
    national: boolean | null;
    logo: string | null;
  };
  venue?: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    country?: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  } | null;
};

type TeamsEnvelope = {
  errors?: unknown;
  results?: number;
  response?: ApiTeamItem[];
};

type LeagueTarget = {
  id: number;
  country_name: string | null;
  season: number;
};

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) {
      throw new Error("Missing API_FOOTBALL_KEY");
    }

    const supabase = createIngestClient();
    const leagueId = optionalInt(request.nextUrl.searchParams.get("league"));
    const season = optionalInt(request.nextUrl.searchParams.get("season"));
    const country = request.nextUrl.searchParams.get("country")?.trim() || null;

    const targets = await leagueTargets(supabase, {
      leagueId,
      season,
      country,
    });

    if (targets.length === 0) {
      throw new Error("No cached leagues/seasons to sync teams for");
    }

    const perLeague: Array<{
      league: number;
      season: number;
      country: string | null;
      teams: number;
    }> = [];
    const venues: Array<{
      id: number;
      name: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
      capacity: number | null;
      surface: string | null;
      image: string | null;
    }> = [];
    const teams: Array<{
      id: number;
      name: string;
      code: string | null;
      country: string | null;
      founded: number | null;
      national: boolean | null;
      logo: string | null;
      venue_id: number | null;
    }> = [];
    const teamSeasons: Array<{
      team_id: number;
      league_id: number;
      season: number;
    }> = [];
    const seenVenues = new Set<number>();
    const seenTeams = new Set<number>();

    for (const [index, target] of targets.entries()) {
      if (index > 0) {
        await sleep(250);
      }

      const items = await fetchTeams(apiKey, target);
      perLeague.push({
        league: target.id,
        season: target.season,
        country: target.country_name,
        teams: items.length,
      });

      for (const item of items) {
        const team = item.team;
        if (!team?.id || !team.name) continue;

        if (item.venue?.id && !seenVenues.has(item.venue.id)) {
          seenVenues.add(item.venue.id);
          venues.push({
            id: item.venue.id,
            name: item.venue.name,
            address: item.venue.address,
            city: item.venue.city,
            country: item.venue.country ?? team.country ?? null,
            capacity: item.venue.capacity,
            surface: item.venue.surface,
            image: item.venue.image,
          });
        }

        if (!seenTeams.has(team.id)) {
          seenTeams.add(team.id);
          teams.push({
            id: team.id,
            name: team.name,
            code: team.code,
            country: team.country,
            founded: team.founded,
            national: team.national,
            logo: team.logo,
            venue_id: item.venue?.id ?? null,
          });
        }

        teamSeasons.push({
          team_id: team.id,
          league_id: target.id,
          season: target.season,
        });
      }
    }

    for (const chunk of chunkRows(venues, 500)) {
      const { error } = await supabase.from("venues").upsert(chunk);
      if (error) throw error;
    }

    for (const chunk of chunkRows(teams, 500)) {
      const { error } = await supabase.from("teams").upsert(chunk);
      if (error) throw error;
    }

    for (const chunk of chunkRows(teamSeasons, 500)) {
      const { error } = await supabase.from("team_seasons").upsert(chunk);
      if (error) throw error;
    }

    return NextResponse.json({
      status: "success",
      leagues: perLeague,
      total_cached: teams.length,
      seasons_cached: teamSeasons.length,
    });
  } catch (error) {
    console.error(error);
    const err = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return NextResponse.json(
      {
        status: "error",
        message: err.message ?? "Unknown error",
        details: err.details ?? String(error),
        hint: err.hint,
        code: err.code,
      },
      { status: 500 },
    );
  }
}

async function leagueTargets(
  supabase: ReturnType<typeof createIngestClient>,
  filters: {
    leagueId: number | null;
    season: number | null;
    country: string | null;
  },
) {
  let query = supabase
    .from("leagues")
    .select("id, country_name, league_seasons!inner(year, current)")
    .eq("league_seasons.current", true);

  if (filters.leagueId != null) {
    query = query.eq("id", filters.leagueId);
  }
  if (filters.country) {
    query = query.ilike("country_name", filters.country);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const seasons = Array.isArray(row.league_seasons)
        ? row.league_seasons
        : row.league_seasons
          ? [row.league_seasons]
          : [];
      const current = seasons.find((item) => item.current) ?? seasons[0];
      if (!current) return null;
      return {
        id: row.id as number,
        country_name: (row.country_name as string | null) ?? null,
        season: filters.season ?? (current.year as number),
      } satisfies LeagueTarget;
    })
    .filter((row): row is LeagueTarget => row != null);
}

async function fetchTeams(apiKey: string, target: LeagueTarget) {
  const url = new URL("https://v3.football.api-sports.io/teams");
  url.searchParams.set("league", String(target.id));
  url.searchParams.set("season", String(target.season));
  if (target.country_name && target.country_name !== "World") {
    url.searchParams.set("country", target.country_name);
  }

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `API-Football ${response.status} league=${target.id} season=${target.season}`,
    );
  }

  const payload = (await response.json()) as TeamsEnvelope;
  return payload.response ?? [];
}

function optionalInt(value: string | null) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
