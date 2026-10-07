import { LensPills } from "./LensPills";

/** Angle Finder presets — hide any chip with 0 matches in the active DTO. */
export const ANGLE_FILTERS = [
  { id: "all", label: "All angles" },
  { id: "hot", label: "🔥 Hot Streaks" },
  { id: "ref", label: "⚠️ Ref Card Traps" },
  { id: "sot", label: "🎯 SOT Overdue" },
  { id: "value", label: "💰 Value Edges" },
] as const;

export type AngleFilter = (typeof ANGLE_FILTERS)[number]["id"];

export type AngleFields = {
  form?: Array<boolean | null> | null;
  sotForm?: Array<boolean | null> | null;
  seasonSotPer90?: number | null;
  modelProb?: number | null;
  odds?: number | null;
  edgePct?: number | null;
  strictRef?: { avg: number } | null;
  highFoulSide?: boolean | null;
};

export function AngleFilters({
  current,
  onChange,
  available,
}: {
  current: AngleFilter;
  onChange: (id: AngleFilter) => void;
  available: Partial<Record<AngleFilter, boolean>>;
}) {
  const options = ANGLE_FILTERS.filter((option) => option.id === "all" || available[option.id]);
  if (options.length <= 1) return null;
  return <LensPills options={options} current={current} onChange={onChange} />;
}

export function matchesAngle(row: AngleFields, filter: AngleFilter) {
  if (filter === "all") return true;
  if (filter === "hot") return hotStreak(row.form);
  if (filter === "ref") return Boolean(row.strictRef && row.strictRef.avg > 4 && row.highFoulSide);
  if (filter === "sot") return sotOverdue(row.sotForm, row.seasonSotPer90);
  if (filter === "value") return hasValueEdge(row.modelProb, row.odds, row.edgePct);
  return true;
}

export function hotStreak(form: Array<boolean | null> | null | undefined) {
  const stored = (form ?? []).filter((item): item is boolean => item !== null);
  if (stored.length < 5) return false;
  return stored.slice(-5).filter(Boolean).length >= 4;
}

export function sotOverdue(
  form: Array<boolean | null> | null | undefined,
  seasonSotPer90: number | null | undefined,
) {
  const stored = (form ?? []).filter((item): item is boolean => item !== null);
  if (stored.length < 4 || seasonSotPer90 == null || seasonSotPer90 < 0.8) return false;
  return stored.filter(Boolean).length <= 1;
}

export function hasValueEdge(
  modelProb: number | null | undefined,
  odds: number | null | undefined,
  edgePct: number | null | undefined,
) {
  if (edgePct != null && Number.isFinite(edgePct) && edgePct > 0) return true;
  if (modelProb == null || odds == null || odds <= 1) return false;
  return modelProb > 1 / odds;
}

function hasStoredForm(form: Array<boolean | null> | null | undefined) {
  return (form ?? []).some((item) => item !== null);
}

/**
 * Dead-filter guard: Hot / SOT require stored match-log bits (empty FPS → hidden).
 * Ref / Value only appear when at least one row matches.
 */
export function angleAvailability(rows: AngleFields[]): Partial<Record<AngleFilter, boolean>> {
  const hasFormLogs = rows.some((row) => hasStoredForm(row.form));
  const hasSotLogs = rows.some((row) => hasStoredForm(row.sotForm));
  return {
    hot: hasFormLogs && rows.some((row) => hotStreak(row.form)),
    ref: rows.some((row) => Boolean(row.strictRef && row.strictRef.avg > 4 && row.highFoulSide)),
    sot: hasSotLogs && rows.some((row) => sotOverdue(row.sotForm, row.seasonSotPer90)),
    value: rows.some((row) => hasValueEdge(row.modelProb, row.odds, row.edgePct)),
  };
}
