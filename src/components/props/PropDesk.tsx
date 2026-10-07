"use client";

import { useMemo, useState } from "react";

import { EmptyReason } from "@/components/stats/EmptyReason";
import type { DeskPlayerRow, DeskSplit } from "@/lib/stats/prop-desk";

import { PropDeskRow } from "./PropDeskRow";
import { SplitSwitcher } from "./SplitSwitcher";

export function PropDesk({
  rows,
  title = "Results",
}: {
  rows: DeskPlayerRow[];
  title?: string;
}) {
  const [split, setSplit] = useState<DeskSplit>("L5");
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.player.localeCompare(b.player));
  }, [rows]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[#0f172a]">{title}</h2>
          <p className="mt-0.5 text-xs font-semibold text-[#64748b]">
            Hover form boxes · switch micro-stat chips · toggle lines · expand for books
          </p>
        </div>
        <SplitSwitcher value={split} onChange={setSplit} />
      </div>

      {sorted.length === 0 ? (
        <EmptyReason
          variant="center"
          title="No props on desk"
          detail="No stored player props for this filter set"
          source="prematch_odds"
        />
      ) : (
        <div className="overflow-auto rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                <th className="px-3 py-2.5 text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Player
                </th>
                <th className="px-3 py-2.5 text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Hit Rate
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Total
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Avg
                </th>
                <th className="px-3 py-2.5 text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Form
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Odds
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                  Edge%
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <PropDeskRow
                  key={row.id}
                  row={row}
                  split={split}
                  open={openId === row.id}
                  onToggle={() => setOpenId((id) => (id === row.id ? null : row.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
