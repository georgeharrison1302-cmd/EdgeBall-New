"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { createClient } from "@/utils/supabase/client";

type Conviction = {
  active: boolean;
  player_id: number;
  player_fouls: number;
  referee_cards: number;
};

type LiveFixture = {
  id: number;
  /** Kickoff ISO from feed (`date` on fixtures; API may alias as kickoff_at). */
  date?: string | null;
  kickoff_at?: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  referee: string | null;
  high_conviction_card_edge?: Conviction | null;
};

type PlayerCard = { name: string; photo: string | null };

export default function CardWatch() {
  const { formatKickoff } = useDisplayPrefs();
  const [fixtures, setFixtures] = useState<LiveFixture[]>([]);
  const [players, setPlayers] = useState<Record<number, PlayerCard>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.functions.invoke("upcoming-fixtures");
      if (cancelled) return;
      const rows = data && Array.isArray(data.fixtures) ? (data.fixtures as LiveFixture[]) : null;
      if (error || !rows) {
        setStatus("error");
        return;
      }
      setFixtures(rows);
      const ids = rows
        .map((row) => (row.high_conviction_card_edge?.active ? row.high_conviction_card_edge.player_id : null))
        .filter((id): id is number => id != null);
      if (ids.length > 0) {
        const [{ data: people }, { data: profiles }] = await Promise.all([
          supabase.from("players").select("id, name, photo").in("id", ids),
          supabase.from("player_profiles").select("player_id, name, photo").in("player_id", ids),
        ]);
        if (!cancelled) {
          const next: Record<number, PlayerCard> = {};
          const profileById = new Map((profiles ?? []).map((row) => [Number(row.player_id), row]));
          for (const id of ids) {
            const person = (people ?? []).find((row) => Number(row.id) === id);
            const profile = profileById.get(id);
            const name =
              (typeof person?.name === "string" && person.name.trim() ? person.name : null) ??
              (typeof profile?.name === "string" && profile.name.trim() ? profile.name : null) ??
              `Player ${id}`;
            const photo =
              (typeof person?.photo === "string" && person.photo ? person.photo : null) ??
              (typeof profile?.photo === "string" && profile.photo ? profile.photo : null);
            next[id] = { name, photo };
          }
          setPlayers(next);
        }
      }
      if (!cancelled) setStatus("ready");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const alerts = fixtures.filter((fixture) => fixture.high_conviction_card_edge?.active === true);
  const lead = alerts[0];
  const edge = lead?.high_conviction_card_edge?.active ? lead.high_conviction_card_edge : null;
  const player = edge ? players[edge.player_id] : undefined;

  return (
    <section className="flex h-full flex-col rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <p className="text-[10px] font-semibold tracking-wide text-[#2563eb] uppercase">Card watch</p>
      <p className="mt-1 text-xs text-[#64748b]">Referee at least 5.50 yellows and a player at least 1.80 fouls committed, both from 10 or more matches.</p>
      {status === "loading" ? <p className="mt-6 text-sm text-[#64748b]">Loading live fixtures…</p> : null}
      {status === "error" ? <p className="mt-6 text-sm text-[#64748b]">The live fixture feed did not respond.</p> : null}
      {status === "ready" && !edge ? (
        <p className="mt-6 text-sm text-[#64748b]">
          No match in the next 48 hours meets both lines (fixtures / player_season_stats).
        </p>
      ) : null}
      {lead && edge ? (
        <div className="mt-4 flex flex-1 flex-col">
          <div className="flex items-center gap-3">
            {player?.photo ? (
              <img src={player.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eff6ff] text-lg font-semibold text-[#2563eb]">
                {(player?.name ?? "P").slice(0, 1)}
              </span>
            )}
            <div>
              <h2 className="text-xl font-semibold text-[#0f172a]">{player?.name ?? `Player ${edge.player_id}`}</h2>
              <p className="text-xs text-[#64748b]">
                {lead.home_team_name ?? "Home"} v {lead.away_team_name ?? "Away"}
              </p>
              <p className="text-xs font-semibold text-[#2563eb]">
                {formatKickoff(lead.date ?? lead.kickoff_at)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-[#e2e8f0] px-3 py-3">
              <p className="text-[10px] tracking-wide text-[#64748b] uppercase">Fouls committed</p>
              <p className="mt-1 text-lg font-semibold text-[#2563eb]">{Number(edge.player_fouls).toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-[#e2e8f0] px-3 py-3">
              <p className="text-[10px] tracking-wide text-[#64748b] uppercase">Referee yellows</p>
              <p className="mt-1 text-lg font-semibold text-[#2563eb]">{Number(edge.referee_cards).toFixed(2)}</p>
              <p className="mt-1 text-xs text-[#64748b]">
                {lead.referee ?? "Referee not stored (fixtures)"}
              </p>
            </div>
          </div>
          <Link href={`/fixtures/${lead.id}`} className="mt-4 rounded-full bg-[#2563eb] px-4 py-2.5 text-center text-sm font-semibold text-white">
            Open match
          </Link>
        </div>
      ) : null}
    </section>
  );
}

