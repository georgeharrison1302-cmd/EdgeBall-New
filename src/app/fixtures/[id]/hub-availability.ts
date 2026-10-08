import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";

export type AvailabilityRow = {
  playerId: number;
  player: string;
  position: string | null;
  type: string;
  since: string | null;
  until: string | null;
};

export type FixtureAvailability = {
  home: AvailabilityRow[];
  away: AvailabilityRow[];
};

/**
 * Current absences for both squads from player_sidelined, joined through
 * team_squads. A spell counts when it has started by kickoff and has either
 * no end date or ends on/after kickoff.
 */
export async function loadFixtureAvailability(
  homeId: number,
  awayId: number,
  kickoffIso: string | null,
): Promise<FixtureAvailability> {
  const supabase = createAdminClient();
  const kickoff = kickoffIso ? kickoffIso.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const { data: squad, error } = await supabase
    .from("team_squads")
    .select("player_id, player_name, position, team_id")
    .in("team_id", [homeId, awayId]);
  if (error) throw error;

  const members = new Map<number, { name: string; position: string | null; teamId: number }>();
  for (const row of squad ?? []) {
    members.set(Number(row.player_id), {
      name: row.player_name ?? "Player",
      position: row.position,
      teamId: Number(row.team_id),
    });
  }
  const result: FixtureAvailability = { home: [], away: [] };
  if (members.size === 0) return result;

  const playerIds = [...members.keys()];
  const seen = new Set<string>();
  for (let i = 0; i < playerIds.length; i += 200) {
    const { data, error: spellError } = await supabase
      .from("player_sidelined")
      .select("player_id, type, start_date, end_date")
      .in("player_id", playerIds.slice(i, i + 200))
      .lte("start_date", kickoff)
      .order("start_date", { ascending: false });
    if (spellError) throw spellError;
    for (const spell of data ?? []) {
      if (spell.end_date != null && spell.end_date < kickoff) continue;
      const playerId = Number(spell.player_id);
      const key = `${playerId}|${spell.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const member = members.get(playerId);
      if (!member) continue;
      const row: AvailabilityRow = {
        playerId,
        player: member.name,
        position: member.position,
        type: spell.type,
        since: spell.start_date,
        until: spell.end_date,
      };
      (member.teamId === homeId ? result.home : result.away).push(row);
    }
  }
  for (const side of [result.home, result.away]) {
    side.sort((a, b) => a.player.localeCompare(b.player));
  }
  return result;
}

export type LineupPlayer = {
  id: number | null;
  name: string;
  number: number | null;
  pos: string | null;
};

export type TeamLineup = {
  teamId: number;
  formation: string | null;
  startXi: LineupPlayer[];
  substitutes: LineupPlayer[];
};

function lineupPlayers(value: unknown): LineupPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const player = (entry as { player?: Record<string, unknown> } | null)?.player;
    if (!player || typeof player.name !== "string") return [];
    return [
      {
        id: typeof player.id === "number" ? player.id : null,
        name: player.name,
        number: typeof player.number === "number" ? player.number : null,
        pos: typeof player.pos === "string" ? player.pos : null,
      },
    ];
  });
}

/** Confirmed lineups from fixture_lineups (synced ~90 minutes before kickoff). */
export async function loadFixtureLineups(fixtureId: number): Promise<TeamLineup[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_lineups")
    .select("team_id, formation, start_xi, substitutes")
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    teamId: Number(row.team_id),
    formation: row.formation,
    startXi: lineupPlayers(row.start_xi),
    substitutes: lineupPlayers(row.substitutes),
  }));
}
