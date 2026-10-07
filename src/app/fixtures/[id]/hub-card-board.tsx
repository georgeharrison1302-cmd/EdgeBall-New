"use client";

import { useMemo, useState } from "react";

import { FactorBadge } from "@/components/factors/FactorBadge";
import { PropCard } from "@/components/PropCard";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { MarketAccordion } from "@/components/stats/MarketAccordion";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import type { FactorEvaluation, FixtureFactorId } from "@/lib/factors/types";
import { hasActivePropModel } from "@/lib/odds/prop-line-policy";

import type { PropBoardRow, PropMarketKey } from "./hub-load";

const MARKET_SECTIONS: Array<{ key: PropMarketKey; title: string }> = [
  { key: "cards", title: "Cards" },
  { key: "sot", title: "Shots on Target" },
  { key: "fouls", title: "Fouls" },
  { key: "goals", title: "Goals" },
  { key: "other", title: "Other player props" },
];

/** Factors that attach beside a market accordion title. */
const FACTORS_BY_MARKET: Partial<Record<PropMarketKey, FixtureFactorId[]>> = {
  cards: ["disciplinary_storm", "relegation_fight"],
  fouls: ["disciplinary_storm"],
  goals: ["form_clash", "fatigue_disparity", "relegation_fight"],
};

function byEdge(left: PropBoardRow, right: PropBoardRow) {
  return (
    (right.edgePct ?? Number.NEGATIVE_INFINITY) - (left.edgePct ?? Number.NEGATIVE_INFINITY) ||
    (right.modelProb ?? 0) - (left.modelProb ?? 0) ||
    (right.odd ?? 0) - (left.odd ?? 0)
  );
}

function propRowKey(fixtureId: number, row: PropBoardRow) {
  return `${fixtureId}:${row.marketKey}:${row.playerId}:${row.line ?? "na"}:${row.market}:${row.odd ?? "null"}`;
}

/**
 * Match Hub multi-market prop board — defaults to edge radar, not market grids.
 */
export function HubCardBoard({
  rows,
  home,
  away,
  fixtureId,
  factors = [],
  unlocked = false,
}: {
  rows: PropBoardRow[];
  home: string;
  away: string;
  fixtureId: number;
  factors?: FactorEvaluation[];
  unlocked?: boolean;
}) {
  const [boardMode, setBoardMode] = useState<"edge" | "market" | "no-model">("edge");

  const modeledRows = useMemo(() => rows.filter((row) => hasActivePropModel(row.modelProb)), [rows]);
  const noModelRows = useMemo(() => rows.filter((row) => !hasActivePropModel(row.modelProb)), [rows]);
  const byEdgeRows = useMemo(() => [...modeledRows].sort(byEdge), [modeledRows]);

  const grouped = useMemo(() => {
    const map = new Map<PropMarketKey, PropBoardRow[]>();
    for (const section of MARKET_SECTIONS) map.set(section.key, []);
    for (const row of modeledRows) {
      const bucket = map.get(row.marketKey) ?? map.get("other")!;
      bucket.push(row);
    }
    for (const bucket of map.values()) bucket.sort(byEdge);

    return MARKET_SECTIONS.map((section) => ({
      ...section,
      rows: map.get(section.key) ?? [],
    })).filter((section) => section.rows.length > 0);
  }, [modeledRows]);

  const triggeredById = useMemo(() => {
    const map = new Map<FixtureFactorId, FactorEvaluation>();
    for (const evaluation of factors) {
      if (evaluation.matched) map.set(evaluation.factor.id, evaluation);
    }
    return map;
  }, [factors]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[var(--neon)] uppercase">
            Full board · edge radar
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--ink)]">Model-backed player props</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {home} vs {away} · standard Bet365 lines only · {modeledRows.length} modeled / {noModelRows.length} unmodeled
          </p>
        </div>
        <div className="flex rounded-full border border-[var(--line)] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setBoardMode("edge")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              boardMode === "edge" ? "bg-[#2563eb] text-white" : "text-[var(--muted)]"
            }`}
          >
            By +Edge%
          </button>
          <button
            type="button"
            onClick={() => setBoardMode("market")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              boardMode === "market" ? "bg-[#2563eb] text-white" : "text-[var(--muted)]"
            }`}
          >
            By market
          </button>
          {noModelRows.length > 0 ? (
            <button
              type="button"
              onClick={() => setBoardMode("no-model")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                boardMode === "no-model" ? "bg-[#64748b] text-white" : "text-[var(--muted)]"
              }`}
            >
              No model ({noModelRows.length})
            </button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyReason
          variant="center"
          title="No Book Odds"
          detail="No standard player prop lines are stored for this fixture"
          source="prematch_odds"
        />
      ) : boardMode === "edge" && byEdgeRows.length === 0 ? (
        <EmptyReason
          variant="center"
          title="No Model-Backed Props"
          detail="Book prices exist, but no active Poisson probabilities are stored; use the No model filter to inspect them"
          source="prematch_odds.model_prob"
        />
      ) : boardMode === "edge" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {byEdgeRows.map((row) => (
            <PropCard
              key={propRowKey(fixtureId, row)}
              row={row}
              fixtureId={fixtureId}
              unlocked={unlocked}
            />
          ))}
        </ul>
      ) : boardMode === "no-model" ? (
        <div>
          <p className="mb-3 rounded-xl border border-[#e2e8f0] bg-[#eef3f9] px-3 py-2 text-xs font-semibold text-[#64748b]">
            Book prices only — these selections have no active Poisson model and are excluded from the edge board.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {noModelRows.map((row) => (
              <PropCard key={propRowKey(fixtureId, row)} row={row} fixtureId={fixtureId} unlocked={unlocked} />
            ))}
          </ul>
        </div>
      ) : (
        grouped.map((section) => {
          const factorIds = FACTORS_BY_MARKET[section.key] ?? [];
          const badges = factorIds
            .map((id) => triggeredById.get(id))
            .filter((evaluation): evaluation is FactorEvaluation => evaluation != null);
          return (
            <MarketAccordion
              key={section.key}
              id={`hub-market-${section.key}`}
              title={section.title}
              count={section.rows.length}
              defaultOpen={section.key !== "other"}
              badges={
                badges.length > 0 ? (
                  <PremiumPaywall
                    unlocked={unlocked}
                    tease="Unlock Fixture Factors on this market"
                    className="inline-flex max-w-full"
                  >
                    <span className="flex flex-wrap gap-1.5">
                      {badges.map((evaluation) => (
                        <FactorBadge key={evaluation.factor.id} evaluation={evaluation} />
                      ))}
                    </span>
                  </PremiumPaywall>
                ) : undefined
              }
            >
              <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.rows.map((row) => (
                  <PropCard
                    key={propRowKey(fixtureId, row)}
                    row={row}
                    fixtureId={fixtureId}
                    unlocked={unlocked}
                  />
                ))}
              </ul>
            </MarketAccordion>
          );
        })
      )}
    </section>
  );
}
