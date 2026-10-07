"use client";

import { createClient } from "@/utils/supabase/client";

export const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
export const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export type LiveScore = {
  home: number | null;
  away: number | null;
};

export type FixtureLiveFields = {
  match_minute: number | null;
  current_score: LiveScore;
  status: string | null;
};

/** Raw `fixtures` UPDATE row from Realtime, plus the UI field names we merge into state. */
export type FixtureRealtimeRow = {
  id?: number | null;
  match_minute?: number | null;
  current_score?: LiveScore | string | null;
  status?: string | null;
  elapsed?: number | null;
  status_elapsed?: number | null;
  status_short?: string | null;
  home_goals?: number | null;
  away_goals?: number | null;
  goals_home?: number | null;
  goals_away?: number | null;
  score?: unknown;
};

export function liveFieldsFromRow(row: FixtureRealtimeRow | Record<string, unknown>): FixtureLiveFields {
  const record = row as Record<string, unknown>;
  return {
    match_minute: asNumber(record.match_minute) ?? asNumber(record.elapsed) ?? asNumber(record.status_elapsed),
    current_score: scoreFromRow(record),
    status: asText(record.status) ?? asText(record.status_short),
  };
}

export function subscribeFixtureUpdates(
  onUpdate: (row: FixtureRealtimeRow) => void,
  fixtureId?: number,
) {
  const supabase = createClient();
  const config = {
    event: "UPDATE" as const,
    schema: "public",
    table: "fixtures",
    ...(fixtureId != null ? { filter: `id=eq.${fixtureId}` } : {}),
  };
  const channel = supabase
    .channel(fixtureId != null ? `fixtures-live:${fixtureId}` : "fixtures-live")
    .on("postgres_changes", config, (payload) => {
      onUpdate((payload.new ?? {}) as FixtureRealtimeRow);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

function scoreFromRow(row: Record<string, unknown>): LiveScore {
  if (row.current_score != null) return parseScore(row.current_score);
  const packed = parsePackedScore(row.score);
  return {
    home: asNumber(row.home_goals) ?? asNumber(row.goals_home) ?? packed.home,
    away: asNumber(row.away_goals) ?? asNumber(row.goals_away) ?? packed.away,
  };
}

function parseScore(value: unknown): LiveScore {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d+)\s*[-–:]\s*(\d+)$/);
    if (!match) return { home: null, away: null };
    return { home: Number(match[1]), away: Number(match[2]) };
  }
  if (!value || typeof value !== "object") return { home: null, away: null };
  const record = value as Record<string, unknown>;
  return { home: asNumber(record.home), away: asNumber(record.away) };
}

function parsePackedScore(value: unknown): LiveScore {
  if (!value || typeof value !== "object") return { home: null, away: null };
  const record = value as Record<string, unknown>;
  const full = record.fulltime && typeof record.fulltime === "object" ? (record.fulltime as Record<string, unknown>) : null;
  return {
    home: asNumber(record.home) ?? asNumber(full?.home),
    away: asNumber(record.away) ?? asNumber(full?.away),
  };
}

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}
