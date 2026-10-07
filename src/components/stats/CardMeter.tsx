export function CardMeter({
  home,
  away,
  homeName,
  awayName,
  line = 6,
}: {
  home: number | null | undefined;
  away: number | null | undefined;
  homeName: string;
  awayName: string;
  line?: number;
}) {
  if (home == null || away == null || !Number.isFinite(home) || !Number.isFinite(away)) {
    return null;
  }
  const combined = home + away;
  const width = Math.min(100, (combined / line) * 100);
  return (
    <div>
      <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">Combined cards / game</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {combined.toFixed(1)} <span className="font-normal text-[#64748b]">({homeName} {home.toFixed(1)} + {awayName} {away.toFixed(1)})</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
