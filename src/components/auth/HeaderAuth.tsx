"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/client";

import { AuthModal } from "./AuthModal";
import type { AuthMode } from "./AuthPanel";

export function HeaderAuth({
  pro = false,
  mobile = false,
  onNavigate,
}: {
  pro?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [modal, setModal] = useState<{ mode: AuthMode; next: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function openAuth(mode: AuthMode) {
    const next = `${window.location.pathname}${window.location.search}`;
    onNavigate?.();
    setModal({ mode, next });
  }

  async function openBillingPortal() {
    setPortalBusy(true);
    setAccountError(null);
    try {
      const response = await fetch("/api/billing-portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (response.ok && payload?.url) {
        window.location.assign(payload.url);
        return;
      }
      setAccountError(payload?.error ?? "Billing portal is unavailable.");
    } catch {
      setAccountError("Billing portal is unavailable.");
    } finally {
      setPortalBusy(false);
    }
  }

  async function logOut() {
    setLogoutBusy(true);
    await supabase.auth.signOut();
    setUser(null);
    setMenuOpen(false);
    setLogoutBusy(false);
    onNavigate?.();
    router.refresh();
  }

  if (!ready) {
    return (
      <div
        aria-hidden="true"
        className={
          mobile
            ? "h-10 rounded-full border border-[#e2e8f0] bg-white"
            : "hidden h-9 w-40 rounded-full border border-[#e2e8f0] bg-white sm:block"
        }
      />
    );
  }

  if (mobile) {
    return user ? (
      <div className="mt-3 rounded-2xl border border-[#e2e8f0] bg-white p-3">
        <p className="truncate px-2 text-sm font-bold text-[#0f172a]">{user.email ?? "Account"}</p>
        <p className="px-2 text-xs font-semibold text-[#64748b]">{pro ? "EdgeBall Pro" : "Free plan"}</p>
        <div className="mt-2 grid gap-1">
          <MobileAccountLink href="/account" onNavigate={onNavigate}>My Account</MobileAccountLink>
          <MobileAccountLink href="/portfolio" onNavigate={onNavigate}>Portfolio</MobileAccountLink>
          <button type="button" onClick={openBillingPortal} disabled={portalBusy} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#0f172a] hover:bg-slate-50 disabled:opacity-50">
            {portalBusy ? "Opening billing…" : "Billing / Stripe Portal"}
          </button>
          <button type="button" onClick={logOut} disabled={logoutBusy} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            {logoutBusy ? "Logging out…" : "Log out"}
          </button>
          {accountError ? <p className="px-3 py-1 text-xs text-red-600">{accountError}</p> : null}
        </div>
      </div>
    ) : (
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openAuth("signin")} className="rounded-full border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm font-bold text-[#0f172a]">
          Sign in
        </button>
        <button type="button" onClick={() => openAuth("signup")} className="rounded-full bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white">
          Sign up
        </button>
        {modal ? <AuthModal mode={modal.mode} next={modal.next} onClose={() => setModal(null)} /> : null}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => openAuth("signin")}
            className="rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:border-[#2563eb]"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => openAuth("signup")}
            className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-[#1d4ed8]"
          >
            Sign up
          </button>
        </div>
        {modal ? <AuthModal mode={modal.mode} next={modal.next} onClose={() => setModal(null)} /> : null}
      </>
    );
  }

  const displayName = userName(user);
  return (
    <div ref={container} className="relative hidden sm:block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white py-1 pr-2 pl-1 shadow-sm transition-colors hover:border-[#2563eb]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2563eb] text-[11px] font-black text-white">
          {initials(displayName)}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-bold text-[#0f172a] lg:inline">
          {displayName}
        </span>
        <Chevron open={menuOpen} />
      </button>

      {menuOpen ? (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-xl">
          <div className="border-b border-[#e2e8f0] px-4 py-3">
            <p className="truncate text-sm font-bold text-[#0f172a]">{user.email ?? displayName}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#64748b]">{pro ? "EdgeBall Pro" : "Free plan"}</p>
          </div>
          <Link href="/account" role="menuitem" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-sm font-semibold text-[#0f172a] hover:bg-slate-50">
            My Account
          </Link>
          <Link href="/portfolio" role="menuitem" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-sm font-semibold text-[#0f172a] hover:bg-slate-50">
            Portfolio
          </Link>
          <button type="button" role="menuitem" onClick={openBillingPortal} disabled={portalBusy} className="block w-full px-4 py-3 text-left text-sm font-semibold text-[#0f172a] hover:bg-slate-50 disabled:opacity-50">
            {portalBusy ? "Opening billing…" : "Billing / Stripe Portal"}
          </button>
          <button type="button" role="menuitem" onClick={logOut} disabled={logoutBusy} className="block w-full border-t border-[#e2e8f0] px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            {logoutBusy ? "Logging out…" : "Log out"}
          </button>
          {accountError ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{accountError}</p> : null}
        </div>
      ) : null}
      {modal ? <AuthModal mode={modal.mode} next={modal.next} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function MobileAccountLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={onNavigate} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50">
      {children}
    </Link>
  );
}

function userName(user: User) {
  const metadata = user.user_metadata as { full_name?: unknown; name?: unknown } | undefined;
  const name = typeof metadata?.full_name === "string" ? metadata.full_name : metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return user.email?.split("@")[0] ?? "Account";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "E") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
