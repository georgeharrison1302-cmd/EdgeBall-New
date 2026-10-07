import { createIngestClient } from "../src/utils/supabase/admin";

const TIMEZONE = "Europe/London";
const SCHEDULED_STATUSES = ["NS", "TBD"] as const;
const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"] as const;
const WATCH_STATUSES = [...SCHEDULED_STATUSES, ...LIVE_STATUSES];

type ApiFixtureItem = {
  fixture?: {
    id?: number;
    timezone?: string | null;
    status?: { short?: string | null; long?: string | null; elapsed?: number | null } | null;
  };
  league?: { id?: number; name?: string | null } | null;
  teams?: {
    home?: { name?: string | null } | null;
    away?: { name?: string | null } | null;
  };
  goals?: { home?: number | null; away?: number | null } | null;
  score?: unknown;
};

type FixturesEnvelope = {
  response?: ApiFixtureItem[];
};

type LiveRow = {
  id: number;
  status_short: string | null;
  status_long: string | null;
  elapsed: number | null;
  timezone: string;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
};

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("Missing API_FOOTBALL_KEY");
  }

  const supabase = createIngestClient();
  const watchCount = await todaysWatchCount(supabase);
  if (watchCount === 0) {
    console.log("no scheduled or live matches today; skipping live endpoint");
    return;
  }

  const leagueIds = new Set(await cachedLeagueIds(supabase));
  console.log(
    `today watch fixtures ${watchCount}; tracked leagues ${leagueIds.size}; fetching live=all`,
  );

  const items = await fetchLiveAll(apiKey);
  const tracked = items.filter((item) => {
    const leagueId = item.league?.id;
    return leagueId != null && leagueIds.has(leagueId);
  });

  console.log(`live endpoint ${items.length} worldwide; ${tracked.length} in tracked leagues`);

  if (tracked.length === 0) {
    console.log("no live matches in tracked leagues");
    return;
  }

  const rows = tracked
    .map(mapLiveRow)
    .filter((row): row is LiveRow => row != null);

  const { error } = await supabase.from("fixtures").upsert(rows, { onConflict: "id" });
  if (error) throw error;

  for (const item of tracked) {
    const id = item.fixture?.id ?? "?";
    const short = item.fixture?.status?.short ?? "?";
    const elapsed = item.fixture?.status?.elapsed;
    const minute = elapsed == null ? "" : ` ${elapsed}'`;
    const home = item.teams?.home?.name ?? "Home";
    const away = item.teams?.away?.name ?? "Away";
    const homeGoals = item.goals?.home ?? 0;
    const awayGoals = item.goals?.away ?? 0;
    const league = item.league?.name ?? "league";
    console.log(
      `live ${short}${minute} ${home} ${homeGoals}-${awayGoals} ${away} [${league}] id=${id}`,
    );
  }

  console.log(`live sync done updated=${rows.length}`);
}

async function todaysWatchCount(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const { from, to } = londonDayBounds();

  const today = await supabase
    .from("fixtures")
    .select("id", { count: "exact", head: true })
    .gte("date", from)
    .lt("date", to)
    .in("status_short", [...WATCH_STATUSES]);
  if (today.error) throw today.error;

  if ((today.count ?? 0) > 0) return today.count ?? 0;

  const live = await supabase
    .from("fixtures")
    .select("id", { count: "exact", head: true })
    .in("status_short", [...LIVE_STATUSES]);
  if (live.error) throw live.error;

  return live.count ?? 0;
}

async function cachedLeagueIds(
  supabase: ReturnType<typeof createIngestClient>,
) {
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("leagues")
      .select("id")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function fetchLiveAll(apiKey: string) {
  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("live", "all");
  url.searchParams.set("timezone", TIMEZONE);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}`);
  }

  const payload = (await response.json()) as FixturesEnvelope;
  return payload.response ?? [];
}

function mapLiveRow(item: ApiFixtureItem): LiveRow | null {
  const id = item.fixture?.id;
  if (!id) return null;

  return {
    id,
    status_short: item.fixture?.status?.short ?? null,
    status_long: item.fixture?.status?.long ?? null,
    elapsed: item.fixture?.status?.elapsed ?? null,
    timezone: item.fixture?.timezone ?? TIMEZONE,
    home_goals: item.goals?.home ?? null,
    away_goals: item.goals?.away ?? null,
    score: item.score ?? {},
  };
}

function londonDayBounds() {
  const today = londonYmd(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return { from: today, to: tomorrow };
}

function londonYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
