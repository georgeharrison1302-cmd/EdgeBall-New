"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/portfolio`,
      },
    });
    setBusy(false);
    if (error) {
      setNote(error.message);
      return;
    }
    setNote("Check your email for the sign-in link.");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <p className="text-xs font-extrabold tracking-wide text-[#2563eb] uppercase">Account</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">Sign in</h1>
      <p className="mt-2 text-sm text-[#64748b]">
        Magic link sign-in to save slips to your portfolio and track personal ROI.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
        <label className="block text-sm">
          <span className="font-semibold text-[#64748b]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-full border border-[#e2e8f0] px-4 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#2563eb]"
            placeholder="you@email.com"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Sending…" : "Email me a link"}
        </button>
        {note ? <p className="text-sm text-[#64748b]">{note}</p> : null}
      </form>
      <p className="mt-6 text-center text-sm text-[#64748b]">
        <Link href="/" className="font-semibold text-[#2563eb]">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
