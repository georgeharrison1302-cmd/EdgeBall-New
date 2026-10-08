import { ago, loadFreshness, type FreshnessJob } from "@/lib/freshness/load";

/** "Odds 12m ago · Lineups 3m ago" — amber when a feed is overdue. */
export async function DataFreshness({ jobs }: { jobs: FreshnessJob[] }) {
  const items = await loadFreshness(jobs).catch(() => []);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-muted">
      {items.map((item) => (
        <li key={item.job} className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${item.ok && !item.stale ? "bg-emerald-500" : "bg-amber-500"}`}
            aria-hidden
          />
          <span>
            {item.label} {ago(item.at)}
            {!item.ok ? " · last run had errors" : item.stale ? " · overdue" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
