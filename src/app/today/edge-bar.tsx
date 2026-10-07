export function EdgeBar({
  implied,
  hitRate,
  compact = false,
}: {
  implied: number;
  hitRate: number;
  compact?: boolean;
}) {
  const price = clamp(implied);
  const rate = clamp(hitRate);
  const gap = Math.max(rate - price, 0);
  const bar = (
    <div className={`flex overflow-hidden rounded-full bg-[#e2e8f0] ${compact ? "h-1.5" : "mt-1.5 h-2"}`}>
      <span className="h-full bg-[#94a3b8]" style={{ width: `${price * 100}%` }} />
      {gap > 0 ? <span className="h-full bg-[#2563eb]" style={{ width: `${gap * 100}%` }} /> : null}
    </div>
  );

  if (compact) {
    return <div aria-label={`Price ${percent(price)}, hit rate ${percent(rate)}`}>{bar}</div>;
  }

  return (
    <div aria-label={`Price ${percent(price)}, hit rate ${percent(rate)}`}>
      <div className="flex items-baseline justify-between text-sm font-semibold">
        <span className="text-[#64748b]">{percent(price)}</span>
        <span className="text-[#2563eb]">{percent(rate)}</span>
      </div>
      {bar}
      <div className="mt-1 flex justify-between text-[11px] text-[#64748b]">
        <span>Price</span>
        <span>Hit rate</span>
      </div>
    </div>
  );
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
