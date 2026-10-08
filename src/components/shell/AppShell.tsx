"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { DisplayPrefsProvider } from "@/components/display/DisplayPrefsProvider";
import SiteFooter from "@/components/site-footer";
import { Header, type HeaderSection } from "@/components/layout/Header";
import { FoundersBanner } from "@/components/marketing/FoundersBanner";
import { BetSlipProvider } from "@/components/stats/BetSlipContext";
import type { SubscriptionTier } from "@/types/billing";

import { BetSlipDrawer } from "./BetSlipDrawer";

function sectionFromPath(pathname: string | null): HeaderSection {
  if (!pathname) return null;
  if (pathname === "/" || pathname.startsWith("/fixtures") || pathname.startsWith("/match-hub")) {
    return "fixtures";
  }
  if (pathname.startsWith("/props")) return "player-props";
  if (pathname.startsWith("/match-props")) return "match-props";
  if (pathname.startsWith("/generator") || pathname.startsWith("/build-your-own")) {
    return "builder";
  }
  if (pathname.startsWith("/ladder")) return "ladder";
  if (pathname.startsWith("/competitions")) return "competitions";
  if (pathname.startsWith("/portfolio") || pathname.startsWith("/tracker")) return "portfolio";
  if (pathname.startsWith("/pricing")) return "pricing";
  return null;
}

export function AppShell({
  children,
  showUpgrade = false,
  showFounders = false,
  pro = false,
  tier = null,
}: {
  children: ReactNode;
  showUpgrade?: boolean;
  showFounders?: boolean;
  pro?: boolean;
  tier?: SubscriptionTier | null;
}) {
  const pathname = usePathname();
  return (
    <DisplayPrefsProvider>
      <BetSlipProvider>
        <div className="flex min-h-screen flex-col bg-canvas text-ink">
          <Header
            current={sectionFromPath(pathname)}
            showUpgrade={showUpgrade}
            pro={pro}
            tier={tier}
          />
          {showFounders ? <FoundersBanner /> : null}
          <div className="flex-1 pb-24">{children}</div>
          <SiteFooter />
          <BetSlipDrawer />
        </div>
      </BetSlipProvider>
    </DisplayPrefsProvider>
  );
}
