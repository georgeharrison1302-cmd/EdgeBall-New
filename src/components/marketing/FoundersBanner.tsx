"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "edgeball-founders-banner-dismissed";

export function FoundersBanner() {
  const dismissed = useSyncExternalStore(subscribeDismissal, readDismissed, () => true);
  const [closed, setClosed] = useState(false);

  if (dismissed || closed) return null;

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setClosed(true);
  }

  return (
    <section className="border-b border-[#dbeafe] bg-[#eff6ff]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0f172a]">
            Founders Club: First 50 members get 30% off for life with code FOUNDERS30
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/pricing" className="rounded-full border border-[#bfdbfe] bg-white px-4 py-2 text-xs font-bold text-[#2563eb] transition-colors hover:border-[#2563eb]">
            Compare plans
          </Link>
          <form action="/api/checkout" method="post">
            <input type="hidden" name="plan" value="premium" />
            <input type="hidden" name="interval" value="month" />
            <button type="submit" className="rounded-full bg-[#2563eb] px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-[#1d4ed8]">
              Claim Premium offer
            </button>
          </form>
          <button type="button" onClick={dismiss} aria-label="Dismiss Founders Club banner" className="grid h-8 w-8 place-items-center rounded-full text-[#64748b] transition-colors hover:bg-white hover:text-[#0f172a]">
            ×
          </button>
        </div>
      </div>
    </section>
  );
}

function subscribeDismissal(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readDismissed() {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}
