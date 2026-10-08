"use client";

import { useState } from "react";

export function BillingPortalButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing-portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (response.ok && payload?.url) {
        window.location.assign(payload.url);
        return;
      }
      setError(payload?.error ?? "Billing portal is unavailable.");
    } catch {
      setError("Billing portal is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={busy}
        className={`inline-flex items-center justify-center rounded-full bg-cobalt px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cobalt-dark disabled:opacity-50 ${className}`.trim()}
      >
        {busy ? "Opening Stripe…" : "Billing / Stripe Portal"}
      </button>
      {error ? <span className="text-xs font-semibold text-red-600">{error}</span> : null}
    </span>
  );
}
