"use client";

import Link from "next/link";
import { useState } from "react";

import RankRow from "./rank-row";

export type RankItem = {
  id: string;
  name: string;
  meta: string;
  photo: string | null;
  value: number;
};

export default function StatBoard({
  title,
  subtitle,
  href,
  tabs,
}: {
  title: string;
  subtitle: string;
  href: string;
  tabs: { id: string; label: string; rows: RankItem[] }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const tab = tabs.find((item) => item.id === active) ?? tabs[0];
  const max = Math.max(...(tab?.rows.map((row) => row.value) ?? [1]), 1);

  return (
    <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      {tabs.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${item.id === tab?.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {tab && tab.rows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {tab.rows.map((row, index) => (
            <RankRow key={row.id} rank={index + 1} name={row.name} meta={row.meta} photo={row.photo} value={row.value} max={max} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-gray-500">
          Nothing stored for this line (player_season_stats / standings).
        </p>
      )}
      <Link href={href} className="mt-6 inline-flex w-fit rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
        View all
      </Link>
    </section>
  );
}
