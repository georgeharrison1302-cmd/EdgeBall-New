import type { Metadata } from "next";

import { loadModelGrading } from "@/app/tracker/model-grading-load";
import { PremiumPageGate } from "@/components/ui/PremiumPaywall";
import { getSubscriptionAccess } from "@/utils/subscription";

import { loadPortfolio } from "./load";
import { PortfolioShell, type PortfolioTab } from "./portfolio-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio · EdgeBall",
  description: "Personal bankroll and EdgeBall verified model accuracy.",
  robots: { index: false, follow: false },
};

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: PortfolioTab = params.tab === "model" ? "model" : "bets";
  const access = await getSubscriptionAccess();

  if (!access.unlocked) {
    return (
      <PremiumPageGate
        unlocked={false}
        title="Portfolio is Pro"
        tease="My Bets bankroll tracking and Model Accuracy unlock with EdgeBall Pro."
      >
        {null}
      </PremiumPageGate>
    );
  }

  const [bets, model] = await Promise.all([loadPortfolio(), loadModelGrading()]);

  return <PortfolioShell tab={tab} bets={bets} model={model} />;
}
