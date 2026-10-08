"use client";

import { useMemo } from "react";

import {
  LabeledTh,
  SortableTh,
  useColumnSort,
} from "@/components/stats/SortableStatHeader";
import { ExportCsvButton } from "@/components/ui/TableToolbar";
import type { CsvColumn } from "@/lib/csv";

const LINES = [1.5, 2.5, 3.5] as const;

export type GoalTableRow = {
  teamId: number;
  team: string;
  logo: string | null;
  played: number;
  gfAvg: number;
  gaAvg: number;
  last5: number[];
  rates: Record<number, number>;
  bttsPct: number;
  cleanSheetPct: number;
  failedToScorePct: number;
  nextOpponent: string | null;
};

type SortKey =
  | "gf"
  | "ga"
  | "1.5"
  | "2.5"
  | "3.5"
  | "btts"
  | "cs"
  | "fts";

export function GoalsSortableTable({ rows }: { rows: GoalTableRow[] }) {
  const { sortKey, sortDir, toggle } = useColumnSort<SortKey>("2.5", "desc");
  const sorted = useMemo(() => {
    if (sortKey == null) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    const value = (row: GoalTableRow): number | null => {
      if (sortKey === "gf") return row.gfAvg;
      if (sortKey === "ga") return row.gaAvg;
      if (sortKey === "btts") return row.bttsPct;
      if (sortKey === "cs") return row.cleanSheetPct;
      if (sortKey === "fts") return row.failedToScorePct;
      return row.rates[Number(sortKey)];
    };
    return [...rows].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      if (a == null && b == null) return left.team.localeCompare(right.team);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a !== b) return (a - b) * dir;
      return left.team.localeCompare(right.team);
    });
  }, [rows, sortKey, sortDir]);

  const csvColumns: CsvColumn<GoalTableRow>[] = [
    { header: "Team", value: (row) => row.team },
    { header: "Played", value: (row) => row.played },
    { header: "GF per game", value: (row) => row.gfAvg.toFixed(2) },
    { header: "GA per game", value: (row) => row.gaAvg.toFixed(2) },
    ...LINES.map((line): CsvColumn<GoalTableRow> => ({
      header: `Over ${line} %`,
      value: (row) => row.rates[line] ?? null,
    })),
    { header: "BTTS %", value: (row) => row.bttsPct },
    { header: "Clean sheet %", value: (row) => row.cleanSheetPct },
    { header: "Failed to score %", value: (row) => row.failedToScorePct },
    { header: "Last 5 total goals", value: (row) => row.last5.join(" ") },
    { header: "Next opponent", value: (row) => row.nextOpponent },
  ];

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="mb-2 flex justify-end">
        <ExportCsvButton filename="edgeball-goal-stats.csv" columns={csvColumns} rows={sorted} />
      </div>
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr>
            <LabeledTh label="#" fullName="Rank" />
            <LabeledTh label="Team" />
            <LabeledTh label="P" fullName="Matches counted" />
            <SortableTh label="GF/g" fullName="Goals scored per match" active={sortKey === "gf"} dir={sortDir} onSort={() => toggle("gf")} />
            <SortableTh label="GA/g" fullName="Goals conceded per match" active={sortKey === "ga"} dir={sortDir} onSort={() => toggle("ga", true)} />
            {LINES.map((line) => (
              <SortableTh
                key={line}
                label={`O${line}`}
                fullName={`Share of matches finishing over ${line} total goals`}
                active={sortKey === String(line)}
                dir={sortDir}
                onSort={() => toggle(String(line) as SortKey)}
              />
            ))}
            <SortableTh label="BTTS" fullName="Both teams scored share" active={sortKey === "btts"} dir={sortDir} onSort={() => toggle("btts")} />
            <SortableTh label="CS" fullName="Clean sheet share" active={sortKey === "cs"} dir={sortDir} onSort={() => toggle("cs")} />
            <SortableTh label="FTS" fullName="Failed to score share" active={sortKey === "fts"} dir={sortDir} onSort={() => toggle("fts")} />
            <LabeledTh label="Last 5" fullName="Total goals in the last five matches" />
            <LabeledTh label="Next" fullName="Next opponent" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={row.teamId} className="border-t border-gray-100">
              <td className="py-2 font-semibold">{index + 1}</td>
              <td className="py-2">
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  {row.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={row.logo} alt="" className="h-5 w-5 object-contain" />
                  ) : null}
                  {row.team}
                </span>
              </td>
              <td className="py-2 text-right">{row.played}</td>
              <td className="py-2 text-right font-semibold text-blue-700">{row.gfAvg.toFixed(2)}</td>
              <td className="py-2 text-right">{row.gaAvg.toFixed(2)}</td>
              {LINES.map((line) => (
                <td key={line} className="py-2 text-right">
                  {row.rates[line] == null ? "–" : `${row.rates[line]}%`}
                </td>
              ))}
              <td className="py-2 text-right">{row.bttsPct}%</td>
              <td className="py-2 text-right">{row.cleanSheetPct}%</td>
              <td className="py-2 text-right">{row.failedToScorePct}%</td>
              <td className="py-2">
                <span className="flex gap-1">
                  {row.last5.map((value, box) => (
                    <span
                      key={`${row.teamId}-${box}`}
                      title={`${value} total goals`}
                      className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${
                        value >= 3
                          ? "bg-green-100 text-green-800"
                          : value >= 2
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {value}
                    </span>
                  ))}
                </span>
              </td>
              <td className="py-2 text-gray-500">{row.nextOpponent ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
