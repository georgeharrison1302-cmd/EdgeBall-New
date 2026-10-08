import Link from "next/link";

import type { Bar } from "../rates";

export function Shell({
  children,
}: {
  children: React.ReactNode;
  current?: "desk" | "competitions" | "bets" | "tracker" | "search";
}) {
  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 text-sm text-muted sm:px-6">
        18+ ·{" "}
        <a href="https://www.begambleaware.org" className="underline">
          BeGambleAware.org
        </a>
      </footer>
    </>
  );
}

export function SeasonLinks({
  href,
  season,
  years,
}: {
  href: (season: number) => string;
  season: number;
  years: number[];
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {years.map((year) => (
        <Link
          key={year}
          href={href(year)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            year === season ? "bg-cobalt text-white" : "bg-white text-[#334155]"
          }`}
        >
          {year}
        </Link>
      ))}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 min-h-7 text-xl font-semibold tracking-tight">{value ?? ""}</p>
    </div>
  );
}

export function zoneClass(description: string | null) {
  const text = description?.toLowerCase() ?? "";
  if (text.includes("relegation")) return "bg-red-50";
  if (text.includes("play-off") || text.includes("playoff")) return "bg-orange-50";
  if (text.includes("champions league") || text.includes("promotion") || text.includes("europa")) return "bg-green-50";
  return "";
}

export function Form({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex gap-1">
      {[...value].map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${
            letter === "W"
              ? "bg-[#dcfce7] text-[#166534]"
              : letter === "L"
                ? "bg-[#ffe4e6] text-[#be123c]"
                : "bg-[#f1f5f9] text-[#475569]"
          }`}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

export function count(value: number | null) {
  return value === null ? "" : String(value);
}

export function Compare({ bars }: { bars: Bar[] }) {
  if (bars.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Season rates are not stored for both sides (player_season_stats).
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-blue-600">{bar.home}</span>
            <span className="text-center text-xs text-gray-500">{bar.label}</span>
            <span className="font-semibold text-slate-900">{bar.away}</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100">
            <span className="bg-blue-600" style={{ width: `${bar.homeShare}%` }} />
            <span className="bg-slate-900" style={{ width: `${100 - bar.homeShare}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
