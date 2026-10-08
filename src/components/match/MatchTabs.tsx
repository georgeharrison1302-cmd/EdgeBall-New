"use client";

import { useCallback, useState, type ReactNode } from "react";

export type MatchTab = { id: string; label: string; content: ReactNode };

/**
 * Statz-style section tabs. Every panel is server-rendered and stays in the
 * DOM (hidden when inactive) so switching is instant and content is crawlable.
 * The active tab mirrors `?tab=` so sections are shareable and survive Back.
 * `scoreboard` renders in the same sticky bar as the tab strip.
 */
export function MatchTabs({
  tabs,
  initial,
  scoreboard,
}: {
  tabs: MatchTab[];
  initial?: string;
  scoreboard?: ReactNode;
}) {
  const [active, setActive] = useState(
    initial && tabs.some((tab) => tab.id === initial) ? initial : tabs[0]?.id,
  );

  const select = useCallback(
    (id: string) => {
      setActive(id);
      const url = new URL(window.location.href);
      if (id === tabs[0]?.id) url.searchParams.delete("tab");
      else url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url);
    },
    [tabs],
  );

  return (
    <div className="space-y-5">
      <div className="sticky top-16 z-20 -mx-1 overflow-hidden rounded-2xl border border-line bg-white/95 shadow-sm backdrop-blur">
        {scoreboard}
        <div
          role="tablist"
          aria-label="Match sections"
          className="hide-scrollbar flex gap-1 overflow-x-auto p-1"
        >
          {tabs.map((tab) => {
            const on = tab.id === active;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`panel-${tab.id}`}
                onClick={() => select(tab.id)}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  on ? "bg-cobalt text-white shadow-sm" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
          className="space-y-6"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
