"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";

type Status = "working" | "done" | "failed";

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/account";
}

export function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>("working");
  const [detail, setDetail] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const supabase = createClient();
    const next = safeNext(params.get("next"));

    async function run() {
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type") as
        | "signup"
        | "magiclink"
        | "recovery"
        | "invite"
        | "email"
        | "email_change"
        | null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return;
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });
        if (error) throw error;
        return;
      }

      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          return;
        }
        const hashError =
          hashParams.get("error_description") ?? hashParams.get("error");
        if (hashError) throw new Error(hashError);
      }

      throw new Error("missing_code");
    }

    run()
      .then(() => {
        setStatus("done");
        router.replace(next);
      })
      .catch((error: unknown) => {
        setStatus("failed");
        setDetail(error instanceof Error ? error.message : "auth");
      });
  }, [params, router]);

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-8 text-center shadow-sm">
      {status === "failed" ? (
        <>
          <h1 className="text-lg font-bold text-[#0f172a]">
            We could not sign you in
          </h1>
          <p className="mt-2 text-sm text-[#64748b]">
            The confirmation link may have expired or already been used. Request
            a fresh sign-in link and try again.
          </p>
          {detail ? (
            <p className="mt-2 text-xs text-[#94a3b8]">({detail})</p>
          ) : null}
          <button
            type="button"
            onClick={() => router.replace("/auth/login?error=auth")}
            className="mt-5 inline-block rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#2563eb]" />
          <h1 className="mt-4 text-lg font-bold text-[#0f172a]">
            Confirming your account…
          </h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Hold on while we finish signing you in.
          </p>
        </>
      )}
    </div>
  );
}
