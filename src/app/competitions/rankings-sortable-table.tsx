"use client";

import { useMemo } from "react";

import {
  LabeledTh,
  SortableTh,
  useColumnSort,
} from "@/components/stats/SortableStatHeader";

import { Form } from "./ui";

export type RankingRow = {
  teamId: number;
  team: string;
  logo: string | null;
  rank: number | null;
  form: string | null;
  attack: number;
  defence: number;
  overall: number;
  trend: number[];
  change: number | null;
};

type SortKey = "pos" | "attack" | "defence" | "overall" | "change";

export function RankingsSortableTable({ rows }: { rows: RankingRow[] }) {
  const { sortKey, sortDir, toggle } = useColumnSort<SortKey>("overall", "desc");
  const sorted = useMemo(() => {
    if (sortKey == null) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a =
        sortKey === "pos"
          ? left.rank
          : sortKey === "attack"
            ? left.attack
            : sortKey === "defence"
              ? left.defence
              : sortKey === "change"
                ? left.change
                : left.overall;
      const b =
        sortKey === "pos"
          ? right.rank
          : sortKey === "attack"
            ? right.attack
            : sortKey === "defence"
              ? right.defence
              : sortKey === "change"
                ? right.change
                : right.overall;
      if (a == null && b == null) return left.team.localeCompare(right.team);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a !== b) return (a - b) * dir;
      return left.team.localeCompare(right.team);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-10" />
          <col className="w-10" />
          <col />
          <col className="w-[7.5rem]" />
          <col className="w-[4.5rem]" />
          <col className="w-[4.5rem]" />
          <col className="w-[4.5rem]" />
          <col className="w-[4.5rem]" />
          <col className="w-[4.5rem]" />
        </colgroup>
        <thead>
          <tr>
            <LabeledTh label="#" fullName="Power ranking position" className="px-2" />
            <SortableTh
              label="Pos"
              fullName="League table position"
              active={sortKey === "pos"}
              dir={sortDir}
              onSort={() => toggle("pos", true)}
              align="left"
              className="px-2"
            />
            <LabeledTh label="Team" className="px-2" />
            <LabeledTh label="Form" fullName="Recent form (last five results)" className="px-2" />
            <SortableTh
              label="Attack"
              fullName="Attack — expected goals for per game"
              active={sortKey === "attack"}
              dir={sortDir}
              onSort={() => toggle("attack")}
              className="px-2"
            />
            <SortableTh
              label="Defence"
              fullName="Defence — expected goals against per game"
              active={sortKey === "defence"}
              dir={sortDir}
              onSort={() => toggle("defence", true)}
              className="px-2"
            />
            <SortableTh
              label="Overall"
              fullName="Overall — attack minus defence (xG differential)"
              active={sortKey === "overall"}
              dir={sortDir}
              onSort={() => toggle("overall")}
              className="px-2"
            />
            <LabeledTh
              label="Trend"
              fullName="Recent xG differential trend"
              align="right"
              className="px-2"
            />
            <SortableTh
              label="Change"
              fullName="Change versus season overall differential"
              active={sortKey === "change"}
              dir={sortDir}
              onSort={() => toggle("change")}
              className="px-2"
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={row.teamId} className="border-t border-gray-100">
              <td className="px-2 py-2 font-semibold tabular-nums text-slate-900">{index + 1}</td>
              <td className="px-2 py-2 tabular-nums text-gray-500">{row.rank ?? "–"}</td>
              <td className="truncate px-2 py-2">
                <span className="flex min-w-0 items-center gap-2 font-medium text-slate-900">
                  {row.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
                  ) : null}
                  <span className="truncate">{row.team}</span>
                </span>
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                <Form value={row.form} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{row.attack.toFixed(2)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{row.defence.toFixed(2)}</td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">
                {signed(row.overall, 2)}
              </td>
              <td className="px-2 py-2 text-right">
                <span className="inline-flex justify-end">
                  <Trend values={row.trend} />
                </span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{signed(row.change, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signed(value: number | null, digits: number) {
  if (value == null || Number.isNaN(value)) return "–";
  const text = `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  const tone = value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500";
  return <span className={`font-semibold ${tone}`}>{text}</span>;
}

function Trend({ values }: { values: number[] }) {
  if (values.length === 0) return <span className="text-[#94a3b8]">–</span>;
  return (
    <span className="inline-flex items-end gap-0.5">
      {values.map((value, index) => (
        <span
          key={index}
          title={value.toFixed(2)}
          className={`inline-block w-1.5 rounded-sm ${value >= 0 ? "bg-emerald-500" : "bg-rose-400"}`}
          style={{ height: `${Math.min(18, 6 + Math.abs(value) * 4)}px` }}
        />
      ))}
    </span>
  );
}
