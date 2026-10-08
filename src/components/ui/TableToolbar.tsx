"use client";

import { useEffect, useRef, useState } from "react";

import { toCsv, type CsvColumn } from "@/lib/csv";

export function ExportCsvButton<T>({
  filename,
  columns,
  rows,
}: {
  filename: string;
  columns: CsvColumn<T>[];
  rows: T[];
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }}
      className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-cobalt"
    >
      Export CSV
    </button>
  );
}

export function ColumnChooser({
  columns,
  hidden,
  onToggle,
}: {
  columns: { key: string; label: string; locked?: boolean }[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-cobalt"
      >
        Columns
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-line bg-white p-2 shadow-xl">
          {columns.map((column) => (
            <label
              key={column.key}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-canvas"
            >
              <input
                type="checkbox"
                checked={!hidden.has(column.key)}
                disabled={column.locked}
                onChange={() => onToggle(column.key)}
                className="accent-[#2563eb]"
              />
              <span className="text-ink">{column.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
