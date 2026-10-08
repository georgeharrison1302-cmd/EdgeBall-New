"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { RefereeDeskLeague, RefereeDeskRow } from "./load";

type SortKey = "name" | "matches" | "avgYellows" | "avgReds" | "avgCards" | "over35Rate" | "over45Rate" | "avgFouls" | "vsAvgPct";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "name", label: "Referee", title: "Referee name (normalised)" },
  { key: "matches", label: "M", title: "Finished matches with a stored stats sheet" },
  { key: "avgYellows", label: "Yel/g", title: "Average yellow cards per match" },
  { key: "avgReds", label: "Red/g", title: "Average red cards per match" },
  { key: "avgCards", label: "Cards/g", title: "Average total cards (yellow + red) per match" },
  { key: "over35Rate", label: "O3.5%", title: "Share of matches finishing over 3.5 total cards" },
  { key: "over45Rate", label: "O4.5%", title: "Share of matches finishing over 4.5 total cards" },
  { key: "avgFouls", label: "Fouls/g", title: "Average total fouls per match" },
  { key: "vsAvgPct", label: "vs avg", title: "Cards per game versus the pool average" },
];

function badge(strictness: RefereeDeskRow["strictness"], vsAvgPct: number | null) {
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

  const sorted = useMemo(() => {
    const dir = desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      const an = av ?? Number.NEGATIVE_INFINITY;
      const bn = bv ?? Number.NEGATIVE_INFINITY;
      return (Number(an) - Number(bn)) * dir;
    });
  }, [rows, sortKey, desc]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      setDesc(key !== "name");
    }
  }

  return (
    <div>
      {leagues.length > 1 ? (
        <div className="mb-4 flex items-center gap-3">
          <label htmlFor="ref-league" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Competition
          </label>
          <select
            id="ref-league"
            value={selectedLeague ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              router.push(value ? `/referees?league=${value}` : "/referees");
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-3" title={col.title}>
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className={sortKey === col.key ? "font-bold text-cobalt" : "font-semibold hover:text-slate-700"}
                  >
                    {col.label}
                    {sortKey === col.key ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3">Card lean</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-2.5 font-semibold text-slate-900">{row.name}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.matches}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.avgYellows.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.avgReds.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-ink">{row.avgCards.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.over35Rate ?? "—"}%</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.over45Rate ?? "—"}%</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.avgFouls.toFixed(1)}</td>
                <td className="px-3 py-2.5 tabular-nums">
                  {row.vsAvgPct == null ? "—" : (
                    <span className={row.vsAvgPct > 0 ? "font-semibold text-amber-700" : row.vsAvgPct < 0 ? "font-semibold text-emerald-700" : "text-slate-500"}>
                      {row.vsAvgPct > 0 ? "+" : ""}
                      {row.vsAvgPct}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">{badge(row.strictness, row.vsAvgPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
