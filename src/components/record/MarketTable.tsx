"use client";

import { useMemo, useState } from "react";

import type { ModelMarketLedger } from "@/app/tracker/model-grading-load";
import { ColumnChooser, ExportCsvButton } from "@/components/ui/TableToolbar";
import type { CsvColumn } from "@/lib/csv";

type Market = ModelMarketLedger;

type Column = {
  key: keyof Market | "wl";
  label: string;
  locked?: boolean;
  cell: (market: Market) => string;
  sortValue: (market: Market) => number | string | null;
};

const pct = (value: number | null) => (value == null ? "—" : `${(value * 100).toFixed(1)}%`);
const units = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}u`;

const COLUMNS: Column[] = [
  { key: "label", label: "Market", locked: true, cell: (m) => m.label, sortValue: (m) => m.label },
  { key: "tips", label: "Tips", cell: (m) => String(m.tips), sortValue: (m) => m.tips },
  { key: "settled", label: "Settled", cell: (m) => String(m.settled), sortValue: (m) => m.settled },
  { key: "wl", label: "W-L", cell: (m) => (m.settled ? `${m.wins}-${m.losses}` : "—"), sortValue: (m) => (m.settled ? m.wins : null) },
  { key: "hitRate", label: "Hit rate", cell: (m) => pct(m.hitRate), sortValue: (m) => m.hitRate },
  { key: "avgEdge", label: "Avg edge", cell: (m) => (m.avgEdge == null ? "—" : `+${m.avgEdge.toFixed(1)}%`), sortValue: (m) => m.avgEdge },
  { key: "profit", label: "P/L", cell: (m) => (m.settled ? units(m.profit) : "—"), sortValue: (m) => (m.settled ? m.profit : null) },
  { key: "roi", label: "ROI", cell: (m) => (m.roi == null ? "—" : `${(m.roi * 100).toFixed(1)}%`), sortValue: (m) => m.roi },
];

const CSV_COLUMNS: CsvColumn<Market>[] = COLUMNS.map((column) => ({
  header: column.label,
  value: (market) => column.cell(market),
}));

/** Per-market P/L ledger with sorting, column visibility and CSV export. */
export function MarketTable({ markets }: { markets: Market[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>("tips");
  const [desc, setDesc] = useState(true);

  const visible = COLUMNS.filter((column) => !hidden.has(column.key));
  const sorted = useMemo(() => {
    const column = COLUMNS.find((entry) => entry.key === sortKey) ?? COLUMNS[0];
    return [...markets].sort((a, b) => {
      const av = column.sortValue(a);
      const bv = column.sortValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const order = typeof av === "string" ? av.localeCompare(String(bv)) : av - Number(bv);
      return desc ? -order : order;
    });
  }, [markets, sortKey, desc]);

  const toggleColumn = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleSort = (key: string) => {
    if (sortKey === key) setDesc((value) => !value);
    else {
      setSortKey(key);
      setDesc(key !== "label");
    }
  };

  const csvColumns = CSV_COLUMNS.filter(
    (_column, index) => !hidden.has(COLUMNS[index].key),
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <ColumnChooser
          columns={COLUMNS.map((column) => ({ key: column.key, label: column.label, locked: column.locked }))}
          hidden={hidden}
          onToggle={toggleColumn}
        />
        <ExportCsvButton filename="edgeball-model-record.csv" columns={csvColumns} rows={sorted} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              {visible.map((column) => (
                <th
                  key={column.key}
                  className="px-3 py-2 font-medium"
                  aria-sort={sortKey === column.key ? (desc ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={
                      sortKey === column.key ? "font-bold text-cobalt" : "font-semibold hover:text-slate-700"
                    }
                  >
                    {column.label}
                    {sortKey === column.key ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((market) => (
              <tr key={market.family} className="border-b border-line/60 last:border-0">
                {visible.map((column) => {
                  const value = column.sortValue(market);
                  const isMoney = column.key === "profit" || column.key === "roi";
                  const tone = !isMoney || market.settled === 0 || value == null
                    ? column.key === "label" ? "font-semibold text-ink" : "tabular-nums text-muted"
                    : Number(value) >= 0
                      ? "font-semibold tabular-nums text-cobalt"
                      : "font-semibold tabular-nums text-red-600";
                  return (
                    <td key={column.key} className={`px-3 py-2 ${tone}`}>
                      {column.cell(market)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
