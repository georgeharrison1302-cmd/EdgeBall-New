"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";

export type AuthMode = "signin" | "signup";
type BusyAction = "password" | "magic" | "google" | null;

type Notice = {
  tone: "error" | "info";
  text: string;
};

export function AuthPanel({
  initialMode = "signin",
  next = "/",
  onAuthenticated,
}: {
  initialMode?: AuthMode;
  next?: string;
  onAuthenticated?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const safeNext = next.startsWith("/") ? next : "/";
  const callbackUrl = `${typeof window === "undefined" ? "" : window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  async function completePasswordAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    setNotice(null);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: callbackUrl },
          });
    setBusy(null);
    if (error) {
      setNotice({ tone: "error", text: error.message });
      return;
    }
    if (data.session) {
      onAuthenticated?.();
      router.refresh();
      return;
    }
    setNotice({
      tone: "info",
      text:
        mode === "signin"
          ? "Check your email to confirm this account."
          : "Check your email to confirm your account, then sign in.",
    });
  }

  async function sendMagicLink() {
    setBusy("magic");
    setNotice(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl,
        shouldCreateUser: true,
      },
    });
    setBusy(null);
    setNotice(
      error
        ? { tone: "error", text: error.message }
        : { tone: "info", text: "Check your email for the secure sign-in link." },
    );
  }

  async function continueWithGoogle() {
    setBusy("google");
    setNotice(null);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    setBusy(null);
    if (error) {
      setNotice({ tone: "error", text: error.message });
      return;
    }
    if (data.url) window.location.assign(data.url);
  }

  return (
    <div>
      <div className="grid grid-cols-2 rounded-full border border-[#e2e8f0] bg-[#eef3f9] p-1 text-sm font-bold">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-full px-3 py-2 transition-colors ${mode === "signin" ? "bg-white text-[#0f172a] shadow-sm" : "text-[#64748b]"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-full px-3 py-2 transition-colors ${mode === "signup" ? "bg-white text-[#0f172a] shadow-sm" : "text-[#64748b]"}`}
        >
          Sign up
        </button>
      </div>

      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={busy != null}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm font-bold text-[#0f172a] transition-colors hover:border-[#2563eb] disabled:opacity-50"
      >
        <GoogleIcon />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="my-4 flex items-center gap-3 text-[11px] font-bold tracking-wide text-[#94a3b8] uppercase">
        <span className="h-px flex-1 bg-[#e2e8f0]" />
        or use email
        <span className="h-px flex-1 bg-[#e2e8f0]" />
      </div>

      <form onSubmit={completePasswordAuth} className="space-y-3">
        <label className="block text-sm">
          <span className="font-semibold text-[#64748b]">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-full border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#2563eb]"
            placeholder="you@email.com"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-[#64748b]">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-full border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#2563eb]"
            placeholder={mode === "signin" ? "Your password" : "At least 6 characters"}
          />
        </label>
        <button
          type="submit"
          disabled={busy != null}
          className="w-full rounded-full bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          {busy === "password"
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={busy != null || email.trim() === ""}
          className="w-full rounded-full border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm font-bold text-[#2563eb] transition-colors hover:border-[#2563eb] disabled:opacity-50"
        >
          {busy === "magic" ? "Sending link…" : "Email me a magic link"}
        </button>
      </form>

      {notice ? (
        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            notice.tone === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : "border border-blue-100 bg-blue-50 text-[#1d4ed8]"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      <p className="mt-4 text-center text-xs leading-5 text-[#64748b]">
        Email/password, magic link, and Google auth are handled by Supabase Auth.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285f4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34a853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#fbbc05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3-2.33Z" />
      <path fill="#ea4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
