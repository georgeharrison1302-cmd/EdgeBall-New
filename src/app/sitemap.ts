import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/entities";
import { createAdminClient } from "@/utils/supabase/admin";

export const revalidate = 3600;

const STATIC_ROUTES = [
  "",
  "/props",
  "/match-props",
  "/generator",
  "/ladder",
  "/competitions",
  "/referees",
  "/record",
  "/pricing",
  "/terms",
  "/privacy",
  "/responsible-gambling",
  "/affiliate-disclosure",
];

const DAY = 24 * 60 * 60 * 1000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "hourly" : "daily",
    priority: path === "" ? 1 : 0.7,
  }));

  try {
    const supabase = createAdminClient();
    const upcomingFrom = now.toISOString();
    const [upcoming, recent, leagues] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, date")
        .gte("date", upcomingFrom)
        .lte("date", new Date(now.getTime() + 14 * DAY).toISOString())
        .order("date")
        .limit(1000),
      supabase
        .from("fixtures")
        .select("id, date")
        .gte("date", new Date(now.getTime() - 7 * DAY).toISOString())
        .lt("date", upcomingFrom)
        .order("date", { ascending: false })
        .limit(500),
      supabase.from("league_seasons").select("league_id").limit(1000),
    ]);

    const teamSeasons: { team_id: number; league_id: number }[] = [];
    for (let from = 0; from < 12000; from += 1000) {
      const { data } = await supabase
        .from("team_seasons")
        .select("team_id, league_id, season")
        .order("season", { ascending: false })
        .range(from, from + 999);
      teamSeasons.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }

    for (const row of [...(upcoming.data ?? []), ...(recent.data ?? [])]) {
      entries.push({
        url: `${SITE_URL}/fixtures/${row.id}`,
        lastModified: row.date ? new Date(row.date) : now,
        changeFrequency: "hourly",
        priority: 0.8,
      });
    }

    for (const id of new Set((leagues.data ?? []).map((row) => Number(row.league_id)))) {
      entries.push({ url: `${SITE_URL}/competitions/${id}`, lastModified: now, changeFrequency: "daily", priority: 0.7 });
    }

    const seenTeams = new Set<number>();
    for (const row of teamSeasons) {
      const teamId = Number(row.team_id);
      if (seenTeams.has(teamId)) continue;
      seenTeams.add(teamId);
      entries.push({
        url: `${SITE_URL}/competitions/${row.league_id}/teams/${teamId}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  } catch {
    /* fall back to the static routes if the database is unreachable */
  }

  return entries;
}
