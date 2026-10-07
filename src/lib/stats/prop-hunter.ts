import type { PlayerProp } from "@/components/PlayerPropsBuilder";
import { isPriced } from "@/components/stats/types";

export function propEdge(prop: PlayerProp): number | null {
  const edge = prop.edgePct ?? prop.edgeScore;
  return edge != null && Number.isFinite(edge) ? edge : null;
}

function dedupeKey(prop: PlayerProp) {
  return `${prop.playerId ?? prop.player}::${prop.match}::${prop.market}`;
}

/**
 * Prop Hunter board — priced props with a real stored/model edge,
 * deduped to the best line per player × market × fixture.
 */
export function hunterRows(props: PlayerProp[]): PlayerProp[] {
  const best = new Map<string, PlayerProp>();
  for (const prop of props) {
    if (!isPriced(prop.odds)) continue;
    const edge = propEdge(prop);
    if (edge == null || edge <= 0) continue;
    const key = dedupeKey(prop);
    const existing = best.get(key);
    if (!existing || edge > (propEdge(existing) ?? 0)) best.set(key, prop);
  }
  return [...best.values()].sort(
    (a, b) => (propEdge(b) ?? 0) - (propEdge(a) ?? 0) || b.hitRate - a.hitRate,
  );
}

/**
 * Current consecutive-hit streak from an oldest→newest form array.
 * Nulls (stat not stored for that appearance) are skipped; a miss ends the run.
 */
export function currentStreak(form: Array<boolean | null> | undefined): number {
  if (!form) return 0;
  let streak = 0;
  for (let index = form.length - 1; index >= 0; index -= 1) {
    const value = form[index];
    if (value == null) continue;
    if (!value) break;
    streak += 1;
  }
  return streak;
}

export type TrendRow = {
  key: string;
  prop: PlayerProp;
  streak: number;
  games: number;
};

/**
 * Player Trends — players on active hit streaks (min `minStreak`) at their
 * priced/form clear line. One row per player × market × fixture.
 */
export function trendRows(props: PlayerProp[], minStreak = 3): TrendRow[] {
  const best = new Map<string, TrendRow>();
  for (const prop of props) {
    const form = prop.form ?? [];
    if (form.length === 0) continue;
    const streak = currentStreak(form);
    if (streak < minStreak) continue;
    const key = dedupeKey(prop);
    const existing = best.get(key);
    const games = form.filter((value) => value != null).length;
    if (!existing || streak > existing.streak) {
      best.set(key, { key, prop, streak, games });
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      b.streak - a.streak ||
      (b.prop.formHitPct ?? -1) - (a.prop.formHitPct ?? -1) ||
      (propEdge(b.prop) ?? Number.NEGATIVE_INFINITY) -
        (propEdge(a.prop) ?? Number.NEGATIVE_INFINITY),
  );
}
