"use client";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";

/** Prefs-aware kickoff label (UK default via DisplayPrefs). */
export function KickoffText({
  utc,
  fallback = "",
}: {
  utc: string | number | Date | null | undefined;
  fallback?: string;
}) {
  const { formatKickoff } = useDisplayPrefs();
  const label = formatKickoff(utc);
  return <>{label || fallback}</>;
}
