import type { Metadata } from "next";

import {
  LadderHistory,
  LadderProgress,
  LadderTimeline,
  TodaysSelection,
} from "@/components/ladder/LadderBoard";
import { loadLadderPageData } from "@/lib/ladder/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ladder Challenge · EdgeBall",
  description: "AI Ladder Challenge — roll £10 toward £1,000 with daily 1.20–2.00 picks.",
};

export default async function LadderPage() {
  let data;
  let error: string | null = null;
  try {
    data = await loadLadderPageData();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Failed to load ladder";
    data = { activeRun: null, steps: [], history: [] };
  }

  const today = londonToday();
  const todayStep =
    data.steps.find((step) => step.date === today) ??
    data.steps.find((step) => step.result === "pending") ??
    null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
          Ladder Challenge
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink">
          £10 to £1,000
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every day the AI posts a single or double with combined odds between 1.20 and 2.00,
          staking the full pot. Wins roll over until the ladder hits £1,000 — or busts.
        </p>
      </header>

      {error ? (
        <p className="rounded-2xl border border-line bg-canvas px-4 py-6 text-sm text-muted">
          Ladder data could not be loaded ({error}).
        </p>
      ) : null}

      {data.activeRun ? (
        <>
          <LadderProgress run={data.activeRun} />
          <TodaysSelection step={todayStep} />
          <LadderTimeline steps={data.steps} />
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-canvas px-5 py-10 text-center">
          <p className="text-sm font-bold text-ink">No active ladder run</p>
          <p className="mt-1 text-sm text-muted">
            Call <code className="font-mono text-xs">GET /api/cron/ladder</code> with{" "}
            <code className="font-mono text-xs">CRON_SECRET</code> to start a £10 run and post
            today&apos;s step.
          </p>
        </section>
      )}

      <LadderHistory runs={data.history} />
    </main>
  );
}

function londonToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
