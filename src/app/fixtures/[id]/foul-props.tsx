"use client";

import { useState } from "react";

import type { FoulProp } from "./prop-types";

const LINES = [1, 2, 3];

export default function FoulProps({ home, away, props }: { home: string; away: string; props: FoulProp[] }) {
  const [line, setLine] = useState(1);
  const rows = props.filter((row) => row.line === line);
  const homeRows = rows.filter((row) => row.side === "home");
  const awayRows = rows.filter((row) => row.side === "away");
  const listed = rows.filter((row) => row.side === "listed");
  return (
    <section id="player-props" className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Player props</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Fouls committed</h2>
      <p className="mt-1 text-sm text-gray-500">Season fouls-committed rates from API-Football. Book prices appear when Odds-API.io stores them.</p>
      <div className="mt-4 flex gap-2">
        {LINES.map((item) => (
          <button key={item} type="button" onClick={() => setLine(item)} className={`rounded-full px-3 py-1 text-xs font-semibold ${item === line ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {item}+
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No Bet365 fouls-committed price is stored for {line}+ (prematch_odds).
        </p>
      ) : null}
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <PropColumn title={home} rows={homeRows} />
        <PropColumn title={away} rows={awayRows} />
      </div>
      {listed.length > 0 ? (
        <div className="mt-6">
          <PropColumn title="Stored prices" rows={listed} />
        </div>
      ) : null}
    </section>
  );
}

function PropColumn({ title, rows }: { title: string; rows: FoulProp[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-2 divide-y divide-gray-100">
        {rows.map((row) => (
          <li key={`${row.name}-${row.line}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-medium text-slate-900">{row.name}</span>
              {row.average ? <span className="block text-xs text-gray-500">{row.average} fouls committed · {row.matches ?? 0} matches</span> : null}
              {row.recent.length > 0 ? (
                <span className="mt-1 flex gap-1">
                  {row.recent.map((count, index) => (
                    <span key={`${row.name}-${index}`} className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold ${count > 0 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {count}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
            <span className="font-semibold text-blue-600">{row.odd || "No Book Odds"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
