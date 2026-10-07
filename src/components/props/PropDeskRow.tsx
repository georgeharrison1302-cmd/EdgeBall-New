"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import {
  bestBookOdds,
  defaultLineForStat,
  deskFormMetrics,
  edgePct,
  halfLineToThreshold,
  linesForStat,
  type DeskHalfLine,
  type DeskPlayerRow,
  type DeskSplit,
  type DeskStat,
} from "@/lib/stats/prop-desk";

import { EdgeBadge } from "./EdgeBadge";
import { FormStripInteractive } from "./FormStripInteractive";
import { LineToggle } from "./LineToggle";
import { PlayerRowDrawer } from "./PlayerRowDrawer";
import { StatChipSelector } from "./StatChipSelector";

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PropDeskRow({
  row,
  split,
  open,
  onToggle,
}: {
  row: DeskPlayerRow;
  split: DeskSplit;
  open: boolean;
  onToggle: () => void;
}) {
  const [selectedStat, setSelectedStat] = useState<DeskStat>(row.defaultStat);
  const [line, setLine] = useState<DeskHalfLine>(() => defaultLineForStat(row.defaultStat));

  const threshold = halfLineToThreshold(line);
  const lineOptions = linesForStat(selectedStat);
  const seasonAvg = row.seasonAvgByStat[selectedStat] ?? null;
  const modelProb = row.modelProbByStat[selectedStat] ?? null;
  const oddsByLine = row.oddsByStatLine[selectedStat] ?? {};

  const metrics = useMemo(
    () => deskFormMetrics(row.logs, selectedStat, threshold, split, seasonAvg),
    [row.logs, selectedStat, threshold, split, seasonAvg],
  );

  const quotes = oddsByLine[threshold] ?? [];
  const bestOdds = bestBookOdds(quotes);
  const edge = edgePct(modelProb, bestOdds);
  const pricedThresholds = lineOptions
    .map((half) => halfLineToThreshold(half))
    .filter((t) => bestBookOdds(oddsByLine[t]) != null);

  function selectStat(stat: DeskStat) {
    setSelectedStat(stat);
    setLine(defaultLineForStat(stat));
  }

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-[#f1f5f9] hover:bg-[#f8fafc] ${open ? "bg-[#eff6ff]" : "bg-white"}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <td className="px-3 py-3 align-middle">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dbeafe] text-[11px] font-extrabold text-[#2563eb]">
              {row.initials}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-extrabold text-[#0f172a]">
                  {row.player}
                  {row.position ? (
                    <span className="ml-1.5 rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[10px] font-extrabold text-[#64748b]">
                      {row.position}
                    </span>
                  ) : null}
                </p>
                <LineToggle
                  value={line}
                  onChange={setLine}
                  lines={lineOptions}
                  pricedThresholds={pricedThresholds}
                />
              </div>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#64748b]">
                {row.match} · {row.kickoffLabel}
              </p>
              <StatChipSelector value={selectedStat} onChange={selectStat} />
              {row.matchupRank ? (
                <p className="mt-1.5 inline-flex rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {row.matchupRank}
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] font-semibold text-[#94a3b8]">
                  Matchup rank not stored
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-middle">
          {metrics.hitPct != null ? (
            <div className="min-w-[88px]">
              <p className="text-sm font-extrabold text-[#0f172a]">{metrics.hitPct}%</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${metrics.hitPct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-[#94a3b8]">
              {split === "Season" ? "Season rate only" : "No match logs stored"}
            </p>
          )}
        </td>
        <td className="px-3 py-3 text-right align-middle text-sm font-bold tabular-nums text-[#0f172a]">
          {metrics.total ?? "—"}
        </td>
        <td className="px-3 py-3 text-right align-middle text-sm font-bold tabular-nums text-[#0f172a]">
          {metrics.avg != null ? metrics.avg.toFixed(2) : "—"}
        </td>
        <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
          {split === "Season" ? (
            <p className="text-[11px] font-semibold text-[#94a3b8]">
              Season avg {seasonAvg?.toFixed(2) ?? "—"} (player_season_stats)
            </p>
          ) : (
            <FormStripInteractive
              games={metrics.games}
              counts={metrics.counts}
              threshold={threshold}
              stat={selectedStat}
            />
          )}
        </td>
        <td className="px-3 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center justify-end gap-1.5">
            {bestOdds != null ? (
              <button
                type="button"
                className="rounded-full bg-[#2563eb] px-3 py-1.5 text-xs font-extrabold text-white"
              >
                @ {bestOdds.toFixed(2)}
              </button>
            ) : (
              <span className="inline-flex rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#64748b]">
                No Book Odds
              </span>
            )}
            <button
              type="button"
              aria-label={open ? `Collapse ${row.player}` : `Expand ${row.player}`}
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e2e8f0] text-[#64748b] transition-colors ${
                open ? "bg-[#2563eb] text-white border-[#2563eb]" : "bg-white hover:bg-[#f8fafc]"
              }`}
            >
              <ChevronDown open={open} />
            </button>
          </div>
        </td>
        <td className="px-3 py-3 text-right align-middle">
          <EdgeBadge edgePct={edge} />
        </td>
      </tr>
      <tr>
        <td colSpan={7} className="p-0">
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="drawer"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <PlayerRowDrawer
                  row={row}
                  selectedStat={selectedStat}
                  seasonAvg={seasonAvg}
                  modelProb={modelProb}
                  split={split}
                  threshold={threshold}
                  bestOdds={bestOdds}
                  edge={edge}
                  quotes={quotes}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </td>
      </tr>
    </>
  );
}
