import { authorizeCron } from "@/utils/api/cron-auth";
import { createIngestClient } from "@/utils/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ApiLeagueItem = {
  league?: {
    id: number;
    name: string;
    type: string | null;
    logo: string | null;
  };
  country?: {
    name: string | null;
    code: string | null;
    flag: string | null;
  };
  seasons?: Array<{
    year: number;
    start: string | null;
    end: string | null;
    current: boolean;
    coverage: unknown;
  }>;
};

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) {
      throw new Error("Missing API_FOOTBALL_KEY");
    }

    const leagueId = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      throw new Error("Missing or invalid league id");
    }

    const response = await fetch(
      `https://v3.football.api-sports.io/leagues?id=${leagueId}`,
      {
        headers: {
          "x-apisports-key": apiKey,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`API-Football ${response.status}`);
    }

    const payload = (await response.json()) as { response?: ApiLeagueItem[] };
    const items = payload.response ?? [];

    const leagues = items
      .filter((item) => item.league?.id && item.league.name)
      .map((item) => ({
        id: item.league!.id,
        name: item.league!.name,
        type: item.league!.type,
        logo: item.league!.logo,
        country_name: item.country?.name ?? null,
        country_code: item.country?.code ?? null,
        country_flag: item.country?.flag ?? null,
      }));

    const leagueSeasons = items.flatMap((item) =>
      (item.seasons ?? [])
        .filter((season) => item.league?.id && Number.isInteger(season.year))
        .map((season) => ({
          league_id: item.league!.id,
          year: season.year,
          start: season.start || null,
          end: season.end || null,
          current: season.current,
          coverage: season.coverage ?? null,
        })),
    );

    const supabase = createIngestClient();

    const { error: leaguesError } = await supabase
      .from("leagues")
      .upsert(leagues);
    if (leaguesError) {
      throw leaguesError;
    }

    const { error: seasonsError } = await supabase
      .from("league_seasons")
      .upsert(leagueSeasons);
    if (seasonsError) {
      throw seasonsError;
    }

    return NextResponse.json({
      status: "success",
      id: leagueId,
      total_cached: leagues.length,
      seasons_cached: leagueSeasons.length,
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
