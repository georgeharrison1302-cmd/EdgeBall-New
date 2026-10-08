import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type WatchRow = {
  kind: "team" | "fixture";
  entityId: number;
  label: string;
  href: string;
  next: { id: number; label: string; kickoff: string | null } | null;
};

export type AlertRow = {
  id: number;
  kind: "lineup" | "kickoff" | "tip";
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
};

export async function loadWatchlist(userId: string): Promise<{ items: WatchRow[]; alerts: AlertRow[] }> {
  const supabase = await createClient();
  const [{ data: items }, { data: alerts }] = await Promise.all([
    supabase
      .from("user_watchlist")
      .select("kind, entity_id, label, href")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_alerts")
      .select("id, kind, title, body, href, created_at, read_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const teamIds = (items ?? []).filter((row) => row.kind === "team").map((row) => Number(row.entity_id));
  const next = new Map<number, WatchRow["next"]>();
  if (teamIds.length > 0) {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: fixtures } = await admin
      .from("fixtures")
      .select("id, date, home_team_id, away_team_id")
      .gte("date", nowIso)
      .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
      .order("date")
      .limit(200);
    const involved = [...new Set((fixtures ?? []).flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is number => id != null))];
    const { data: teams } = involved.length
      ? await admin.from("teams").select("id, name").in("id", involved)
      : { data: [] as { id: number; name: string }[] };
    const names = new Map((teams ?? []).map((t) => [Number(t.id), t.name]));
    for (const fixture of fixtures ?? []) {
      const label = `${names.get(Number(fixture.home_team_id)) ?? "Home"} vs ${names.get(Number(fixture.away_team_id)) ?? "Away"}`;
      for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
        if (teamId != null && teamIds.includes(Number(teamId)) && !next.has(Number(teamId))) {
          next.set(Number(teamId), { id: Number(fixture.id), label, kickoff: fixture.date });
        }
      }
    }
  }

  return {
    items: (items ?? []).map((row) => ({
      kind: row.kind as WatchRow["kind"],
      entityId: Number(row.entity_id),
      label: row.label,
      href: row.href,
      next: row.kind === "team" ? next.get(Number(row.entity_id)) ?? null : null,
    })),
    alerts: (alerts ?? []).map((row) => ({
      id: Number(row.id),
      kind: row.kind as AlertRow["kind"],
      title: row.title,
      body: row.body,
      href: row.href,
      createdAt: row.created_at,
      read: row.read_at != null,
    })),
  };
}
