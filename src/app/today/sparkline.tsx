"use client";

import { Line, LineChart } from "recharts";

const WIDTH = 84;
const HEIGHT = 28;

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const slope = trendSlope(values);
  const direction = slope > 0 ? "up" : slope < 0 ? "down" : "flat";
  const stroke = direction === "up" ? "#34d399" : direction === "down" ? "#fca5a5" : "#94a3b8";
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div
      className="pointer-events-none relative h-7 w-[84px] [&:has(.recharts-surface)_.spark-line]:hidden"
      aria-label={`Last ${values.length} games, trending ${direction}`}
    >
      <svg className="spark-line absolute inset-0" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <path d={curve(values)} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <LineChart width={WIDTH} height={HEIGHT} data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </div>
  );
}

function trendSlope(values: number[]) {
  const count = values.length;
  const xMean = (count - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator === 0 ? 0 : numerator / denominator;
}

function curve(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = WIDTH / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = HEIGHT - 3 - ((value - min) / span) * (HEIGHT - 6);
    return [x, y] as const;
  });
  let path = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const controlStartX = current[0] + (next[0] - previous[0]) / 6;
    const controlStartY = current[1] + (next[1] - previous[1]) / 6;
    const controlEndX = next[0] - (after[0] - current[0]) / 6;
    const controlEndY = next[1] - (after[1] - current[1]) / 6;
    path += ` C ${controlStartX.toFixed(1)} ${controlStartY.toFixed(1)}, ${controlEndX.toFixed(1)} ${controlEndY.toFixed(1)}, ${next[0].toFixed(1)} ${next[1].toFixed(1)}`;
  }
  return path;
}
