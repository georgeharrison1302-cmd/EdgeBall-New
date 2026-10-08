import type { CurvePoint } from "@/lib/record/metrics";

/** Dependency-free SVG cumulative P/L line (flat 1u stakes). */
export function ProfitCurve({ points }: { points: CurvePoint[] }) {
  if (points.length < 2) return null;
  const width = 720;
  const height = 220;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const values = [0, ...points.map((point) => point.cumulative)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => pad.l + (index / (points.length - 1)) * (width - pad.l - pad.r);
  const y = (value: number) => pad.t + (1 - (value - min) / span) * (height - pad.t - pad.b);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.cumulative).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1].cumulative;
  const zero = y(0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Cumulative profit over ${points.length} settled tips, ending at ${last.toFixed(1)} units`}
      className="h-auto w-full"
    >
      <line x1={pad.l} x2={width - pad.r} y1={zero} y2={zero} stroke="#e2e8f0" strokeDasharray="4 4" />
      <text x={pad.l - 6} y={zero + 4} textAnchor="end" fontSize="11" fill="#64748b">0u</text>
      <text x={pad.l - 6} y={y(max) + 4} textAnchor="end" fontSize="11" fill="#64748b">{max.toFixed(0)}u</text>
      <text x={pad.l - 6} y={y(min) + 4} textAnchor="end" fontSize="11" fill="#64748b">{min.toFixed(0)}u</text>
      <path d={path} fill="none" stroke={last >= 0 ? "#2563eb" : "#dc2626"} strokeWidth="2.5" strokeLinejoin="round" />
      <text x={width - pad.r} y={height - 6} textAnchor="end" fontSize="11" fill="#64748b">{points.length} settled tips</text>
    </svg>
  );
}
