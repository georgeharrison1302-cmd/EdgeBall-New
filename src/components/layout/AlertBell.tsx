"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAccess } from "@/components/shell/AccessProvider";

/** Header bell linking to the watchlist, with an unread-alert badge. */
export function AlertBell() {
  const access = useAccess();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/alerts/unread-count", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { count?: number };
      setUnread(Number(body.count ?? 0));
    } catch {
      /* offline — keep last count */
    }
  }, []);

  useEffect(() => {
    if (!access.signedIn) return;
    const kickoff = setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [access.signedIn, refresh]);

  if (!access.signedIn) return null;

  return (
    <Link
      href="/watchlist#alerts"
      aria-label={unread > 0 ? `${unread} unread alerts` : "Alerts"}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-slate-600 transition-colors hover:border-cobalt hover:text-cobalt"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4.5 w-4.5"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-cobalt px-1 text-[10px] font-black text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
