"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { AuthPanel, type AuthMode } from "./AuthPanel";

export function AuthModal({
  mode,
  next,
  onClose,
}: {
  mode: AuthMode;
  next: string;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" role="presentation">
      <button
        type="button"
        aria-label="Close authentication dialog"
        onClick={onClose}
        className="absolute inset-0 bg-[#0f172a]/45 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="relative w-full max-w-md rounded-3xl border border-[#e2e8f0] bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
              EdgeBall account
            </p>
            <h2 id="auth-dialog-title" className="mt-1 text-xl font-black text-[#0f172a]">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Save slips, manage billing, and unlock Pro analysis.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e2e8f0] text-[#64748b] transition-colors hover:border-[#2563eb] hover:text-[#0f172a]"
          >
            ×
          </button>
        </div>
        <AuthPanel initialMode={mode} next={next} onAuthenticated={onClose} />
      </section>
    </div>,
    document.body,
  );
}

function subscribeNoop() {
  return () => {};
}
