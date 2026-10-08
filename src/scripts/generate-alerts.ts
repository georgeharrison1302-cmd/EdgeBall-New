/**
 * Generate in-app alerts for Premium users from their watchlists.
 *
 *   npm run alerts:generate
 *
 * Rules live in src/lib/alerts/rules.ts (lineup confirmed, kickoff within the
 * hour, new model tip). Inserts are deduplicated per (user, dedupe_key).
 */
import { alertsFor, type FixtureState, type WatchItem } from "@/lib/alerts/rules";
import { alertEmailConfigured, sendAlertDigest } from "@/lib/alerts/email";
import { isMissingRelation } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

const HOUR = 60 * 60 * 1000;
const CHUNK = 200;

async function main() {
  const supabase = createIngestClient();
  const now = Date.now();

  const { data: subs, error: subError } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("subscription_status", "active");
  if (subError) throw subError;
  const premium = new Set((subs ?? []).map((row) => String(row.user_id)));
  if (premium.size === 0) {
    console.log("alerts: no active subscribers");
    return;
  }

  const { data: watch, error: watchError } = await supabase
    .from("user_watchlist")
    .select("user_id, kind, entity_id, created_at");
  if (watchError) {
    if (isMissingRelation(watchError)) {
      console.log("alerts: user_watchlist not created yet — run the watchlist migration");
      return;
    }
    throw watchError;
  }
  const byUser = new Map<string, WatchItem[]>();
  for (const row of watch ?? []) {
    const userId = String(row.user_id);
    if (!premium.has(userId)) continue;
    const list = byUser.get(userId) ?? [];
    list.push({ kind: row.kind as WatchItem["kind"], entityId: Number(row.entity_id), createdAt: row.created_at });
    byUser.set(userId, list);
  }
  if (byUser.size === 0) {
    console.log("alerts: no premium watchlists");
    return;
  }

  const allItems = [...byUser.values()].flat();
  const fixtureIds = new Set(allItems.filter((i) => i.kind === "fixture").map((i) => i.entityId));
  const teamIds = [...new Set(allItems.filter((i) => i.kind === "team").map((i) => i.entityId))];

  const fixtureRows = new Map<number, { id: number; date: string | null; status_short: string | null; home_team_id: number | null; away_team_id: number | null }>();
  const window = {
    from: new Date(now - HOUR).toISOString(),
    to: new Date(now + 36 * HOUR).toISOString(),
  };
  for (let i = 0; i < teamIds.length; i += CHUNK) {
    const ids = teamIds.slice(i, i + CHUNK).join(",");
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, date, status_short, home_team_id, away_team_id")
      .gte("date", window.from)
      .lte("date", window.to)
      .or(`home_team_id.in.(${ids}),away_team_id.in.(${ids})`);
    if (error) throw error;
    for (const row of data ?? []) fixtureRows.set(Number(row.id), row);
  }
  const directIds = [...fixtureIds];
  for (let i = 0; i < directIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, date, status_short, home_team_id, away_team_id")
      .in("id", directIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data ?? []) fixtureRows.set(Number(row.id), row);
  }

  const ids = [...fixtureRows.keys()];
  const names = new Map<number, string>();
  const lineups = new Set<number>();
  const tipsByFixture = new Map<number, FixtureState["tips"]>();
  const teamNeeded = [...new Set([...fixtureRows.values()].flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is number => id != null))];
  for (let i = 0; i < teamNeeded.length; i += CHUNK) {
    const { data } = await supabase.from("teams").select("id, name").in("id", teamNeeded.slice(i, i + CHUNK));
    for (const row of data ?? []) names.set(Number(row.id), row.name);
  }
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [{ data: lu }, { data: tips }] = await Promise.all([
      supabase.from("fixture_lineups").select("fixture_id, start_xi").in("fixture_id", chunk),
      supabase.from("model_tips").select("tip_key, fixture_id, selection, edge_pct, generated_at").in("fixture_id", chunk),
    ]);
    for (const row of lu ?? []) {
      if (Array.isArray(row.start_xi) && row.start_xi.length > 0) lineups.add(Number(row.fixture_id));
    }
    for (const row of tips ?? []) {
      const list = tipsByFixture.get(Number(row.fixture_id)) ?? [];
      list.push({ key: row.tip_key, selection: row.selection, edgePct: Number(row.edge_pct), generatedAt: row.generated_at });
      tipsByFixture.set(Number(row.fixture_id), list);
    }
  }

  const states: FixtureState[] = [...fixtureRows.values()].map((row) => ({
    id: Number(row.id),
    label: `${names.get(Number(row.home_team_id)) ?? "Home"} vs ${names.get(Number(row.away_team_id)) ?? "Away"}`,
    kickoff: row.date,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    status: row.status_short,
    lineupsConfirmed: lineups.has(Number(row.id)),
    tips: tipsByFixture.get(Number(row.id)) ?? [],
  }));

  let created = 0;
  const emailed: { userId: string; alerts: { title: string; body: string | null; href: string | null }[] }[] = [];
  for (const [userId, items] of byUser) {
    const rows = alertsFor(items, states, now).map((alert) => ({
      user_id: userId,
      dedupe_key: alert.dedupeKey,
      kind: alert.kind,
      title: alert.title,
      body: alert.body,
      href: alert.href,
    }));
    if (rows.length === 0) continue;
    const keys = rows.map((row) => row.dedupe_key);
    const { data: existing, error: existingError } = await supabase
      .from("user_alerts")
      .select("dedupe_key")
      .eq("user_id", userId)
      .in("dedupe_key", keys);
    if (existingError) throw existingError;
    const seen = new Set((existing ?? []).map((row) => row.dedupe_key));
    const fresh = rows.filter((row) => !seen.has(row.dedupe_key));
    if (fresh.length === 0) continue;
    const { error } = await supabase.from("user_alerts").insert(fresh);
    if (error) throw error;
    created += fresh.length;
    if (alertEmailConfigured()) emailed.push({ userId, alerts: fresh });
  }

  if (alertEmailConfigured() && emailed.length > 0) {
    let sent = 0;
    for (const entry of emailed) {
      const { data } = await supabase.auth.admin.getUserById(entry.userId);
      const email = data.user?.email;
      if (!email) continue;
      if (
        await sendAlertDigest(
          email,
          entry.alerts.map((alert) => ({
            title: alert.title,
            body: alert.body,
            href: alert.href,
          })),
        )
      ) {
        sent += 1;
      }
    }
    console.log(`alerts: emailed ${sent}/${emailed.length} users`);
  }

  console.log(`alerts: ${created} new for ${byUser.size} premium watchlists`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
