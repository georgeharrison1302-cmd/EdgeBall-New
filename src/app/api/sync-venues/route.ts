import { authorizeCron } from "@/utils/api/cron-auth";
import { createIngestClient } from "@/utils/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ApiVenue = {
  id: number;
  name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
  surface: string | null;
  image: string | null;
};

type VenuesEnvelope = {
  errors?: unknown;
  results?: number;
  paging?: { current?: number; total?: number };
  response?: ApiVenue[];
};

const SKIP_COUNTRIES = new Set(["World"]);

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) {
      throw new Error("Missing API_FOOTBALL_KEY");
    }

    const supabase = createIngestClient();
    const requested = request.nextUrl.searchParams.get("country")?.trim();
    const countries = requested
      ? [requested]
      : await leagueCountries(supabase);

    if (countries.length === 0) {
      throw new Error("No league countries to sync venues for");
    }

    const perCountry: Array<{ country: string; venues: number }> = [];
    const mapped: Array<{
      id: number;
      name: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
      capacity: number | null;
      surface: string | null;
      image: string | null;
    }> = [];
    const seen = new Set<number>();

    for (const [index, country] of countries.entries()) {
      if (index > 0) {
        await sleep(250);
      }

      const venues = await fetchVenuesForCountry(country, apiKey);
      perCountry.push({ country, venues: venues.length });

      for (const venue of venues) {
        if (!venue.id || seen.has(venue.id)) continue;
        seen.add(venue.id);
        mapped.push({
          id: venue.id,
          name: venue.name,
          address: venue.address,
          city: venue.city,
          country: venue.country,
          capacity: venue.capacity,
          surface: venue.surface,
          image: venue.image,
        });
      }
    }

    for (const chunk of chunkRows(mapped, 500)) {
      const { error } = await supabase.from("venues").upsert(chunk);
      if (error) {
        throw error;
      }
    }

    return NextResponse.json({
      status: "success",
      countries: perCountry,
      total_cached: mapped.length,
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

async function leagueCountries(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const { data, error } = await supabase
    .from("leagues")
    .select("country_name")
    .not("country_name", "is", null);

  if (error) {
    throw error;
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.country_name)
        .filter(
          (name): name is string =>
            typeof name === "string" &&
            name.trim() !== "" &&
            !SKIP_COUNTRIES.has(name),
        ),
    ),
  ].sort();
}

async function fetchVenuesForCountry(country: string, apiKey: string) {
  const url = new URL("https://v3.football.api-sports.io/venues");
  url.searchParams.set("country", country);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status} country=${country}`);
  }

  const payload = (await response.json()) as VenuesEnvelope;
  return payload.response ?? [];
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
