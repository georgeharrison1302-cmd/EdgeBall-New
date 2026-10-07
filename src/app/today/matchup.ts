import "server-only";

import { isMissingRelation } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

const LOG_LIMIT = 10;

export type MatchupSide = {
  id: number;
  name: string;
  photo: string | null;
  perGame: number | null;
  games: number;
  label: string;
};

export type Matchup = {
  attacker: MatchupSide;
  defender: MatchupSide;
};

type SquadPlayer = {
  id: number;
  name: string;
  photo: string | null;
  position: string | null;
  teamId: number;
};

type Logged = {
  dribbles: number | null;
  dribbledPast: number | null;
  tackles: number | null;
};

export async function loadMatchups(
  fixtures: Array<{ id: number; homeId: number; awayId: number; featuredPlayerId: number | null }>,
) {
  const matchups = new Map<number, Matchup | null>();
  const playable = fixtures.filter((fixture) => fixture.homeId && fixture.awayId);
  if (playable.length === 0) return matchups;

  const teamIds = [...new Set(playable.flatMap((fixture) => [fixture.homeId, fixture.awayId]))];
  const squads = await loadSquads(teamIds);
  const logs = await loadLogs([...new Set(squads.map((player) => player.id))]);

  for (const fixture of playable) {
    matchups.set(fixture.id, buildMatchup(fixture, squads, logs));
  }
  return matchups;
}

function buildMatchup(
  fixture: { id: number; homeId: number; awayId: number; featuredPlayerId: number | null },
  squads: SquadPlayer[],
  logs: Map<number, Logged[]>,
): Matchup | null {
  const home = squads.filter((player) => player.teamId === fixture.homeId);
  const away = squads.filter((player) => player.teamId === fixture.awayId);
  const featured = squads.find((player) => player.id === fixture.featuredPlayerId) ?? null;
  const featuredIsDefender = featured?.position === "Defender";
  const featuredTeam = featured?.teamId ?? null;
  const opposing = featuredTeam === fixture.homeId ? away : featuredTeam === fixture.awayId ? home : null;

  const attacker = featured && !featuredIsDefender && opposing
    ? featured
    : bestBy(opposing ?? [...home, ...away], logs, "dribbles", (player) => player.position === "Attacker" || player.position === "Midfielder");
  if (!attacker) return null;

  const defenderPool = attacker.teamId === fixture.homeId ? away : home;
  const defender = featuredIsDefender && featured ? featured : bestBy(defenderPool, logs, "tackles", (player) => player.position === "Defender");
  if (!defender || defender.id === attacker.id) return null;

  const attackerRate = rate(logs.get(attacker.id) ?? [], "dribbles");
  const dribbledPast = rate(logs.get(defender.id) ?? [], "dribbledPast");
  const tackles = rate(logs.get(defender.id) ?? [], "tackles");
  const defenderRate = dribbledPast ?? tackles;
  if (!attackerRate || !defenderRate) return null;

  return {
    attacker: {
      id: attacker.id,
      name: attacker.name,
      photo: attacker.photo,
      perGame: attackerRate.perGame,
      games: attackerRate.games,
      label: "Successful dribbles",
    },
    defender: {
      id: defender.id,
      name: defender.name,
      photo: defender.photo,
      perGame: defenderRate.perGame,
      games: defenderRate.games,
      label: dribbledPast ? "Dribbled past" : "Tackles",
    },
  };
}

function bestBy(
  squad: SquadPlayer[],
  logs: Map<number, Logged[]>,
  stat: keyof Logged,
  include: (player: SquadPlayer) => boolean,
) {
  const ranked = squad
    .filter(include)
    .map((player) => ({ player, sample: rate(logs.get(player.id) ?? [], stat) }))
    .filter((item): item is { player: SquadPlayer; sample: { perGame: number; games: number } } => item.sample !== null)
    .sort((left, right) => right.sample.perGame - left.sample.perGame || right.sample.games - left.sample.games);
  return ranked[0]?.player ?? null;
}

function rate(games: Logged[], stat: keyof Logged) {
  const values = games.map((game) => game[stat]).filter((value): value is number => value !== null).slice(0, LOG_LIMIT);
  if (values.length < 2) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return { perGame: total / values.length, games: values.length };
}

async function loadSquads(teamIds: number[]) {
  if (teamIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("team_squads")
    .select("team_id, position, player_id, player_name, photo")
    .in("team_id", teamIds)
    .limit(1000);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    const name = row.player_name;
    if (!name) return [];
    return [{ id: Number(row.player_id), name, photo: row.photo ?? null, position: row.position, teamId: row.team_id }];
  });
}

async function loadLogs(_playerIds: number[]) {
  // Per-game logs need fixture_player_statistics (currently empty on PYTH).
  return new Map<number, Logged[]>();
}
