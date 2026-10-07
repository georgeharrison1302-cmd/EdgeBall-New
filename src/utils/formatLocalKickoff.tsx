import type { ReactNode } from "react";

import { KickoffText } from "@/components/display/KickoffText";
import { formatKickoff, UK_DEFAULTS } from "@/utils/display-prefs";

/** UTC instant from Supabase: ISO string, unix seconds, or unix milliseconds. */
export function formatLocalKickoff(
  utc: string | number | Date | null | undefined,
  timeZone: string = UK_DEFAULTS.timeZone,
): string {
  return formatKickoff(utc, timeZone);
}

/** Prefs-aware kickoff when rendered under DisplayPrefsProvider; else UK default. */
export function LocalKickoff({
  utc,
  timeZone,
}: {
  utc: string | number | Date | null | undefined;
  /** Optional override; omit to follow footer Time pref. */
  timeZone?: string;
}): ReactNode {
  if (timeZone) {
    return <>{formatLocalKickoff(utc, timeZone)}</>;
  }
  return <KickoffText utc={utc} />;
}
