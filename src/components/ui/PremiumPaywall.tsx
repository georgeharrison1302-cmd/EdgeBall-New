"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Frosted paywall overlay for EdgeBall Pro surfaces.
 * Pass `unlocked` from the server (`getSubscriptionAccess`) to avoid flicker.
 */
export function PremiumPaywall({
  children,
  unlocked = false,
  tease = "Unlock deep match logs and +Edge% calculations",
  className = "",
}: {
  children: ReactNode;
  unlocked?: boolean;
  tease?: string;
  className?: string;
}) {
  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`.trim()}>
      <div
        className="pointer-events-none select-none blur-[6px] opacity-50"
        aria-hidden
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/55 p-4 backdrop-blur-md">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-white/90 px-5 py-6 text-center shadow-lg shadow-slate-200/60">
          <div
            className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-line bg-canvas text-ink"
            aria-hidden
          >
            <LockIcon />
          </div>
          <p className="mt-3 text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
            EdgeBall Pro
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">{tease}</p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex rounded-full bg-cobalt px-4 py-2.5 text-sm font-bold text-white hover:bg-cobalt-dark"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Full-page gate for Pro-only routes. */
export function PremiumPageGate({
  unlocked,
  children,
  title = "This desk is for EdgeBall Pro",
  tease = "Fixture Factors, historical backtesting, and the model tracker unlock with Pro.",
}: {
  unlocked: boolean;
  children: ReactNode;
  title?: string;
  tease?: string;
}) {
  if (unlocked) return <>{children}</>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-line bg-white px-6 py-12 text-center shadow-sm sm:px-10">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-line bg-canvas"
          aria-hidden
        >
          <LockIcon />
        </div>
        <p className="mt-4 text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
          EdgeBall Pro
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">{tease}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/pricing"
            className="rounded-full bg-cobalt px-5 py-2.5 text-sm font-bold text-white hover:bg-cobalt-dark"
          >
            Upgrade to Pro
          </Link>
          <Link
            href="/auth/login?next=/pricing"
            className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-bold text-ink"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="16" r="1.25" fill="currentColor" />
    </svg>
  );
}
