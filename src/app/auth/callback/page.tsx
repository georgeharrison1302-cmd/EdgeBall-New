import type { Metadata } from "next";
import { Suspense } from "react";

import { CallbackHandler } from "./callback-handler";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Signing you in · EdgeBall", robots: { index: false, follow: false } };

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-canvas px-4 py-16">
      <Suspense fallback={null}>
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
