import "server-only";

import { loadBuilderBoard, type BuilderBoard } from "@/app/builder/load";
import { loadFactorFeed, type FactorFeedData } from "@/app/factors/load";
import type { PlayerProp } from "@/components/PlayerPropsBuilder";
import { classifySlipMarket, type SlipMarketKind } from "@/utils/betslip/checkCorrelation";
import { booleansToOutcomes, type FormOutcome } from "@/lib/stats/last-five";

const EDGE_FLOOR = 5;
const TOP_N = 5;

export type ValueAngle = {
  id: string;
  kind: "edge" | "factor";
  match: string;
  fixtureId: number | null;
  narrative: string;
  selectionLabel: string;
  decimalOdds: number | null;
  edgePct: number | null;
  form: FormOutcome[];
  marketKind: SlipMarketKind;
  line?: number;
  player?: string;
  hubHref: string;
};

/**
 * Top 5 activation angles: edge_pct > 5 props + factor-triggered markets.
 */
export async function loadTopAngles(input?: {
  board?: BuilderBoard;
  feed?: FactorFeedData | null;
}): Promise<ValueAngle[]> {
  const [board, feed] = await Promise.all([
    input?.board ? Promise.resolve(input.board) : loadBuilderBoard(),
    input?.feed !== undefined
      ? Promise.resolve(input.feed)
      : loadFactorFeed().catch(() => null),
  ]);

  return mergeTopAngles(board, feed);
}

export function mergeTopAngles(
  board: BuilderBoard,
  feed: FactorFeedData | null | undefined,
): ValueAngle[] {
  const edges = board.playerProps
    .filter((prop) => {
      const edge = prop.edgePct ?? prop.edgeScore;
      return prop.odds != null && prop.odds > 1 && edge > EDGE_FLOOR;
    })
    .map(propToAngle);

  const factors: ValueAngle[] = [];
  for (const group of feed?.groups ?? []) {
    for (const match of group.matches) {
      factors.push({
        id: `factor:${group.factorId}:${match.fixtureId}:${match.market}`,
        kind: "factor",
        match: `${match.home.name} vs ${match.away.name}`,
        fixtureId: match.fixtureId,
        narrative: `${group.badgeLabel}: ${match.evaluation.summary}`,
        selectionLabel: match.marketLabel,
        decimalOdds: match.marketOdd,
        edgePct: group.backtest.hitRatePct > 0 ? group.backtest.hitRatePct : null,
        form: [],
        marketKind:
          match.market === "over_2_5_goals"
            ? "over_goals"
            : match.market === "btts_yes"
              ? "btts_yes"
              : "other",
        line: match.market === "over_2_5_goals" ? 2.5 : match.market === "over_3_5_cards" ? 3.5 : undefined,
        hubHref: match.hubHref,
      });
    }
  }

  const seen = new Set<string>();
  const merged = [...edges, ...factors]
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "edge" ? -1 : 1;
      return (right.edgePct ?? 0) - (left.edgePct ?? 0);
    })
    .filter((angle) => {
      const key = `${angle.fixtureId ?? "x"}:${angle.selectionLabel}:${angle.player ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, TOP_N);

  return merged;
}

function propToAngle(prop: PlayerProp): ValueAngle {
  const classified = classifySlipMarket(`${prop.selection} ${prop.market}`, {
    marketKey:
      prop.market === "To Be Carded"
        ? "cards"
        : prop.market === "Shots on Target" || prop.market === "Total Shots"
          ? "shots"
          : prop.market === "Fouls Committed" || prop.market === "Fouls Drawn"
            ? "fouls"
            : undefined,
  });
  const fixtureId = typeof prop.id === "number" ? guessFixtureId(prop) : null;
  return {
    id: `edge:${prop.id}`,
    kind: "edge",
    match: prop.match,
    fixtureId,
    narrative:
      prop.edgePct != null || prop.edgeScore > 0
        ? `+${(prop.edgePct ?? prop.edgeScore).toFixed(1)}% model edge on ${prop.selection}`
        : prop.selection,
    selectionLabel: `${prop.player} ${prop.selection}`,
    decimalOdds: prop.odds,
    edgePct: prop.edgePct ?? prop.edgeScore,
    form: booleansToOutcomes((prop.form ?? []).filter((item): item is boolean => item !== null)),
    marketKind: classified.marketKind,
    line: classified.line,
    player: prop.player,
    hubHref: fixtureId != null ? `/fixtures/${fixtureId}` : "/",
  };
}

/** PlayerProp.id is often a synthetic row id — keep null unless encoded. */
function guessFixtureId(_prop: PlayerProp): number | null {
  return null;
}
