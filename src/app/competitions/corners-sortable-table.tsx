"use client";

import { useMemo } from "react";

import {
  LabeledTh,
  SortableTh,
  useColumnSort,
} from "@/components/stats/SortableStatHeader";

const LINES = [3.5, 4.5, 5.5, 6.5, 7.5] as const;

export type CornerTableRow = {
  teamId: number;
  team: string;
  logo: string | null;
  last5: number[];
  rates: Record<number, number>;
  average: number;
  nextOpponent: string | null;
};

type SortKey = "avg" | "3.5" | "4.5" | "5.5" | "6.5" | "7.5";

export function CornersSortableTable({ rows }: { rows: CornerTableRow[] }) {
  const { sortKey, sortDir, toggle } = useColumnSort<SortKey>("avg", "desc");
  const sorted = useMemo(() => {
    if (sortKey == null) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = sortKey === "avg" ? left.average : left.rates[Number(sortKey)];
      const b = sortKey === "avg" ? right.average : right.rates[Number(sortKey)];
      if (a == null && b == null) return left.team.localeCompare(right.team);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a !== b) return (a - b) * dir;
      return left.team.localeCompare(right.team);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead>
          <tr>
            <LabeledTh label="#" fullName="Rank" />
            <LabeledTh label="Team" />
            <LabeledTh label="Last 5" fullName="Last five match corner totals" />
            {LINES.map((line) => (
              <SortableTh
                key={line}
                label={`${line}+`}
                fullName={`Share of matches with ${line}+ corners`}
                active={sortKey === String(line)}
                dir={sortDir}
                onSort={() => toggle(String(line) as SortKey)}
              />
            ))}
            <SortableTh
              label="Avg"
              fullName="Average corners per match"
              active={sortKey === "avg"}
              dir={sortDir}
              onSort={() => toggle("avg")}
            />
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
                    <img src={row.logo} alt="" className="h-5 w-5 object-contain" />
                  ) : null}
                  {row.team}
                </span>
              </td>
              <td className="py-2">
                <span className="flex gap-1">
                  {row.last5.map((value, box) => (
                    <span
                      key={`${row.teamId}-${box}`}
                      title={`${value} corners`}
                      className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${
                        value >= 6
                          ? "bg-green-100 text-green-800"
                          : value >= 4
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {value}
                    </span>
                  ))}
                </span>
              </td>
              {LINES.map((line) => (
                <td key={line} className="py-2 text-right">
                  {row.rates[line] == null ? "–" : `${row.rates[line]}%`}
                </td>
              ))}
              <td className="py-2 text-right font-semibold text-blue-700">
                {row.average == null ? "–" : row.average.toFixed(1)}
              </td>
              <td className="py-2 text-gray-500">{row.nextOpponent ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
