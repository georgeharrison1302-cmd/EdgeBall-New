import type { Metadata } from "next";

import { AppShell } from "@/components/shell/AppShell";
import { getSubscriptionAccess } from "@/utils/subscription";

import "./globals.css";

export const metadata: Metadata = {
  title: "EdgeBall",
  description:
    "Kickoffs, stored Bet365 prices, and model edges across the competitions we cover.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getSubscriptionAccess();

  return (
    <html lang="en">
      <body>
        <AppShell showUpgrade={!access.unlocked}>{children}</AppShell>
      </body>
    </html>
  );
}
