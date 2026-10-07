"use client";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";

/** Prefs-aware odds label. Pass decimal; display follows footer Odds format. */
export function OddsText({
  decimal,
  prefix = "@",
  fallback = "No Book Odds",
}: {
  decimal: number | null | undefined;
  prefix?: string;
  fallback?: string;
}) {
  const { formatOdds, formatOddsLabel } = useDisplayPrefs();
  if (decimal == null || !Number.isFinite(decimal) || decimal <= 1) {
    return <>{fallback}</>;
  }
  if (prefix === "") {
    return <>{formatOdds(decimal) ?? fallback}</>;
  }
  return <>{formatOddsLabel(decimal, prefix)}</>;
}
