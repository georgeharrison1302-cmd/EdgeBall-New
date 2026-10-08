"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { ColumnChooser, ExportCsvButton } from "@/components/ui/TableToolbar";

import type { RefereeDeskLeague, RefereeDeskRow } from "./load";

type SortKey =
  | "name"
  | "matches"
  | "avgYellows"
  | "avgReds"
  | "avgCards"
  | "over35Rate"
  | "over45Rate"
  | "avgFouls"
  | "vsAvgPct";

type Column = {
  key: SortKey;
  label: string;
  title: string;
  locked?: boolean;
  cell: (row: RefereeDeskRow) => ReactNode;
  csv: (row: RefereeDeskRow) => string | number | null;
};

const num = "px-3 py-2.5 tabular-nums text-slate-700";

const COLUMNS: Column[] = [
  {
    key: "name",
    label: "Referee",
    title: "Referee name (normalised)",
    locked: true,
    cell: (row) => <span className="font-semibold text-ink">{row.name}</span>,
    csv: (row) => row.name,
  },
  { key: "matches", label: "M", title: "Finished matches with a stored stats sheet", cell: (row) => row.matches, csv: (row) => row.matches },
  { key: "avgYellows", label: "Yel/g", title: "Average yellow cards per match", cell: (row) => row.avgYellows.toFixed(2), csv: (row) => row.avgYellows },
  { key: "avgReds", label: "Red/g", title: "Average red cards per match", cell: (row) => row.avgReds.toFixed(2), csv: (row) => row.avgReds },
  {
    key: "avgCards",
    label: "Cards/g",
    title: "Average total cards (yellow + red) per match",
    cell: (row) => <span className="font-semibold text-ink">{row.avgCards.toFixed(2)}</span>,
    csv: (row) => row.avgCards,
  },
  { key: "over35Rate", label: "O3.5%", title: "Share of matches finishing over 3.5 total cards", cell: (row) => `${row.over35Rate ?? "—"}%`, csv: (row) => row.over35Rate },
  { key: "over45Rate", label: "O4.5%", title: "Share of matches finishing over 4.5 total cards", cell: (row) => `${row.over45Rate ?? "—"}%`, csv: (row) => row.over45Rate },
  { key: "avgFouls", label: "Fouls/g", title: "Average total fouls per match", cell: (row) => row.avgFouls.toFixed(1), csv: (row) => row.avgFouls },
  {
    key: "vsAvgPct",
    label: "vs avg",
    title: "Cards per game versus the pool average",
    cell: (row) =>
      row.vsAvgPct == null ? (
        "—"
      ) : (
        <span className={row.vsAvgPct > 0 ? "font-semibold text-amber-700" : row.vsAvgPct < 0 ? "font-semibold text-emerald-700" : "text-slate-500"}>
          {row.vsAvgPct > 0 ? "+" : ""}
          {row.vsAvgPct}%
        </span>
      ),
    csv: (row) => row.vsAvgPct,
  },
];

function leanBadge(strictness: RefereeDeskRow["strictness"], vsAvgPct: number | null) {
  if (strictness === "strict")
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
        Strict {vsAvgPct != null ? `+${vsAvgPct}%` : ""}
      </span>
    );
  if (strictness === "lenient")
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        Lenient {vsAvgPct != null ? `${vsAvgPct}%` : ""}
      </span>
    );
  return <span className="text-[11px] text-slate-400">Average</span>;
}

export function RefereeDeskTable({
  rows,
  leagues,
  selectedLeague,
}: {
  rows: RefereeDeskRow[];
  leagues: RefereeDeskLeague[];
  selectedLeague: number | null;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("avgCards");
  const [desc, setDesc] = useState(true);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const dir = desc ? -1 : 1;
    const needle = query.trim().toLowerCase();
    const filtered = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av ?? Number.NEGATIVE_INFINITY) - Number(bv ?? Number.NEGATIVE_INFINITY)) * dir;
    });
  }, [rows, sortKey, desc, query]);

  const visible = COLUMNS.filter((column) => !hidden.has(column.key));
  const csvColumns = [
    ...visible.map((column) => ({ header: column.label, value: column.csv })),
    { header: "Card lean", value: (row: RefereeDeskRow) => row.strictness },
  ];

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDesc((value) => !value);
    } else {
      setSortKey(key);
      setDesc(key !== "name");
    }
  }

  function toggleColumn(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {leagues.length > 1 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="ref-league" className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Competition
            </label>
            <select
              id="ref-league"
              value={selectedLeague ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                router.push(value ? `/referees?league=${value}` : "/referees");
              }}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-800"
            >
              <option value="">All competitions</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter referees"
          aria-label="Filter referees by name"
          className="h-9 w-48 rounded-full border border-line bg-white px-4 text-sm text-ink placeholder:text-faint focus:border-cobalt focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <ColumnChooser
            columns={COLUMNS.map((column) => ({ key: column.key, label: column.label, locked: column.locked }))}
            hidden={hidden}
            onToggle={toggleColumn}
          />
          <ExportCsvButton filename="edgeball-referee-desk.csv" columns={csvColumns} rows={sorted} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wide text-slate-500 uppercase">
              {visible.map((column) => (
                <th
                  key={column.key}
                  className="px-3 py-3"
                  title={column.title}
                  aria-sort={sortKey === column.key ? (desc ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={sortKey === column.key ? "font-bold text-cobalt" : "font-semibold hover:text-slate-700"}
                  >
                    {column.label}
                    {sortKey === column.key ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3">Card lean</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={visible.length + 1} className="px-3 py-6 text-center text-sm text-muted">
                  No referees match “{query}”.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visible.map((column) => (
                    <td key={column.key} className={column.key === "name" ? "px-3 py-2.5" : num}>
                      {column.cell(row)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">{leanBadge(row.strictness, row.vsAvgPct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
