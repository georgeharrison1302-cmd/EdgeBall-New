"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/assets";
import type { PlayerProp } from "@/components/PlayerPropsBuilder";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { FormDots } from "@/components/stats/FormDots";
import { PoissonVsBook } from "@/components/stats/PoissonVsBook";
import { isPriced } from "@/components/stats/types";
import { hunterRows, propEdge } from "@/lib/stats/prop-hunter";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";

const EDGE_FILTERS = [
  { id: "any", label: "Any +Edge", min: 0 },
  { id: "5", label: "+5%", min: 5 },
  { id: "10", label: "+10%", min: 10 },
  { id: "20", label: "+20%", min: 20 },
] as const;

/**
 * Prop Hunter — every stored book price with a positive model edge,
 * ranked best-first across today's fixtures.
 */
export function PropHunterBoard({ props }: { props: PlayerProp[] }) {
  const [market, setMarket] = useState<string>("all");
  const [minEdge, setMinEdge] = useState(0);

  const ranked = useMemo(() => hunterRows(props), [props]);
  const markets = useMemo(
    () => [...new Set(ranked.map((prop) => prop.market))],
    [ranked],
  );

  const rows = ranked.filter((prop) => {
    if (market !== "all" && prop.market !== market) return false;
    return (propEdge(prop) ?? 0) >= minEdge;
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={market === "all"} onClick={() => setMarket("all")}>
          All markets · {ranked.length}
        </FilterChip>
        {markets.map((name) => (
          <FilterChip
            key={name}
            active={market === name}
            onClick={() => setMarket(name)}
          >
            {name} · {ranked.filter((prop) => prop.market === name).length}
          </FilterChip>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        {EDGE_FILTERS.map((filter) => (
          <FilterChip
            key={filter.id}
            active={minEdge === filter.min}
            onClick={() => setMinEdge(filter.min)}
          >
            {filter.label}
          </FilterChip>
        ))}
      </div>

      {ranked.length === 0 ? (
        <EmptyReason
          title="No Book Odds"
          detail="No priced player props with a positive model edge are stored for today's fixtures"
          source="prematch_odds + model"
        />
      ) : rows.length === 0 ? (
        <EmptyReason
          title="No edges above filter"
          detail={`No stored props clear +${minEdge}% edge in this market`}
          source="prematch_odds + model"
        />
      ) : (
        <ol className="space-y-2">
          {rows.map((prop, index) => (
            <HunterRow key={`${prop.id}:${index}`} prop={prop} rank={index + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function HunterRow({ prop, rank }: { prop: PlayerProp; rank: number }) {
  const edge = propEdge(prop) ?? 0;
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

  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cobalt text-xs font-black text-white">
          {rank}
        </span>
        <PlayerHeadshot
          src={prop.playerImg}
          playerId={prop.playerId}
          playerName={prop.player}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{prop.player}</p>
          <p className="truncate text-xs text-muted">
            <Link
              href={prop.fixtureId ? `/fixtures/${prop.fixtureId}` : "/"}
              className="hover:text-cobalt"
            >
              {prop.match}
            </Link>
            {" · "}
            {prop.competition}
          </p>
        </div>
        <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-extrabold text-cobalt">
          {prop.selection}
        </span>
        <span className="rounded-full bg-[#ecfeff] px-2.5 py-1 text-[11px] font-extrabold text-[#0e7490]">
          +{edge.toFixed(1)}% edge
        </span>
        <AddToSlipButton
          selectionId={prop.id}
          marketName={`${prop.player} ${prop.selection}`}
          decimalOdds={prop.odds}
          label={isPriced(prop.odds) ? `@ ${prop.odds.toFixed(2)}` : undefined}
          match={prop.match}
          player={prop.player}
          fixtureId={prop.fixtureId ?? undefined}
          marketKind={classified.marketKind}
          line={classified.line}
          size="lg"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-dashed border-line pt-3">
        <PoissonVsBook
          modelProb={prop.modelProb}
          decimalOdds={prop.odds}
          edgePct={prop.edgePct ?? prop.edgeScore}
        />
        <div>
          <p className="mb-1 text-[10px] font-extrabold tracking-wide text-faint uppercase">
            Last {prop.formCounts?.length ?? 0} at {prop.formThreshold ?? prop.line ?? 1}+
          </p>
          <FormDots
            counts={prop.formCounts ?? []}
            threshold={prop.formThreshold ?? prop.line ?? 1}
          />
        </div>
      </div>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-cobalt bg-cobalt text-white"
          : "border-line bg-white text-ink hover:border-cobalt"
      }`}
    >
      {children}
    </button>
  );
}
