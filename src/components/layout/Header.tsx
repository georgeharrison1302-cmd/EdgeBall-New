"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import BrandMark from "@/components/BrandMark";
import { useBetSlip } from "@/components/stats/BetSlipContext";

const popularCompetitions = [
  { href: "/competitions?league=39", label: "Premier League", icon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { href: "/competitions?league=40", label: "Championship", icon: "🛡️" },
  { href: "/competitions?league=2", label: "Champions League", icon: "🏆" },
  { href: "/competitions?league=140", label: "La Liga", icon: "🇪🇸" },
  { href: "/competitions?league=135", label: "Serie A", icon: "🇮🇹" },
  { href: "/competitions?league=78", label: "Bundesliga", icon: "🇩🇪" },
] as const;

export type HeaderSection =
  | "fixtures"
  | "player-props"
  | "match-props"
  | "competitions"
  | "portfolio"
  | "builder"
  | "ladder"
  | "pricing"
  | null;

/**
 * Logo | Match Hub | Player Props | Match Props | Bet Builder | Competitions | Portfolio
 * Right: Slip icon + Upgrade to Pro.
 */
export function Header({
  current = null,
  showUpgrade = false,
}: {
  current?: HeaderSection;
  showUpgrade?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const slip = useBetSlip();

  return (
    <header className="sticky top-0 z-30 border-b border-[#e2e8f0] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="EdgeBall home">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2563eb] bg-white text-[11px] font-semibold tracking-tight shadow-sm shadow-blue-600/20">
            <span className="text-slate-900">E</span>
            <span className="text-[#2563eb]">B</span>
          </span>
          <BrandMark />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 text-sm md:flex">
          <NavItems current={current} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {showUpgrade ? (
            <Link
              href="/pricing"
              className="hidden items-center rounded-full border border-[#22d3ee] bg-[#ecfeff] px-3.5 py-1.5 text-xs font-extrabold tracking-wide text-[#0e7490] uppercase hover:bg-[#cffafe] sm:inline-flex"
            >
              Upgrade to Pro
            </Link>
          ) : null}

          {slip ? (
            <button
              type="button"
              onClick={() => slip.setOpen(true)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e2e8f0] bg-[#eef3f9] text-[#0f172a] hover:border-[#2563eb]"
              aria-label={`Bet slip${slip.legs.length > 0 ? `, ${slip.legs.length} legs` : ""}`}
            >
              <SlipIcon />
              {slip.legs.length > 0 ? (
                <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#22d3ee] px-1 text-[10px] font-extrabold text-slate-900">
                  {slip.legs.length}
                </span>
              ) : null}
            </button>
          ) : null}

          <Link
            href="/auth/login"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#0f172a] hover:border-[#2563eb] sm:inline-flex"
            aria-label="Login"
          >
            <UserIcon />
          </Link>

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-900 md:hidden"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((value) => !value)}
          >
            <HamburgerIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="border-t border-[#f1f5f9] bg-[#eef3f9]/40 px-4 py-3 text-sm md:hidden">
          <div className="flex flex-col gap-1">
            <NavItems current={current} onNavigate={() => setMobileOpen(false)} />
            {showUpgrade ? (
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="mt-2 rounded-full border border-[#22d3ee] bg-[#ecfeff] px-3.5 py-2 text-center text-xs font-extrabold tracking-wide text-[#0e7490] uppercase"
              >
                Upgrade to Pro
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function NavItems({
  current,
  onNavigate,
}: {
  current: HeaderSection;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Link href="/" onClick={onNavigate} className={itemClass(current === "fixtures")}>
        Match Hub
      </Link>
      <Link
        href="/props"
        onClick={onNavigate}
        className={itemClass(current === "player-props")}
      >
        Player Props
      </Link>
      <Link
        href="/match-props"
        onClick={onNavigate}
        className={itemClass(current === "match-props")}
      >
        Match Props
      </Link>
      <Link
        href="/generator"
        onClick={onNavigate}
        className={itemClass(current === "builder")}
      >
        Bet Builder
      </Link>
      <Link href="/ladder" onClick={onNavigate} className={itemClass(current === "ladder")}>
        Ladder
      </Link>
      <CompetitionsMenu current={current} onNavigate={onNavigate} />
      <Link
        href="/portfolio"
        onClick={onNavigate}
        className={itemClass(current === "portfolio")}
      >
        Portfolio
      </Link>
    </>
  );
}

function CompetitionsMenu({
  current,
  onNavigate,
}: {
  current: HeaderSection;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={container} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`${itemClass(current === "competitions" || open)} inline-flex w-full items-center justify-between gap-1 md:w-auto`}
      >
        Competitions
        <Chevron open={open} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-xl max-md:static max-md:mt-1 max-md:w-full"
        >
          {popularCompetitions.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#2563eb]"
            >
              <span className="mr-3 w-5 text-center" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
          <Link
            href="/competitions"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="block border-t border-[#f1f5f9] bg-slate-50 px-4 py-3 text-sm font-semibold text-[#2563eb]"
          >
            View All Competitions →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SlipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h11a1 1 0 0 1 1 1v12.5a1.5 1.5 0 0 1-2.3 1.27L14 18.2l-3.7 2.57A1.5 1.5 0 0 1 8 19.5V6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19.5c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M4 4l10 10M14 4L4 14" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 5h12M3 9h12M3 13h12" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function itemClass(active: boolean) {
  return `shrink-0 rounded-full px-3 py-2 ${
    active
      ? "bg-[#2563eb] font-semibold text-white shadow-sm shadow-blue-600/30"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;
}
