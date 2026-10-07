import { authorizeCron } from "@/utils/api/cron-auth";
import { createIngestClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ApiCountry = {
  name: string;
  code: string | null;
  flag: string | null;
};

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) {
      throw new Error("Missing API_FOOTBALL_KEY");
    }

    const response = await fetch("https://v3.football.api-sports.io/countries?", {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API-Football ${response.status}`);
    }

    const payload = (await response.json()) as { response?: ApiCountry[] };
    const mappedArray = (payload.response ?? [])
      .filter((item) => item.name)
      .map((item) => ({
        name: item.name,
        code: item.code,
        flag: item.flag,
      }));

    const supabase = createIngestClient();
    const { error } = await supabase.from("countries").upsert(mappedArray);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: "success",
      total_cached: mappedArray.length,
    });
  } catch (error) {
    console.error(error);
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
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
