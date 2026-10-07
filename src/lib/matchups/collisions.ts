import type { KeyMatchup, TapeLeader } from "@/components/MatchHub/TaleOfTheTape";

const FOUL_COLLISION_MIN = 1.5;
const SOT_SPOTLIGHT_MIN = 1.2;

/** Pair season-rate leaders into narrative Key Matchups. */
export function buildKeyMatchups(input: {
  homeName: string;
  awayName: string;
  foulsCommitted: { home: TapeLeader[]; away: TapeLeader[] };
  foulsDrawn: { home: TapeLeader[]; away: TapeLeader[] };
  shotsOn: { home: TapeLeader[]; away: TapeLeader[] };
}): KeyMatchup[] {
  const matchups: KeyMatchup[] = [];

  const homeMagnet = input.foulsDrawn.home[0] ?? null;
  const awayAggressor = input.foulsCommitted.away[0] ?? null;
  if (
    homeMagnet &&
    awayAggressor &&
    homeMagnet.rate >= FOUL_COLLISION_MIN &&
    awayAggressor.rate >= FOUL_COLLISION_MIN
  ) {
    matchups.push({
      id: `foul:${homeMagnet.playerId}:${awayAggressor.playerId}`,
      archetype: "The Foul Magnet vs. The Aggressor",
      narrative: `${homeMagnet.name} draws ${homeMagnet.rate.toFixed(1)} fouls/90 for ${input.homeName}. ${awayAggressor.name} commits ${awayAggressor.rate.toFixed(1)}/90 for ${input.awayName}. That lane is a card and foul prop collision.`,
      left: { player: homeMagnet, role: "Foul Magnet", teamName: input.homeName },
      right: { player: awayAggressor, role: "Aggressor", teamName: input.awayName },
    });
  }

  const awayMagnet = input.foulsDrawn.away[0] ?? null;
  const homeAggressor = input.foulsCommitted.home[0] ?? null;
  if (
    awayMagnet &&
    homeAggressor &&
    awayMagnet.rate >= FOUL_COLLISION_MIN &&
    homeAggressor.rate >= FOUL_COLLISION_MIN &&
    !(
      homeMagnet?.playerId === homeAggressor.playerId &&
      awayAggressor?.playerId === awayMagnet.playerId
    )
  ) {
    matchups.push({
      id: `foul:${awayMagnet.playerId}:${homeAggressor.playerId}`,
      archetype: "The Foul Magnet vs. The Aggressor",
      narrative: `${awayMagnet.name} draws ${awayMagnet.rate.toFixed(1)} fouls/90 for ${input.awayName}. ${homeAggressor.name} commits ${homeAggressor.rate.toFixed(1)}/90 for ${input.homeName}. Mirror collision on the other flank.`,
      left: { player: awayMagnet, role: "Foul Magnet", teamName: input.awayName },
      right: { player: homeAggressor, role: "Aggressor", teamName: input.homeName },
    });
  }

  const homeShooter = input.shotsOn.home[0] ?? null;
  const awayShooter = input.shotsOn.away[0] ?? null;
  const topShooter =
    homeShooter && awayShooter
      ? homeShooter.rate >= awayShooter.rate
        ? { player: homeShooter, teamName: input.homeName }
        : { player: awayShooter, teamName: input.awayName }
      : homeShooter
        ? { player: homeShooter, teamName: input.homeName }
        : awayShooter
          ? { player: awayShooter, teamName: input.awayName }
          : null;

  if (topShooter && topShooter.player.rate >= SOT_SPOTLIGHT_MIN) {
    const opponentName =
      topShooter.teamName === input.homeName ? input.awayName : input.homeName;
    const foil =
      topShooter.teamName === input.homeName
        ? input.foulsCommitted.away[0]
        : input.foulsCommitted.home[0];
    if (foil && foil.rate >= FOUL_COLLISION_MIN) {
      matchups.push({
        id: `sot:${topShooter.player.playerId}:${foil.playerId}`,
        archetype: "The Trigger vs. The Disruptor",
        narrative: `${topShooter.player.name} leads at ${topShooter.player.rate.toFixed(1)} SOT/90. ${foil.name} of ${opponentName} fouls at ${foil.rate.toFixed(1)}/90 — shots and cards can fire in the same passage of play.`,
        left: {
          player: topShooter.player,
          role: "Trigger",
          teamName: topShooter.teamName,
        },
        right: { player: foil, role: "Disruptor", teamName: opponentName },
      });
    }
  }

  return matchups.slice(0, 3);
}
