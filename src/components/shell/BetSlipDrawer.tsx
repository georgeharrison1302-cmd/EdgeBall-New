"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { checkCorrelation } from "@/utils/betslip/checkCorrelation";
import { createClient } from "@/utils/supabase/client";

export function BetSlipDrawer() {
  const slip = useBetSlip();
  const { prefs, formatOddsLabel, formatOdds, formatMoney } = useDisplayPrefs();
  const [stakeInput, setStakeInput] = useState("10");
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const legs = slip?.legs ?? [];
  const open = slip?.open ?? false;
  const setOpen = slip?.setOpen;
  const removeLeg = slip?.removeLeg;
  const clear = slip?.clear;
  const totalOdds = slip?.totalOdds ?? null;
  const count = legs.length;
  const stake = Number(stakeInput);
  const stakeOk = Number.isFinite(stake) && stake > 0;
  const returns = stakeOk && totalOdds != null ? stake * totalOdds : null;
  const conflicts = useMemo(() => checkCorrelation(legs), [legs]);
  const conflictedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of conflicts) {
      for (const id of conflict.legIds) ids.add(String(id));
    }
    return ids;
  }, [conflicts]);

  if (!slip || !setOpen || !removeLeg || !clear) return null;

  async function saveToPortfolio() {
    setSaveNote(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaveNote("Sign in to save slips to your portfolio.");
        setSaving(false);
        return;
      }
      const response = await fetch("/api/portfolio/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stake,
          currency: prefs.currency,
          legs,
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        setSaveNote(payload.error ?? "Could not save slip.");
        setSaving(false);
        return;
      }
      clear?.();
      setSaveNote("Saved to portfolio.");
    } catch {
      setSaveNote("Could not save slip.");
    }
    setSaving(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-cobalt px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 lg:right-6"
        aria-label={count ? `Open bet slip, ${count} legs` : "Open bet slip"}
      >
        <span aria-hidden="true">📋</span>
        Slip
        {count > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-cobalt px-1.5 text-[11px] font-extrabold text-white">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px]"
          aria-label="Close bet slip"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
              Bet slip
            </p>
            <h2 className="text-lg font-bold text-ink">
              {count === 0 ? "No legs yet" : `${count} leg${count === 1 ? "" : "s"}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {count === 0 ? (
            <EmptyReason
              variant="center"
              title="No legs yet"
              detail="Add priced props from Player Props or Match Props — unpriced rows stay out of the slip"
              source="prematch_odds"
            />
          ) : (
            <>
              {conflicts.length > 0 ? (
                <div className="mb-4 space-y-2" role="alert">
                  {conflicts.map((conflict) => (
                    <p
                      key={conflict.id}
                      className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
                    >
                      {conflict.message}
                    </p>
                  ))}
                </div>
              ) : null}
              <ul className="space-y-3">
                {legs.map((leg) => {
                  const flagged = conflictedIds.has(String(leg.id));
                  return (
                    <li
                      key={String(leg.id)}
                      className={`rounded-2xl border px-4 py-3 shadow-sm ${
                        flagged
                          ? "border-amber-300 bg-amber-50/80"
                          : "border-line bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">
                            {leg.label ?? leg.marketName}
                          </p>
                          {leg.match ? (
                            <p className="mt-0.5 truncate text-xs text-muted">{leg.match}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <p className="inline-flex rounded-full bg-cobalt px-2.5 py-1 text-xs font-bold text-white">
                              {formatOddsLabel(leg.decimalOdds as number)}
                            </p>
                            {flagged ? (
                              <span className="inline-flex rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-amber-900 uppercase">
                                Conflict
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLeg(leg.id)}
                          className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-muted hover:bg-white hover:text-red-600"
                          aria-label={`Remove ${leg.marketName}`}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="border-t border-line bg-white px-5 py-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-muted">Stake</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={stakeInput}
              onChange={(event) => setStakeInput(event.target.value)}
              className="w-28 rounded-full border border-line px-3 py-1.5 text-right text-sm font-semibold tabular-nums text-ink outline-none focus:border-cobalt"
              aria-label="Stake amount"
            />
          </label>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-muted">Combined odds</span>
            <span className="text-lg font-bold tabular-nums text-cobalt">
              {totalOdds == null ? "—" : formatOdds(totalOdds) ?? "—"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-muted">Returns</span>
            <span className="text-lg font-bold tabular-nums text-ink">
              {returns == null ? "—" : formatMoney(returns)}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={count === 0}
              onClick={() => clear()}
              className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-muted disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={count === 0 || !stakeOk || saving}
              onClick={() => void saveToPortfolio()}
              className="flex-1 rounded-full bg-cobalt px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save to Portfolio"}
            </button>
          </div>
          {saveNote ? (
            <p className="mt-2 text-xs text-muted">
              {saveNote}{" "}
              {saveNote.includes("Sign in") ? (
                <Link href="/auth/login" className="font-semibold text-cobalt">
                  Sign in
                </Link>
              ) : null}
              {saveNote.includes("Saved") ? (
                <Link href="/portfolio" className="font-semibold text-cobalt">
                  Open portfolio
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
