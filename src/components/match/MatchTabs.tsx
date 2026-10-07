"use client";

import { useState, type ReactNode } from "react";

export type MatchTab = { id: string; label: string; content: ReactNode };

/**
 * Statz-style section tabs. Every panel is server-rendered and stays in the
 * DOM (hidden when inactive) so switching is instant and content is crawlable.
 */
export function MatchTabs({ tabs, initial }: { tabs: MatchTab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Match sections"
        className="hide-scrollbar sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white/95 p-1 shadow-sm backdrop-blur"
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
              onClick={() => setActive(tab.id)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                on ? "bg-[#2563eb] text-white shadow-sm" : "text-[#64748b] hover:bg-[#eef3f9] hover:text-[#0f172a]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
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
