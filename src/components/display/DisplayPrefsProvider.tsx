"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  formatKickoff,
  formatMoney,
  formatOdds,
  formatOddsLabel,
  readStoredDisplayPrefs,
  resolveTimeZone,
  writeStoredDisplayPrefs,
  type CurrencyCode,
  type DisplayPrefs,
  type OddsFormat,
  UK_DEFAULTS,
} from "@/utils/display-prefs";

type DisplayPrefsContextValue = {
  prefs: DisplayPrefs;
  /** Resolved IANA zone (never `"browser"`). */
  timeZone: string;
  setPrefs: (patch: Partial<DisplayPrefs>) => void;
  formatOdds: (decimalOdds: number | null | undefined) => string | null;
  formatOddsLabel: (decimalOdds: number | null | undefined, prefix?: string) => string;
  formatMoney: (amount: number | null | undefined) => string;
  formatKickoff: (utc: string | number | Date | null | undefined) => string;
};

const DisplayPrefsContext = createContext<DisplayPrefsContextValue | null>(null);

export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<DisplayPrefs>(UK_DEFAULTS);
  const [browserZone, setBrowserZone] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    setPrefsState(readStoredDisplayPrefs());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredDisplayPrefs(prefs);
  }, [prefs, hydrated]);

  const setPrefs = useCallback((patch: Partial<DisplayPrefs>) => {
    setPrefsState((previous) => ({ ...previous, ...patch }));
  }, []);

  const timeZone = useMemo(
    () => resolveTimeZone(prefs.timeZone, browserZone),
    [prefs.timeZone, browserZone],
  );

  const value = useMemo<DisplayPrefsContextValue>(
    () => ({
      prefs,
      timeZone,
      setPrefs,
      formatOdds: (decimalOdds) => formatOdds(decimalOdds, prefs.oddsFormat),
      formatOddsLabel: (decimalOdds, prefix = "@") =>
        formatOddsLabel(decimalOdds, prefs.oddsFormat, prefix),
      formatMoney: (amount) => formatMoney(amount, prefs.currency),
      formatKickoff: (utc) => formatKickoff(utc, timeZone),
    }),
    [prefs, setPrefs, timeZone],
  );

  return <DisplayPrefsContext.Provider value={value}>{children}</DisplayPrefsContext.Provider>;
}

export function useDisplayPrefs() {
  const value = useContext(DisplayPrefsContext);
  if (!value) {
    // Safe fallback for components rendered outside the provider (tests / isolated trees).
    return {
      prefs: UK_DEFAULTS,
      timeZone: UK_DEFAULTS.timeZone,
      setPrefs: () => undefined,
      formatOdds: (decimalOdds: number | null | undefined) => formatOdds(decimalOdds, UK_DEFAULTS.oddsFormat),
      formatOddsLabel: (decimalOdds: number | null | undefined, prefix = "@") =>
        formatOddsLabel(decimalOdds, UK_DEFAULTS.oddsFormat, prefix),
      formatMoney: (amount: number | null | undefined) => formatMoney(amount, UK_DEFAULTS.currency),
      formatKickoff: (utc: string | number | Date | null | undefined) =>
        formatKickoff(utc, UK_DEFAULTS.timeZone),
    } satisfies DisplayPrefsContextValue;
  }
  return value;
}

export type { CurrencyCode, DisplayPrefs, OddsFormat };
