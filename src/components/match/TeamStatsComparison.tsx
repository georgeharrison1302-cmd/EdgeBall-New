"use client";

import { useState } from "react";

import { TeamLogo } from "@/components/TeamLogo";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { SplitKey, TeamPanel } from "@/lib/stats/match-stats";
import type { Average, Rate, TeamStatSummary } from "@/lib/stats/team-engine";

import { RESULT_STYLE, formatAverage } from "./format";

type Cell = { kind: "rate"; rate: Rate } | { kind: "avg"; average: Average; digits?: number };
type Row = { label: string; cell: (summary: TeamStatSummary) => Cell };
type Section = { title: string; sheet?: boolean; rows: Row[] };

const rate = (pick: (summary: TeamStatSummary) => Rate) => (summary: TeamStatSummary): Cell => ({
  kind: "rate",
  rate: pick(summary),
});
const avg =
  (pick: (summary: TeamStatSummary) => Average, digits?: number) =>
  (summary: TeamStatSummary): Cell => ({ kind: "avg", average: pick(summary), digits });

const SECTIONS: Section[] = [
  {
    title: "Goals",
    rows: [
      { label: "Scored / game", cell: avg((s) => s.goals.forAvg) },
      { label: "Conceded / game", cell: avg((s) => s.goals.againstAvg) },
      { label: "Match goals / game", cell: avg((s) => s.goals.matchAvg) },
      { label: "BTTS", cell: rate((s) => s.goals.btts) },
      { label: "Over 1.5 goals", cell: rate((s) => s.goals.over["1.5"]) },
      { label: "Over 2.5 goals", cell: rate((s) => s.goals.over["2.5"]) },
      { label: "Over 3.5 goals", cell: rate((s) => s.goals.over["3.5"]) },
      { label: "Clean sheet", cell: rate((s) => s.goals.cleanSheet) },
      { label: "Failed to score", cell: rate((s) => s.goals.failedToScore) },
      { label: "1st half over 0.5", cell: rate((s) => s.goals.htOver["0.5"]) },
    ],
  },
  {
    title: "Corners",
    sheet: true,
    rows: [
      { label: "Corners won / game", cell: avg((s) => s.sheets.cornersFor, 1) },
      { label: "Match corners / game", cell: avg((s) => s.sheets.cornersMatch, 1) },
      { label: "Over 8.5 corners", cell: rate((s) => s.sheets.cornersOver["8.5"]) },
      { label: "Over 9.5 corners", cell: rate((s) => s.sheets.cornersOver["9.5"]) },
      { label: "Over 10.5 corners", cell: rate((s) => s.sheets.cornersOver["10.5"]) },
    ],
  },
  {
    title: "Cards",
    sheet: true,
    rows: [
      { label: "Team cards / game", cell: avg((s) => s.sheets.cardsFor, 1) },
      { label: "Match cards / game", cell: avg((s) => s.sheets.cardsMatch, 1) },
      { label: "Over 3.5 match cards", cell: rate((s) => s.sheets.cardsOver["3.5"]) },
      { label: "Over 4.5 match cards", cell: rate((s) => s.sheets.cardsOver["4.5"]) },
    ],
  },
  {
    title: "Shots & xG",
    sheet: true,
    rows: [
      { label: "Shots / game", cell: avg((s) => s.sheets.shotsFor, 1) },
      { label: "Shots on target / game", cell: avg((s) => s.sheets.shotsOnTargetFor, 1) },
      { label: "xG for / game", cell: avg((s) => s.sheets.xgFor) },
      { label: "xG against / game", cell: avg((s) => s.sheets.xgAgainst) },
    ],
  },
];

const SPLITS: Array<{ key: SplitKey; label: string }> = [
  { key: "all", label: "Overall" },
  { key: "venue", label: "Home / Away" },
  { key: "last5", label: "Last 5" },
  { key: "last10", label: "Last 10" },
];

export function TeamStatsComparison({
  home,
  away,
  competition,
}: {
  home: TeamPanel;
  away: TeamPanel;
  competition: string;
}) {
  const [split, setSplit] = useState<SplitKey>("venue");
  const left = home.splits[split];
  const right = away.splits[split];
  const splitNote =
    split === "venue"
      ? `${home.team.name} at home · ${away.team.name} away`
      : split === "all"
        ? "All matches this season"
        : `Most recent ${split === "last5" ? 5 : 10} matches`;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">Team stats</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-ink">
              {competition} · {splitNote}
            </h2>
          </div>
          <div role="group" aria-label="Stats split" className="flex rounded-full border border-line bg-canvas p-0.5">
            {SPLITS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={split === option.key}
                onClick={() => setSplit(option.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  split === option.key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamHeading panel={home} summary={left} align="left" />
          <span className="text-xs font-bold text-faint">vs</span>
          <TeamHeading panel={away} summary={right} align="right" />
        </div>
      </header>

      {left.played === 0 && right.played === 0 ? (
        <EmptyReason
          className="p-5"
          variant="panel"
          detail={`No finished ${competition} matches stored for either side in this split`}
          source="fixtures"
        />
      ) : (
        <div className="divide-y divide-line">
          {SECTIONS.map((section) => (
            <StatSection key={section.title} section={section} left={left} right={right} />
          ))}
        </div>
      )}
    </section>
  );
}

function TeamHeading({ panel, summary, align }: { panel: TeamPanel; summary: TeamStatSummary; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo src={panel.team.logo} name={panel.team.name} size={36} />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-ink">{panel.team.name}</p>
        <p className="text-xs font-semibold text-muted">
          {summary.played === 0
            ? "No matches"
            : `${summary.wins}W ${summary.draws}D ${summary.losses}L · ${summary.ppg?.toFixed(2)} PPG`}
        </p>
        <div className={`mt-1 flex gap-1 ${align === "right" ? "justify-end" : ""}`}>
          {summary.form.slice(-5).map((result, index) => (
            <span
              key={`${index}-${result}`}
              className={`grid h-5 w-5 place-items-center rounded text-[10px] font-black ${RESULT_STYLE[result]}`}
            >
              {result}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatSection({ section, left, right }: { section: Section; left: TeamStatSummary; right: TeamStatSummary }) {
  const sampleLeft = section.sheet ? left.sheets.n : left.played;
  const sampleRight = section.sheet ? right.sheets.n : right.played;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-extrabold tracking-wide text-ink uppercase">{section.title}</h3>
        <p className="text-[11px] font-semibold text-faint">
          {section.sheet ? "Match stats stored" : "Matches"}: {sampleLeft} vs {sampleRight}
        </p>
      </div>
      {section.sheet && sampleLeft === 0 && sampleRight === 0 ? (
        <EmptyReason
          className="mt-2"
          detail={`${section.title} need match sheets, and none are stored for these matches yet`}
          source="fixture_statistics"
        />
      ) : (
        <ul className="mt-2 space-y-1">
          {section.rows.map((row) => (
            <StatRow key={row.label} label={row.label} left={row.cell(left)} right={row.cell(right)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StatRow({ label, left, right }: { label: string; left: Cell; right: Cell }) {
  const a = numeric(left);
  const b = numeric(right);
  const total = (a ?? 0) + (b ?? 0);
  const leftShare = a == null || b == null || total === 0 ? 50 : (a / total) * 100;
  const leader = a == null || b == null || a === b ? null : a > b ? "left" : "right";

  return (
    <li className="rounded-xl px-2 py-2 hover:bg-surface">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <CellValue cell={left} strong={leader === "left"} align="left" />
        <span className="text-center text-xs font-semibold text-muted">{label}</span>
        <CellValue cell={right} strong={leader === "right"} align="right" />
      </div>
      {a != null && b != null ? (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-canvas">
          <span
            className={leader === "left" ? "bg-cobalt" : "bg-[#cbd5e1]"}
            style={{ width: `${leftShare}%` }}
          />
          <span className={`flex-1 ${leader === "right" ? "bg-cobalt" : "bg-[#cbd5e1]"}`} />
        </div>
      ) : null}
    </li>
  );
}

function CellValue({ cell, strong, align }: { cell: Cell; strong: boolean; align: "left" | "right" }) {
  const tone = strong ? "text-cobalt" : "text-ink";
  if (cell.kind === "avg") {
    return (
      <span className={`text-sm font-black tabular-nums ${tone} ${align === "right" ? "text-right" : ""}`}>
        {formatAverage(cell.average, cell.digits)}
      </span>
    );
  }
  const { rate } = cell;
  return (
    <span className={`text-sm tabular-nums ${align === "right" ? "text-right" : ""}`}>
      {rate.pct == null ? (
        <span className="font-semibold text-faint">—</span>
      ) : (
        <>
          <span className={`font-black ${tone}`}>{Math.round(rate.pct)}%</span>{" "}
          <span className="text-xs font-semibold text-faint">
            ({rate.hits}/{rate.n})
          </span>
        </>
      )}
    </span>
  );
}

function numeric(cell: Cell) {
  return cell.kind === "rate" ? cell.rate.pct : cell.average.avg;
}
