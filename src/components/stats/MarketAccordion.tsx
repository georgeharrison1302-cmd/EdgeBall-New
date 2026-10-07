"use client";

import { useState, type ReactNode } from "react";

/**
 * Collapsible market section. Empty markets should not be rendered by the caller.
 */
export function MarketAccordion({
  id,
  title,
  count,
  defaultOpen = true,
  badges,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  /** Optional factor badges shown beside the market title. */
  badges?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--canvas)]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--ink)]">{title}</h3>
            {badges}
          </div>
          {count != null ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {count} {count === 1 ? "selection" : "selections"}
            </p>
          ) : null}
        </div>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-xs font-bold text-[var(--muted)]"
          aria-hidden
        >
          {open ? "–" : "+"}
        </span>
      </button>
      {open ? (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`} className="border-t border-[var(--line)]">
          {children}
        </div>
      ) : null}
    </section>
  );
}
