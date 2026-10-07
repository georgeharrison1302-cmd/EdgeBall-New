import type { Average, Rate, Result } from "@/lib/stats/team-engine";

/** "60% (3/5)" — every percentage carries its sample. */
export function formatRate(rate: Rate) {
  return rate.pct == null ? "—" : `${Math.round(rate.pct)}% (${rate.hits}/${rate.n})`;
}

export function formatAverage(average: Average, digits = 2) {
  return average.avg == null ? "—" : average.avg.toFixed(digits);
}

/** Fixed timezone keeps server and client markup identical. */
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
});

export function formatMatchDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE.format(date);
}

export const RESULT_STYLE: Record<Result, string> = {
  W: "bg-[#2563eb] text-white",
  D: "bg-slate-200 text-slate-700",
  L: "bg-[#0f172a] text-white",
};
