import type { FixtureMatch } from "./types";

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P"]);
/** Treat a kickoff as finished once it is this far in the past. */
export const LIVE_WINDOW_MS = 150 * 60 * 1000;

/**
 * Time-aware fixture tab bucket.
 * Status strings can lag behind the worker, so kickoff vs Date.now() is the fallback.
 */
export function fixtureBucket(
  status: string | null | undefined,
  kickoffAt: string | number | Date | null | undefined,
  now = Date.now(),
): FixtureMatch["bucket"] {
  const short = String(status ?? "").trim().toUpperCase();
  const kickoffMs = parseKickoffMs(kickoffAt);

  if (FINISHED_STATUSES.has(short)) return "finished";
  if (kickoffMs != null && now - kickoffMs > LIVE_WINDOW_MS) return "finished";

  if (LIVE_STATUSES.has(short)) return "live";
  if (kickoffMs != null && kickoffMs <= now && now - kickoffMs <= LIVE_WINDOW_MS) return "live";

  if (short === "NS" && kickoffMs != null && kickoffMs > now) return "upcoming";

  return "other";
}

/** Parse Supabase/Postgres kickoff timestamps safely for absolute comparisons. */
export function parseKickoffMs(value: string | number | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // "2026-10-04 12:00:00+00" / "2026-10-04T12:00:00Z"
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}
