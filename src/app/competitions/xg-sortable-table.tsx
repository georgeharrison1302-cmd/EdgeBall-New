"use client";

import { useMemo } from "react";

import {
  LabeledTh,
  SortableTh,
  useColumnSort,
} from "@/components/stats/SortableStatHeader";

import { Form } from "./ui";

export type XgTableRow = {
  teamId: number;
  team: string;
  logo: string | null;
  rank: number | null;
  form: string | null;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  xg: number | null;
  xga: number | null;
  goalGap: number | null;
  concedeGap: number | null;
  gd: number;
  xgd: number | null;
  gdGap: number | null;
  points: number | null;
};

type SortKey =
  | "gf"
  | "xg"
  | "goalGap"
  | "ga"
  | "xga"
  | "concedeGap"
  | "gd"
  | "xgd"
  | "gdGap"
  | "pts";

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  fullName: string;
  preferAsc?: boolean;
}> = [
  { key: "gf", label: "GF", fullName: "Goals for" },
  { key: "xg", label: "xG", fullName: "Expected goals" },
  { key: "goalGap", label: "+/−", fullName: "Goals for minus expected goals" },
  { key: "ga", label: "GA", fullName: "Goals against", preferAsc: true },
  { key: "xga", label: "xGA", fullName: "Expected goals against", preferAsc: true },
  {
    key: "concedeGap",
    label: "+/−",
    fullName: "Goals against minus expected goals against",
  },
  { key: "gd", label: "GD", fullName: "Goal difference" },
  { key: "xgd", label: "xGD", fullName: "Expected goal difference" },
  {
    key: "gdGap",
    label: "+/−",
    fullName: "Goal difference minus expected goal difference",
  },
  { key: "pts", label: "Pts", fullName: "Points" },
];

function valueOf(row: XgTableRow, key: SortKey): number | null {
  switch (key) {
    case "gf":
      return row.goalsFor;
    case "xg":
      return row.xg;
    case "goalGap":
      return row.goalGap;
    case "ga":
      return row.goalsAgainst;
    case "xga":
      return row.xga;
    case "concedeGap":
      return row.concedeGap;
    case "gd":
      return row.gd;
    case "xgd":
      return row.xgd;
    case "gdGap":
      return row.gdGap;
    case "pts":
      return row.points;
  }
}

export function XgSortableTable({
  rows,
  split,
}: {
  rows: XgTableRow[];
  split: "overall" | "home" | "away" | "last5";
}) {
  const { sortKey, sortDir, toggle } = useColumnSort<SortKey>(null, "desc");

  const sorted = useMemo(() => {
    if (sortKey == null) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = valueOf(left, sortKey);
      const b = valueOf(right, sortKey);
      if (a == null && b == null) return (left.rank ?? 99) - (right.rank ?? 99);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a !== b) return (a - b) * dir;
      return (left.rank ?? 99) - (right.rank ?? 99);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr>
            <LabeledTh label="#" fullName="Rank in this view" className="pr-2" />
            <LabeledTh label="Team" />
            <LabeledTh label="P" fullName="Played (matches)" align="right" />
            <LabeledTh label="Form" fullName="Recent form (last five results)" />
            {COLUMNS.map((column) => (
              <SortableTh
                key={column.key}
                label={column.label}
                fullName={column.fullName}
                active={sortKey === column.key}
                dir={sortDir}
                onSort={() => toggle(column.key, column.preferAsc)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={row.teamId} className="border-t border-[#f1f5f9]">
              <td className="py-2 pr-2 font-semibold text-ink">
                {sortKey == null && row.rank != null && split === "overall" ? row.rank : index + 1}
              </td>
              <td className="py-2">
                <span className="flex items-center gap-2 font-medium text-ink">
                  {row.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={row.logo} alt="" className="h-5 w-5 object-contain" />
                  ) : null}
                  {row.team}
                </span>
              </td>
              <td className="py-2 text-right">{row.played}</td>
              <td className="py-2">
                <Form value={row.form} />
              </td>
              <td className="py-2 text-right">{count(row.goalsFor)}</td>
              <td className="py-2 text-right font-semibold text-cobalt">{fixed(row.xg, 1)}</td>
              <td className="py-2 text-right">{signed(row.goalGap, 1)}</td>
              <td className="py-2 text-right">{count(row.goalsAgainst)}</td>
              <td className="py-2 text-right font-semibold text-cobalt">{fixed(row.xga, 1)}</td>
              <td className="py-2 text-right">{signed(row.concedeGap, 1)}</td>
              <td className="py-2 text-right">{signed(row.gd, 0)}</td>
              <td className="py-2 text-right font-semibold text-cobalt">{signed(row.xgd, 1)}</td>
              <td className="py-2 text-right">{signed(row.gdGap, 1)}</td>
              <td className="py-2 text-right font-semibold">{row.points ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signed(value: number | null, digits: number) {
  if (value == null || Number.isNaN(value)) return "–";
  const text = `${value > 0 ? "+" : ""}${digits === 0 ? Math.round(value) : value.toFixed(digits)}`;
  const tone = value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500";
  return <span className={`font-semibold ${tone}`}>{text}</span>;
}

function fixed(value: number | null, digits: number) {
  return value == null || Number.isNaN(value) ? "–" : value.toFixed(digits);
}

function count(value: number | null) {
  return value == null ? "–" : String(value);
}
