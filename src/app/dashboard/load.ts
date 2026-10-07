import "server-only";

import { loadBuilderBoard } from "@/app/builder/load";
import type { PlayerProp } from "@/components/PlayerPropsBuilder";

function isHotStreak(form: Array<boolean | null> | undefined) {
  const stored = (form ?? []).filter((item): item is boolean => item !== null);
  if (stored.length < 5) return false;
  return stored.slice(-5).filter(Boolean).length >= 4;
}

export type SeasonProof = {
  appearances: number | null;
  yellows: number | null;
  goals: number | null;
  foulsPer90: number | null;
  tacklesPer90: number | null;
  sotPer90: number | null;
};

export type ValueBetCard = {
  id: number;
  player: string;
  selection: string;
  match: string;
  competition: string;
  market: string;
  odds: number;
  modelProb: number;
  edgePct: number;
  hitRate: number;
  form: boolean[];
  proof: SeasonProof;
};

export type HotStreakCard = {
  id: number;
  player: string;
  selection: string;
  match: string;
  market: string;
  hits: number;
  form: boolean[];
  odds: number | null;
  edgePct: number | null;
  proof: SeasonProof;
};

export type EdgeDashboardData = {
  dateLabel: string;
  matchCount: number;
  valueBets: ValueBetCard[];
  hotStreaks: HotStreakCard[];
};

function seasonProof(prop: PlayerProp): SeasonProof {
  return {
    appearances: prop.appearances ?? null,
    yellows: prop.yellows ?? null,
    goals: prop.goals ?? null,
    foulsPer90: prop.foulsPer90 ?? null,
    tacklesPer90: prop.tacklesPer90 ?? null,
    sotPer90: prop.seasonSotPer90 ?? null,
  };
}

/** Edge only when book price and model probability both exist — never from hit-rate. */
function edgeOf(prop: PlayerProp) {
  const odds = prop.odds;
  let modelProb = prop.modelProb ?? null;
  let edgePct = prop.edgePct ?? null;
  if (odds == null || !Number.isFinite(odds) || odds <= 1) return null;

  if (modelProb == null && edgePct != null && Number.isFinite(edgePct)) {
    const derived = (1 + edgePct / 100) / odds;
    if (Number.isFinite(derived) && derived > 0 && derived < 1) modelProb = derived;
  }
  if (modelProb == null || !Number.isFinite(modelProb)) return null;

  if (edgePct == null || !Number.isFinite(edgePct)) {
    edgePct = (odds * modelProb - 1) * 100;
  }
  return { modelProb, edgePct };
}

function formBools(form: Array<boolean | null> | undefined) {
  return (form ?? []).filter((item): item is boolean => item !== null);
}

export async function loadEdgeDashboard(): Promise<EdgeDashboardData> {
  const board = await loadBuilderBoard();
  const valueBets = board.playerProps
    .flatMap((prop) => {
      const resolved = edgeOf(prop);
      if (prop.odds == null || prop.odds <= 1 || resolved == null || resolved.edgePct <= 0) {
        return [];
      }
      return [
        {
          id: prop.id,
          player: prop.player,
          selection: prop.selection,
          match: prop.match,
          competition: prop.competition,
          market: prop.market,
          odds: prop.odds,
          modelProb: resolved.modelProb,
          edgePct: Number(resolved.edgePct.toFixed(1)),
          hitRate: prop.hitRate,
          form: formBools(prop.form),
          proof: seasonProof(prop),
        } satisfies ValueBetCard,
      ];
    })
    .sort((left, right) => right.edgePct - left.edgePct || right.hitRate - left.hitRate)
    .slice(0, 8);

  const formHot = board.playerProps
    .flatMap((prop) => {
      if (!isHotStreak(prop.form)) return [];
      const form = formBools(prop.form).slice(-5);
      const resolved = edgeOf(prop);
      return [
        {
          id: prop.id,
          player: prop.player,
          selection: prop.selection,
          match: prop.match,
          market: prop.market,
          hits: form.filter(Boolean).length,
          form,
          odds: prop.odds,
          edgePct: resolved?.edgePct ?? null,
          proof: seasonProof(prop),
        } satisfies HotStreakCard,
      ];
    })
    .sort((left, right) => right.hits - left.hits || (right.edgePct ?? -999) - (left.edgePct ?? -999))
    .slice(0, 10);

  // FPS empty → no Last-5 streaks; surface season-rate leaders instead (honest proof).
  const hotStreaks =
    formHot.length > 0
      ? formHot
      : board.playerProps
          .flatMap((prop) => {
            const proof = seasonProof(prop);
            const seasonRate =
              proof.foulsPer90 ?? proof.sotPer90 ?? proof.tacklesPer90 ?? null;
            if (seasonRate == null || seasonRate <= 0) return [];
            const resolved = edgeOf(prop);
            return [
              {
                id: prop.id,
                player: prop.player,
                selection: prop.selection,
                match: prop.match,
                market: prop.market,
                hits: 0,
                form: [] as boolean[],
                odds: prop.odds,
                edgePct: resolved?.edgePct ?? null,
                proof,
              } satisfies HotStreakCard,
            ];
          })
          .sort((left, right) => {
            const leftRate =
              left.proof.foulsPer90 ?? left.proof.sotPer90 ?? left.proof.tacklesPer90 ?? 0;
            const rightRate =
              right.proof.foulsPer90 ?? right.proof.sotPer90 ?? right.proof.tacklesPer90 ?? 0;
            return rightRate - leftRate || (right.edgePct ?? -999) - (left.edgePct ?? -999);
          })
          .slice(0, 10);

  return {
    dateLabel: board.dateLabel,
    matchCount: board.matchCount,
    valueBets,
    hotStreaks,
  };
}
