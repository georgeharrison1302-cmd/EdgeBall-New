"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { SearchHit } from "@/app/api/search/route";

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  competition: "Competition",
  team: "Team",
  player: "Player",
};

export function SearchBox({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { hits: SearchHit[] };
        setHits(body.hits);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const visible = trimmed.length >= 2;

  return (
    <div ref={container} className="relative w-full md:w-44 lg:w-72">
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search teams, players, leagues"
        aria-label="Search teams, players and competitions"
        className="h-9 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink placeholder:text-faint focus:border-cobalt focus:bg-white focus:outline-none"
      />
      {open && visible ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-line bg-white shadow-xl">
          {loading && hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No stored matches for “{trimmed}”.</p>
          ) : (
            <ul>
              {hits.map((hit) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <Link
                    href={hit.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      onNavigate?.();
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{hit.label}</span>
                      {hit.sub ? <span className="block truncate text-xs text-muted">{hit.sub}</span> : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted uppercase">
                      {TYPE_LABEL[hit.type]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
