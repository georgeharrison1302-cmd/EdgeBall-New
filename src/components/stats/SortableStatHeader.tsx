"use client";

import { useMemo, useState, type ReactNode } from "react";

/** Unabbreviated names shown on hover for sportsbook / standings columns. */
export const STAT_GLOSSARY = {
  "#": "Table position",
  Pos: "League position",
  Team: "Team",
  Player: "Player",
  P: "Played (matches)",
  W: "Wins",
  D: "Draws",
  L: "Losses",
  GF: "Goals for",
  GA: "Goals against",
  GD: "Goal difference",
  Pts: "Points",
  Form: "Recent form (last five results)",
  xG: "Expected goals",
  "xG H": "Expected goals per game (home)",
  "xG A": "Expected goals per game (away)",
  xGA: "Expected goals against",
  xC: "Expected goals conceded per game",
  "xC H": "Expected goals conceded per game (home)",
  "xC A": "Expected goals conceded per game (away)",
  xGD: "Expected goal difference",
  "GF +/−": "Goals for minus expected goals",
  "GA +/−": "Goals against minus expected goals against",
  "GD +/−": "Goal difference minus expected goal difference",
  "Cards/g": "Cards per game (yellow + red)",
  "Total Yellows": "Total yellow cards",
  "Red Cards": "Red cards",
  "Goals/g": "Goals scored per game",
  "Clean Sheets": "Clean sheets",
  "BTTS Rate": "Both teams to score rate",
  Attack: "Attack — expected goals for per game",
  Defence: "Defence — expected goals against per game",
  Overall: "Overall — attack minus defence (xG differential)",
  Trend: "Recent xG differential trend",
  Change: "Change versus season overall differential",
  Avg: "Average",
  Streak: "Current consecutive streak",
  "Last 5": "Last five matches",
  Hits: "Both teams to score hits this season",
  Home: "Home rate",
  Away: "Away rate",
  Season: "Season rate",
  Next: "Next opponent",
  Yes: "Both teams to score — Yes odds",
  Apps: "Appearances",
  Min: "Minutes played",
  Shots: "Total shots",
  SOT: "Shots on target",
  "Fouls committed": "Fouls committed",
  "Fouls won": "Fouls won (drawn)",
  Tackles: "Tackles",
  Yellows: "Yellow cards",
  Corners: "Corners per game",
  "Corners H": "Corners per game (home)",
  "Corners A": "Corners per game (away)",
  Return: "Theoretical return percentage",
  Rate: "Historical hit rate",
  Price: "Implied bookmaker probability",
  Edge: "Model edge versus the book",
  Odds: "Decimal odds",
  Match: "Fixture",
  Kickoff: "Kick-off time",
  Type: "Market type",
  Pick: "Selection",
} as const;

export type StatLabel = keyof typeof STAT_GLOSSARY;

export type SortDir = "asc" | "desc";

export function useColumnSort<K extends string>(initialKey: K | null = null, initialDir: SortDir = "desc") {
  const [sortKey, setSortKey] = useState<K | null>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  function toggle(key: K, preferAsc = false) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(preferAsc ? "asc" : "desc");
      return;
    }
    setSortDir((current) => (current === "desc" ? "asc" : "desc"));
  }

  function reset() {
    setSortKey(initialKey);
    setSortDir(initialDir);
  }

  return { sortKey, sortDir, toggle, reset, setSortKey, setSortDir };
}

export function sortByNumber<T>(
  rows: T[],
  sortKey: string | null,
  sortDir: SortDir,
  valueOf: (row: T, key: string) => number | null | undefined,
  tieBreak?: (left: T, right: T) => number,
) {
  if (sortKey == null) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = valueOf(left, sortKey);
    const b = valueOf(right, sortKey);
    if (a == null && b == null) return tieBreak?.(left, right) ?? 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (a !== b) return (a - b) * dir;
    return tieBreak?.(left, right) ?? 0;
  });
}

type Align = "left" | "right";

const baseTh =
  "py-2 font-semibold tracking-wide uppercase text-[11px] text-[#64748b]";

/** Non-sortable header with full name on hover. */
export function LabeledTh({
  label,
  fullName,
  align = "left",
  className = "",
}: {
  label: string;
  fullName?: string;
  align?: Align;
  className?: string;
}) {
  const tip = fullName ?? (label in STAT_GLOSSARY ? STAT_GLOSSARY[label as StatLabel] : label);
  return (
    <th
      title={tip}
      aria-label={tip}
      className={`${baseTh} ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <span className="cursor-help">{label}</span>
    </th>
  );
}

/** Clickable sortable header with full name on hover + ↑/↓ when active. */
export function SortableTh({
  label,
  fullName,
  active,
  dir,
  onSort,
  align = "right",
  className = "",
}: {
  label: string;
  fullName?: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  align?: Align;
  className?: string;
}) {
  const tip = fullName ?? (label in STAT_GLOSSARY ? STAT_GLOSSARY[label as StatLabel] : label);
  const marker = !active ? "" : dir === "asc" ? "↑" : "↓";
  return (
    <th
      title={`${tip} — click to sort`}
      aria-label={`${tip}. ${active ? `Sorted ${dir === "asc" ? "ascending" : "descending"}` : "Click to sort"}`}
      className={`${baseTh} ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-semibold tracking-wide uppercase transition-colors hover:bg-slate-100 hover:text-[#0f172a] ${
          active ? "text-[#2563eb]" : "text-[#64748b]"
        } ${align === "right" ? "justify-end" : "justify-start"}`}
      >
        {label}
        <span className="inline-block w-3 text-[10px] tabular-nums" aria-hidden>
          {marker}
        </span>
      </button>
    </th>
  );
}

/** Convenience: map of label → SortableTh or LabeledTh for static glossaries. */
export function useSortedRows<T, K extends string>(
  rows: T[],
  sortKey: K | null,
  sortDir: SortDir,
  valueOf: (row: T, key: K) => number | null | undefined,
  tieBreak?: (left: T, right: T) => number,
) {
  return useMemo(
    () => sortByNumber(rows, sortKey, sortDir, valueOf as (row: T, key: string) => number | null | undefined, tieBreak),
    [rows, sortKey, sortDir, valueOf, tieBreak],
  );
}

export function HeaderTip({ children, tip }: { children: ReactNode; tip: string }) {
  return (
    <span title={tip} aria-label={tip} className="cursor-help">
      {children}
    </span>
  );
}
