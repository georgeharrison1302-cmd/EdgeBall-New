import "server-only";

import type { CollisionCardData } from "@/components/MatchHub/TacticalCollision";
import type { TapeLeader } from "@/components/MatchHub/TaleOfTheTape";
import { buildKeyMatchups } from "@/lib/matchups/collisions";
import { nestNumber } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

type FixtureSeed = {
  id: number;
  leagueId: number;
  season: number;
  competition: string;
  home: { id: number; name: string };
  away: { id: number; name: string };
};

/**
 * Tactical collision cards for today's upcoming Match Hub fixtures.
 */
export async function loadDayCollisions(seeds: FixtureSeed[]): Promise<CollisionCardData[]> {
  const limited = seeds.slice(0, 12);
  const cards: CollisionCardData[] = [];

  for (const seed of limited) {
    const tape = await loadLeadersForFixture(seed);
    if (!tape) continue;
    const matchups = buildKeyMatchups(tape);
    for (const matchup of matchups) {
      cards.push({
        ...matchup,
        id: `${seed.id}:${matchup.id}`,
        match: `${seed.home.name} vs ${seed.away.name}`,
        fixtureId: seed.id,
        competition: seed.competition,
      });
    }
  }

  return cards;
}

async function loadLeadersForFixture(seed: FixtureSeed) {
  if (!Number.isInteger(seed.leagueId) || !Number.isInteger(seed.season)) return null;
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("player_id, team_id, appearances, minutes, stats_data")
    .eq("league_id", seed.leagueId)
    .eq("season", seed.season)
    .in("team_id", [seed.home.id, seed.away.id])
    .gte("appearances", 3)
    .limit(400);
  if (error || !data?.length) return null;

  const playerIds = [...new Set(data.map((row) => Number(row.player_id)))];
  const names = new Map<number, string>();
  if (playerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("player_profiles")
      .select("player_id, name")
      .in("player_id", playerIds);
    for (const profile of profiles ?? []) {
      names.set(Number(profile.player_id), String(profile.name));
    }
  }

  type Ranked = TapeLeader & { teamId: number };
  const sot: Ranked[] = [];
  const fouls: Ranked[] = [];
  const drawn: Ranked[] = [];

  for (const row of data) {
    const playerId = Number(row.player_id);
    const teamId = Number(row.team_id);
    const apps = Number(row.appearances) || 0;
    const rawMinutes = Number(row.minutes) || nestNumber(row.stats_data, "games", "minutes") || 0;
    const minutes = apps > 0 && rawMinutes >= apps * 45 ? rawMinutes : apps > 0 ? apps * 90 : 0;
    if (minutes <= 0) continue;

    const name = names.get(playerId) ?? `Player ${playerId}`;
    const sotTotal = nestNumber(row.stats_data, "shots", "on");
    const foulTotal = nestNumber(row.stats_data, "fouls", "committed");
    const drawnTotal = nestNumber(row.stats_data, "fouls", "drawn");

    if (sotTotal != null) {
      sot.push({
        playerId,
        name,
        teamId,
        rate: Number(((sotTotal * 90) / minutes).toFixed(2)),
        appearances: apps > 0 ? apps : null,
      });
    }
    if (foulTotal != null) {
      fouls.push({
        playerId,
        name,
        teamId,
        rate: Number(((foulTotal * 90) / minutes).toFixed(2)),
        appearances: apps > 0 ? apps : null,
      });
    }
    if (drawnTotal != null) {
      drawn.push({
        playerId,
        name,
        teamId,
        rate: Number(((drawnTotal * 90) / minutes).toFixed(2)),
        appearances: apps > 0 ? apps : null,
      });
    }
  }

  function top3(pool: Ranked[], teamId: number): TapeLeader[] {
    return pool
      .filter((row) => row.teamId === teamId)
      .sort((left, right) => right.rate - left.rate)
      .slice(0, 3)
      .map(({ playerId, name, teamId: id, rate, appearances }) => ({
        playerId,
        name,
        teamId: id,
        rate,
        appearances,
      }));
  }

  return {
    homeName: seed.home.name,
    awayName: seed.away.name,
    foulsCommitted: {
      home: top3(fouls, seed.home.id),
      away: top3(fouls, seed.away.id),
    },
    foulsDrawn: {
      home: top3(drawn, seed.home.id),
      away: top3(drawn, seed.away.id),
    },
    shotsOn: {
      home: top3(sot, seed.home.id),
      away: top3(sot, seed.away.id),
    },
  };
}
