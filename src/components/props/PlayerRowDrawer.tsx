"use client";

import { EmptyReason } from "@/components/stats/EmptyReason";
import {
  countForStat,
  statLabel,
  type DeskPlayerRow,
  type DeskSplit,
  type DeskStat,
} from "@/lib/stats/prop-desk";

/**
 * Expandable intelligence drawer for a Prop Desk player row.
 * Light-mode only — lineup, form split, Poisson vs book, tactical note.
 */
export function PlayerRowDrawer({
  row,
  selectedStat,
  seasonAvg,
  modelProb,
  split,
  threshold,
  bestOdds,
  edge,
  quotes,
}: {
  row: DeskPlayerRow;
  selectedStat: DeskStat;
  seasonAvg: number | null;
  modelProb: number | null;
  split: DeskSplit;
  threshold: number;
  bestOdds: number | null;
  edge: number | null;
  quotes: Array<{ bookmaker: string; decimalOdds: number | null }>;
}) {
  const splitGames =
    split === "Season"
      ? []
      : split === "H2H"
        ? row.logs.filter((g) => g.vsUpcomingOpponent)
        : row.logs.slice(0, split === "L5" ? 5 : split === "L10" ? 10 : 20);

  const counted = splitGames
    .map((g) => countForStat(g, selectedStat))
    .filter((v): v is number => v != null);
  const statSum = counted.reduce((sum, n) => sum + n, 0);
  const modelPct =
    modelProb != null && Number.isFinite(modelProb) ? modelProb * 100 : null;
  const bookPct =
    bestOdds != null && bestOdds > 1 ? (1 / bestOdds) * 100 : null;

  return (
    <div className="border-y border-[#e2e8f0] bg-[#f8fafc] px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DrawerBlock label="Lineup">
          {row.lineup?.kind === "starter" ? (
            <p className="flex items-start gap-2 text-[13px] font-semibold text-[#0f172a]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              Predicted to start {row.lineup.position}
            </p>
          ) : row.lineup?.kind === "alert" ? (
            <p className="flex items-start gap-2 text-[13px] font-semibold text-[#0f172a]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              Lineup Alert: {row.lineup.detail}
            </p>
          ) : (
            <p className="text-[12px] font-semibold text-[#64748b]">
              Lineup not stored yet (fixture_lineups).
            </p>
          )}
        </DrawerBlock>

        <DrawerBlock label="Split">
          {split === "Season" ? (
            <p className="text-[13px] font-semibold text-[#0f172a]">
              Season avg{" "}
              {seasonAvg != null ? seasonAvg.toFixed(2) : "—"} {statLabel(selectedStat)}
              {row.seasonApps != null ? ` · ${row.seasonApps} apps` : ""}
            </p>
          ) : counted.length === 0 ? (
            <p className="text-[12px] font-semibold text-[#64748b]">
              No {split} match logs stored (fixture_player_statistics).
            </p>
          ) : (
            <p className="text-[13px] font-semibold text-[#0f172a]">
              {statSum} {statLabel(selectedStat)} in last {counted.length} matches ({split}
              {row.competition ? ` · ${row.competition}` : ""})
            </p>
          )}
        </DrawerBlock>

        <DrawerBlock label="Model">
          {modelPct != null && bookPct != null ? (
            <p className="text-[13px] font-semibold text-[#0f172a]">
              Model: {modelPct.toFixed(0)}% · Book Implied: {bookPct.toFixed(0)}% (
              {edge != null && edge > 0 ? "+" : ""}
              {edge != null ? `${edge.toFixed(1)}%` : "—"} Edge)
            </p>
          ) : modelPct != null ? (
            <p className="text-[13px] font-semibold text-[#0f172a]">
              Model: {modelPct.toFixed(0)}% · Book Implied: not priced
            </p>
          ) : (
            <p className="text-[12px] font-semibold text-[#64748b]">
              Model / book edge not stored for this line.
            </p>
          )}
        </DrawerBlock>

        <DrawerBlock label="Tactical">
          {row.tacticalNote ? (
            <p className="inline-flex rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[12px] font-bold text-blue-900">
              {row.tacticalNote}
            </p>
          ) : row.matchupRank ? (
            <p className="inline-flex rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-800">
              {row.matchupRank}
            </p>
          ) : (
            <p className="text-[12px] font-semibold text-[#64748b]">
              No fixture factor stored for this matchup.
            </p>
          )}
        </DrawerBlock>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
            Books · {threshold}+ {statLabel(selectedStat)}
          </p>
          {quotes.length === 0 ? (
            <div className="mt-2">
              <EmptyReason
                detail="No player prop prices stored for this line"
                source="prematch_odds"
              />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[#e2e8f0] overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
              {["Bet365", "Paddy Power", "Sky Bet"].map((book) => {
                const quote = quotes.find((q) => q.bookmaker === book);
                const odd = quote?.decimalOdds ?? null;
                return (
                  <li
                    key={book}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                  >
                    <span className="font-semibold text-[#0f172a]">{book}</span>
                    {odd != null && odd > 1 ? (
                      <span className="font-extrabold tabular-nums text-[#2563eb]">
                        @ {odd.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-[#94a3b8]">
                        Not stored (prematch_odds)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
            Justification
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] font-semibold text-[#334155]">
            <li>
              <span className="font-extrabold text-[#0f172a]">Line: </span>
              {threshold}+ {statLabel(selectedStat)}
            </li>
            <li>
              <span className="font-extrabold text-[#0f172a]">Split: </span>
              {split === "Season"
                ? `Season avg ${seasonAvg?.toFixed(2) ?? "—"}`
                : counted.length > 0
                  ? `${statSum} total across ${counted.length} (${split})`
                  : `${split} empty`}
            </li>
            <li>
              <span className="font-extrabold text-[#0f172a]">Model: </span>
              {modelPct != null ? `${modelPct.toFixed(0)}%` : "not stored"}
              {bookPct != null ? ` · Book ${bookPct.toFixed(0)}%` : ""}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function DrawerBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5">
      <p className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
