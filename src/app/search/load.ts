import "server-only";

import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { createAdminClient } from "@/utils/supabase/admin";

export type SearchHit = {
  id: number;
  name: string;
  image: string | null;
  href: string | null;
  detail: string;
};

export async function searchCatalog(raw: string): Promise<{ teams: SearchHit[]; players: SearchHit[] }> {
  const query = raw.trim().slice(0, 40);
  if (query.length < 2) return { teams: [], players: [] };
  const safe = query.replace(/[%_,]/g, "");
  const supabase = createAdminClient();
  const teamRequest =
    query.length < 3
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("teams").select("id, name, logo").or(`name.ilike.${safe}%,name.ilike.% ${safe}%`).limit(24);
  const [{ data: teams, error: teamError }, { data: players, error: playerError }] = await Promise.all([
    teamRequest,
    supabase.from("players").select("id, name, photo").or(`name.ilike.${safe}%,name.ilike.% ${safe}%`).limit(24),
  ]);
  if (teamError) throw teamError;
  if (playerError) throw playerError;
  const teamRows = rankNames(teams ?? [], query).slice(0, 12);
  const playerRows = rankNames(players ?? [], query).slice(0, 12);

  const teamIds = teamRows.map((team) => team.id);
  const playerIds = playerRows.map((player) => player.id);
  const [teamSeasons, playerSeasons] = await Promise.all([
    memberships("team_seasons", "team_id", teamIds),
    memberships("player_season_stats", "player_id", playerIds),
  ]);
  const teamLeague = firstBy(teamSeasons, "team_id");
  const playerLeague = firstBy(playerSeasons, "player_id");

  return {
    teams: teamRows.map((team) => {
      const season = teamLeague.get(team.id);
      return {
        id: team.id,
        name: team.name ?? "Club",
        image: team.logo,
        href: season ? `/competitions/${season.league_id}/teams/${team.id}?season=${season.season}` : null,
        detail: season ? String(season.season) : "No competition stored",
      };
    }),
    players: playerRows.map((player) => {
      const season = playerLeague.get(player.id);
      return {
        id: player.id,
        name: player.name ?? "Player",
        image: player.photo,
        href: season ? `/competitions/${season.league_id}/players/${player.id}?season=${season.season}` : null,
        detail: season ? String(season.season) : "No competition stored",
      };
    }),
  };
}

function rankNames<T extends { name: string | null }>(rows: T[], query: string) {
  const needle = query.toLowerCase();
  return [...rows].sort((left, right) => rank(left.name ?? "", needle) - rank(right.name ?? "", needle) || (left.name ?? "").localeCompare(right.name ?? ""));
}

function rank(name: string, needle: string) {
  const value = name.toLowerCase();
  if (value === needle) return 0;
  if (value.startsWith(needle)) return 1;
  if (value.includes(` ${needle}`)) return 2;
  return 3;
}

async function memberships(table: "team_seasons" | "player_season_stats", column: "team_id" | "player_id", ids: number[]) {
  if (ids.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(table)
    .select(`${column}, league_id, season`)
    .in(column, ids)
    .in("league_id", [...TARGET_LEAGUE_IDS])
    .order("season", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
}

type Membership = { team_id?: number; player_id?: number; league_id: number; season: number };

function firstBy(rows: Membership[], key: "team_id" | "player_id") {
  const map = new Map<number, { league_id: number; season: number }>();
  for (const row of rows) {
    const id = row[key];
    if (typeof id === "number" && !map.has(id)) map.set(id, { league_id: row.league_id, season: row.season });
  }
  return map;
}
