import { createIngestClient } from "../src/utils/supabase/admin";

const REQUEST_GAP_MS = 200;
const CHUNK = 500;

type ApiCoach = {
  id?: number;
  name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  age?: number | null;
  nationality?: string | null;
  photo?: string | null;
  career?: unknown;
};

type CoachesEnvelope = {
  response?: ApiCoach[];
};

type CoachRow = {
  team_id: number;
  coach_id: number;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  age: number | null;
  nationality: string | null;
  photo: string | null;
  career: unknown;
  coach_data: ApiCoach;
  updated_at: string;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const teamIds = await uniqueTeamIds(supabase);
  console.log(`coach teams ${teamIds.length}`);

  let cached = 0;
  let skipped = 0;

  for (const [index, teamId] of teamIds.entries()) {
    try {
      const payload = await fetchCoaches(apiKey, teamId);
      const rows = uniqueRows(
        (payload.response ?? [])
          .map((coach) => mapCoach(teamId, coach))
          .filter((row): row is CoachRow => row != null),
      );

      if (rows.length > 0) {
        await upsertRows(supabase, rows);
        cached += rows.length;
        console.log(
          `progress ${index + 1}/${teamIds.length} team ${teamId}: cached ${rows.length} coaches`,
        );
      } else {
        skipped += 1;
        console.log(
          `progress ${index + 1}/${teamIds.length} team ${teamId}: no coaches`,
        );
      }
    } catch (cause) {
      console.log(
        `progress ${index + 1}/${teamIds.length} team ${teamId}: failed ${errorMessage(cause)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
  }

  console.log(`coaches sync done cached=${cached} skipped=${skipped}`);
}

async function uniqueTeamIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids = new Set<number>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("team_squads")
      .select("team_id")
      .not("team_id", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) addId(ids, row.team_id);
    if (!data || data.length < 1000) break;
  }

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("standings")
      .select("team_id")
      .not("team_id", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) addId(ids, row.team_id);
    if (!data || data.length < 1000) break;
  }

  return [...ids].sort((left, right) => left - right);
}

async function fetchCoaches(apiKey: string, teamId: number) {
  const url = new URL("https://v3.football.api-sports.io/coachs");
  url.searchParams.set("team", String(teamId));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  return (await response.json()) as CoachesEnvelope;
}

function mapCoach(teamId: number, coach: ApiCoach): CoachRow | null {
  const coachId = coach.id;
  if (!coachId) return null;

  return {
    team_id: teamId,
    coach_id: coachId,
    name: coach.name ?? null,
    firstname: coach.firstname ?? null,
    lastname: coach.lastname ?? null,
    age: coach.age ?? null,
    nationality: coach.nationality ?? null,
    photo:
      coach.photo ||
      `https://media.api-sports.io/football/coachs/${coachId}.png`,
    career: coach.career ?? [],
    coach_data: coach,
    updated_at: new Date().toISOString(),
  };
}

function uniqueRows(rows: CoachRow[]) {
  return [...new Map(rows.map((row) => [`${row.team_id}:${row.coach_id}`, row])).values()];
}

async function upsertRows(
  supabase: ReturnType<typeof createIngestClient>,
  rows: CoachRow[],
) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await supabase.from("team_coaches").upsert(rows.slice(index, index + CHUNK), {
      onConflict: "team_id,coach_id",
    });
    if (error) throw error;
  }
}

function addId(ids: Set<number>, value: unknown) {
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) ids.add(id);
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
