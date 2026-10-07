"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { ValueAngle } from "@/app/match-hub/load-top-angles";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { FormStrip } from "@/components/stats/FormStrip";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

function AngleCardShell({
  motionReady,
  reduceMotion,
  children,
  className,
}: {
  motionReady: boolean;
  reduceMotion: boolean | null;
  children: ReactNode;
  className: string;
}) {
  if (motionReady && !reduceMotion) {
    return (
      <motion.article
        whileTap={{ scale: 0.98 }}
        transition={SPRING}
        className={className}
      >
        {children}
      </motion.article>
    );
  }
  return <article className={className}>{children}</article>;
}

/**
 * Sliding Top Angles rail — edge > 5% and factor setups.
 * Native snap scroll for SSR; motion only after mount to avoid hydration drift.
 */
export function ValueCarousel({ angles }: { angles: ValueAngle[] }) {
  const slip = useBetSlip();
  const reduceMotion = useReducedMotion();
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setMotionReady(true);
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
            Top Value Angles
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-[#0f172a]">
            Activation radar
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Top {Math.min(5, angles.length) || 5} setups with +Edge% &gt; 5 or a triggered Fixture Factor.
          </p>
        </div>
        {angles.length > 0 ? (
          <p className="text-xs font-semibold text-[#64748b]">Swipe →</p>
        ) : null}
      </div>

      {angles.length === 0 ? (
        <EmptyReason
          detail="No priced props with edge over 5% and no triggered factors yet"
          source="prematch_odds / factors"
        />
      ) : (
        <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
          {angles.map((angle, index) => {
            const priced = angle.decimalOdds != null && angle.decimalOdds > 1;
            const added = slip?.hasLeg(angle.id) ?? false;

            return (
              <AngleCardShell
                key={angle.id}
                motionReady={motionReady}
                reduceMotion={reduceMotion}
                className="flex w-[min(100%,300px)] shrink-0 snap-start flex-col rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2563eb] text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                      angle.kind === "edge"
                        ? "bg-[#ecfeff] text-[#0e7490]"
                        : "bg-[#eff6ff] text-[#2563eb]"
                    }`}
                  >
                    {angle.kind === "edge"
                      ? `+${(angle.edgePct ?? 0).toFixed(1)}% edge`
                      : "Factor"}
                  </span>
                </div>

                <Link href={angle.hubHref} className="mt-3 hover:opacity-90">
                  <p className="text-sm font-bold text-[#0f172a]">{angle.match}</p>
                </Link>
                <p className="mt-2 text-sm leading-relaxed text-[#475569]">{angle.narrative}</p>
                <p className="mt-2 text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
                  {angle.selectionLabel}
                </p>

                <div className="mt-3 flex-1">
                  <FormStrip
                    outcomes={angle.form}
                    label={/card|booked/i.test(angle.selectionLabel) ? "Booked" : "Over"}
                  />
                </div>

                <div className="mt-4">
                  {priced ? (
                    <button
                      type="button"
                      disabled={added || !slip}
                      onClick={() => {
                        if (!slip || added || !priced) return;
                        slip.addLeg({
                          id: angle.id,
                          marketName: angle.selectionLabel,
                          decimalOdds: angle.decimalOdds!,
                          label: angle.selectionLabel,
                          match: angle.match,
                          player: angle.player,
                          fixtureId: angle.fixtureId ?? undefined,
                          marketKind: angle.marketKind,
                          line: angle.line,
                        });
                        slip.setOpen(true);
                      }}
                      className={`w-full rounded-full px-4 py-3.5 text-sm font-black shadow-sm transition active:scale-[0.98] ${
                        added
                          ? "border-2 border-[#2563eb] bg-blue-50 text-[#2563eb]"
                          : "bg-[#2563eb] text-white shadow-blue-600/20 hover:bg-[#1d4ed8]"
                      }`}
                    >
                      {added
                        ? "On slip"
                        : `Add to Slip @ ${angle.decimalOdds!.toFixed(2)}`}
                    </button>
                  ) : (
                    <p className="rounded-full border border-[#e2e8f0] bg-[#eef3f9] px-4 py-3 text-center text-sm font-semibold text-[#94a3b8]">
                      No Book Odds
                    </p>
                  )}
                </div>
              </AngleCardShell>
            );
          })}
        </div>
      )}
    </section>
  );
}
