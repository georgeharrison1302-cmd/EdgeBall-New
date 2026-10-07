"use client";

export function EdgeBadge({ edgePct }: { edgePct: number | null }) {
  if (edgePct == null || !Number.isFinite(edgePct) || edgePct <= 0) {
    return <span className="text-[11px] font-semibold text-[#94a3b8]">No edge</span>;
  }
  return (
    <span className="inline-flex rounded-full bg-[#2563eb] px-2 py-0.5 text-[11px] font-extrabold text-white">
      +{edgePct.toFixed(1)}%
    </span>
  );
}
