import { NextResponse } from "next/server";

import { createIngestClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export type SearchHit = {
  type: "competition" | "team" | "player";
  id: number;
  label: string;
  sub: string | null;
  href: string;
  logo: string | null;
};

const LIMIT = 5;

function clean(raw: string) {
  return raw.replace(/[%_\\,()]/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(request: Request) {
  const q = clean(new URL(request.url).searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ hits: [] satisfies SearchHit[] });

  const supabase = createIngestClient();
  const pattern = `%${q}%`;
  const [leagues, teams, players] = await Promise.all([
    supabase.from("leagues").select("id, name, logo, country_name").ilike("name", pattern).limit(LIMIT),
    supabase.from("teams").select("id, name, logo, country").ilike("name", pattern).limit(LIMIT),
    supabase.from("players").select("id, name, photo, position").ilike("name", pattern).limit(LIMIT),
  ]);

  const teamIds = (teams.data ?? []).map((row) => Number(row.id));
  const playerIds = (players.data ?? []).map((row) => Number(row.id));
  const [teamSeasons, playerSeasons] = await Promise.all([
    teamIds.length
      ? supabase
          .from("team_seasons")
          .select("team_id, league_id, season")
          .in("team_id", teamIds)
          .order("season", { ascending: false })
      : Promise.resolve({ data: [] }),
    playerIds.length
      ? supabase
          .from("player_season_stats")
          .select("player_id, league_id, season")
          .in("player_id", playerIds)
          .order("season", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const teamLeague = new Map<number, number>();
  for (const row of teamSeasons.data ?? []) {
    if (!teamLeague.has(Number(row.team_id))) teamLeague.set(Number(row.team_id), Number(row.league_id));
  }
  const playerLeague = new Map<number, number>();
  for (const row of playerSeasons.data ?? []) {
    if (!playerLeague.has(Number(row.player_id))) playerLeague.set(Number(row.player_id), Number(row.league_id));
  }

  const hits: SearchHit[] = [
    ...(leagues.data ?? []).map((row) => ({
      type: "competition" as const,
      id: Number(row.id),
      label: row.name,
      sub: row.country_name,
      href: `/competitions/${row.id}`,
      logo: row.logo,
    })),
    ...(teams.data ?? []).flatMap((row) => {
      const league = teamLeague.get(Number(row.id));
      return league
        ? [
            {
              type: "team" as const,
              id: Number(row.id),
              label: row.name,
              sub: row.country,
              href: `/competitions/${league}/teams/${row.id}`,
              logo: row.logo,
            },
          ]
        : [];
    }),
    ...(players.data ?? []).flatMap((row) => {
      const league = playerLeague.get(Number(row.id));
      return league
        ? [
            {
              type: "player" as const,
              id: Number(row.id),
              label: row.name ?? "Player",
              sub: row.position,
              href: `/competitions/${league}/players/${row.id}`,
              logo: row.photo,
            },
          ]
        : [];
    }),
  ];

  return NextResponse.json({ hits });
}
