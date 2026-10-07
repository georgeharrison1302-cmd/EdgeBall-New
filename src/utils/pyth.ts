export function isMissingRelation(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  const blob = `${code} ${message}`;
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST204" ||
    /42703|42P01|PGRST200|PGRST204|Could not find the table|Could not find the|does not exist|schema cache/i.test(blob)
  );
}

export function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function nestNumber(value: unknown, ...path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return asNumber(current);
}

export function nestText(value: unknown, ...path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

export function fixtureGoals(row: {
  home_goals?: number | null;
  away_goals?: number | null;
  score?: unknown;
}) {
  const home = asNumber(row.home_goals) ?? nestNumber(row.score, "fulltime", "home");
  const away = asNumber(row.away_goals) ?? nestNumber(row.score, "fulltime", "away");
  return { home, away };
}

export function scoreLabel(row: {
  home_goals?: number | null;
  away_goals?: number | null;
  score?: unknown;
}) {
  const { home, away } = fixtureGoals(row);
  if (home == null || away == null) return null;
  return `${home}–${away}`;
}

export function standingSide(stats: unknown) {
  const row = asRecord(stats);
  const goals = asRecord(row?.goals);
  return {
    played: asNumber(row?.played),
    win: asNumber(row?.win),
    draw: asNumber(row?.draw),
    lose: asNumber(row?.lose),
    goalsFor: asNumber(goals?.for),
    goalsAgainst: asNumber(goals?.against),
  };
}

export function predictionPercents(percent: unknown) {
  const row = asRecord(percent);
  return {
    home: typeof row?.home === "string" ? row.home : null,
    draw: typeof row?.draw === "string" ? row.draw : null,
    away: typeof row?.away === "string" ? row.away : null,
  };
}
