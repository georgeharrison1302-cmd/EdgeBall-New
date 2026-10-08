"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  kind: "team" | "fixture";
  entityId: number;
  label: string;
  href: string;
};

type State = "loading" | "off" | "on" | "busy";

export function FollowButton({ kind, entityId, label, href }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<{ text: string; upgrade?: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/watchlist", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { items?: { kind: string; entityId: number }[] }) => {
        if (!live) return;
        const on = (body.items ?? []).some((item) => item.kind === kind && item.entityId === entityId);
        setState(on ? "on" : "off");
      })
      .catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, [kind, entityId]);

  async function toggle() {
    const wasOn = state === "on";
    setMessage(null);
    setState("busy");
    const response = await fetch("/api/watchlist", {
      method: wasOn ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, entityId, label, href }),
    });
    if (response.status === 401) {
      router.push(`/auth/login?next=${encodeURIComponent(href)}`);
      return;
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string; upgrade?: boolean };
      setMessage({ text: body.error ?? "Could not update your watchlist", upgrade: body.upgrade });
      setState(wasOn ? "on" : "off");
      return;
    }
    setState(wasOn ? "off" : "on");
  }

  const on = state === "on";
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={state === "loading" || state === "busy"}
        aria-pressed={on}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
          on ? "border-cobalt bg-cobalt text-white" : "border-line bg-white text-ink hover:border-cobalt"
        }`}
      >
        <span aria-hidden>{on ? "★" : "☆"}</span>
        {on ? "Following" : "Follow"}
      </button>
      {message ? (
        <p className="max-w-xs text-xs font-semibold text-amber-700">
          {message.text}{" "}
          {message.upgrade ? (
            <Link href="/pricing" className="text-cobalt underline">
              See plans
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
