"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/alerts/read", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
      className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-cobalt disabled:opacity-60"
    >
      Mark all read
    </button>
  );
}
