"use client";

import { useEffect, useState } from "react";

import {
  FINISHED_STATUSES,
  LIVE_STATUSES,
  liveFieldsFromRow,
  subscribeFixtureUpdates,
  type LiveScore,
} from "@/hooks/useFixturesRealtime";

export function LiveMatchClock({
  fixtureId,
  kickoff,
  initialStatus,
  initialScore,
  initialMinute = null,
}: {
  fixtureId: number;
  kickoff: string;
  initialStatus: string | null;
  initialScore: string | null;
  initialMinute?: number | null;
}) {
  const [live, setLive] = useState({
    status: initialStatus,
    current_score: parseScoreLabel(initialScore),
    match_minute: initialMinute,
  });

  const initialKey = `${fixtureId}|${initialStatus}|${initialScore}|${initialMinute}`;
  const [seenKey, setSeenKey] = useState(initialKey);
  if (seenKey !== initialKey) {
    setSeenKey(initialKey);
    setLive({
      status: initialStatus,
      current_score: parseScoreLabel(initialScore),
      match_minute: initialMinute,
    });
  }

  useEffect(() => {
    return subscribeFixtureUpdates((row) => {
      const patch = liveFieldsFromRow(row);
      setLive((current) => ({
        status: patch.status ?? current.status,
        current_score: {
          home: patch.current_score.home ?? current.current_score.home,
          away: patch.current_score.away ?? current.current_score.away,
        },
        match_minute: patch.match_minute ?? current.match_minute,
      }));
    }, fixtureId);
  }, [fixtureId]);

  const status = live.status ?? "";
  const ticking = LIVE_STATUSES.has(status);
  const finished = FINISHED_STATUSES.has(status);
  const hasScore = live.current_score.home != null && live.current_score.away != null;
  const label = hasScore ? `${live.current_score.home}–${live.current_score.away}` : kickoff;

  return (
    <div className="text-center">
      <p className="text-xs tracking-wide text-gray-500 uppercase">{hasScore || ticking || finished ? "Score" : "Kickoff"}</p>
      <p className="text-3xl font-semibold tracking-tight text-blue-600 tabular-nums">{label}</p>
      <p className="text-sm text-gray-500">
        {ticking && live.match_minute != null ? `${status} ${live.match_minute}'` : status}
      </p>
    </div>
  );
}

function parseScoreLabel(value: string | null): LiveScore {
  if (!value) return { home: null, away: null };
  const match = value.trim().match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!match) return { home: null, away: null };
  return { home: Number(match[1]), away: Number(match[2]) };
}
