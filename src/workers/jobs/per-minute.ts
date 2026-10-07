import { cadence } from "@/utils/api-football/cadence";
import { isEmptyApiResponse } from "@/utils/api-football/client";
import { getFixturePlayers } from "@/utils/api-football/endpoints";
import { liveFixtureIds } from "@/workers/checkpoints";
import { REQUEST_GAP_MS, sleep, upsertChunks } from "@/workers/db";
import { runTsx } from "@/workers/run-tsx";
import type { WorkerJob } from "@/workers/types";

export const minuteJobs: WorkerJob[] = [
  {
    id: "fixture-statistics",
    lane: "minute",
    endpoints: ["/fixtures/statistics"],
    intervalMs: cadence.liveStats,
    requiresLive: true,
    description: "Shots, possession, corners, passes. Per minute during matches.",
    run: () => runTsx("scripts/sync-fixture-stats.ts"),
  },
  {
    id: "fixture-players",
    lane: "minute",
    endpoints: ["/fixtures/players"],
    intervalMs: cadence.fixturePlayers,
    requiresLive: true,
    description: "Individual player stats and ratings. Per minute during matches.",
    run: syncFixturePlayers,
  },
];

export async function syncFixturePlayers() {
  const fixtureIds = await liveFixtureIds();
  console.log(`live fixture players ${fixtureIds.length}`);
  if (fixtureIds.length === 0) return { fixtures: 0, players: 0 };

  let players = 0;
  for (const [index, fixtureId] of fixtureIds.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    const count = await persistFixturePlayers(fixtureId);
    players += count;
    console.log(
      `progress ${index + 1}/${fixtureIds.length} fixture ${fixtureId}: players ${count}`,
    );
  }
  return { fixtures: fixtureIds.length, players };
}

async function persistFixturePlayers(fixtureId: number) {
  const envelope = await getFixturePlayers({ fixture: fixtureId });
  if (isEmptyApiResponse(envelope)) {
    console.log(`Data Not Yet Available fixture=${fixtureId} resource=players`);
    return 0;
  }

  const updatedAt = new Date().toISOString();
  const rows = envelope.response.flatMap((item) => {
    const teamId = item.team?.id;
    if (!teamId) return [];
    return (item.players ?? []).flatMap((entry) => {
      const playerId = entry.player?.id;
      if (!playerId) return [];
      return [
        {
          fixture_id: fixtureId,
          team_id: teamId,
          player_id: playerId,
          player_name: entry.player.name,
          statistics: entry.statistics ?? [],
          updated_at: updatedAt,
        },
      ];
    });
  });

  await upsertChunks("fixture_player_statistics", rows, "fixture_id,team_id,player_id");
  return rows.length;
}
