import Link from "next/link";

import { loadModelWatch } from "@/lib/home/model-watch";

/**
 * Homepage strip of pending model tips (next 48h) that pass the hardened
 * edge/odds guardrails. Every card links to its Match Hub and the section
 * links to the public record — picks are never shown without the ledger.
 */
export async function ModelWatch() {
  const tips = await loadModelWatch().catch((cause: unknown) => {
    console.error("[model-watch]", cause);
    return [];
  });
  if (tips.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
            Model watch
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Pending positive-edge picks within current guardrails, next 48h.
          </p>
        </div>
        <Link href="/record" className="text-xs font-bold text-cobalt hover:underline">
          Full track record →
        </Link>
      </header>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tips.map((tip) => (
          <li key={tip.tipKey}>
            <Link
              href={`/fixtures/${tip.fixtureId}`}
              className="block rounded-xl border border-line bg-canvas px-3.5 py-3 transition-colors hover:border-cobalt"
            >
              <p className="truncate text-sm font-bold text-ink">
                {tip.home} vs {tip.away}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-700">
                {tip.market}: {tip.selection}{" "}
                <span className="font-black text-ink">@{tip.odds.toFixed(2)}</span>
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-[11px] font-bold">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-cobalt">
                  +{tip.edgePct.toFixed(1)}% edge
                </span>
                <span className="text-muted">
                  model {(tip.modelProb * 100).toFixed(0)}%
                </span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
