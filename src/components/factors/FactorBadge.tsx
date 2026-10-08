"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { FactorCategory, FactorEvaluation } from "@/lib/factors/types";

const CATEGORY_STYLE: Record<
  FactorCategory,
  { border: string; bg: string; text: string }
> = {
  discipline: {
    border: "#f59e0b",
    bg: "#fffbeb",
    text: "#92400e",
  },
  physical: {
    border: "#6366f1",
    bg: "#eef2ff",
    text: "#3730a3",
  },
  table: {
    border: "#10b981",
    bg: "#ecfdf5",
    text: "#065f46",
  },
};

/**
 * Light-mode factor pill. Renders nothing when the factor did not match.
 * Click/hover opens evidence; Escape closes.
 */
export function FactorBadge({
  evaluation,
  className = "",
}: {
  evaluation: FactorEvaluation;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  if (!evaluation.matched) return null;

  const style = CATEGORY_STYLE[evaluation.factor.category];
  const evidenceRows = Object.entries(evaluation.evidence).filter(
    ([, value]) => value != null && value !== "",
  );

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        className="inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold tracking-wide uppercase shadow-sm transition"
        style={{
          borderColor: style.border,
          backgroundColor: style.bg,
          color: style.text,
        }}
      >
        {evaluation.factor.badgeLabel}
      </button>

      {open ? (
        <div
          id={tipId}
          role="tooltip"
          className="absolute top-full left-0 z-30 mt-2 w-64 rounded-xl border border-line bg-[#ffffff] p-3 text-left shadow-lg"
          style={{ backgroundColor: "#ffffff" }}
        >
          <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
            {evaluation.factor.name}
          </p>
          <p className="mt-1 text-xs font-semibold text-ink">{evaluation.summary}</p>
          {evidenceRows.length > 0 ? (
            <dl className="mt-2 space-y-1 border-t border-canvas pt-2">
              {evidenceRows.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-[11px]">
                  <dt className="text-muted">{formatEvidenceKey(key)}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatEvidenceKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}
