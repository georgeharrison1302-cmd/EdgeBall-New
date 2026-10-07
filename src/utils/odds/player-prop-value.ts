import { asNumber, asRecord } from "@/utils/pyth";
import { cleanPersonName } from "@/utils/text/html-entities";

/**
 * Parse Bet365 / API-Football player prop values.
 *
 * Shapes:
 * - Cards: `{ player_id, value: "C. Zafeiris", label: "Christos Zafeiris (Booked)", model_prob, edge_pct }`
 * - Name-line: `{ value: "Dominic Calvert-Lewin - 2", odd }`  (no player_id)
 * - Name-only: `{ value: "Joel Pohjanpalo", odd }` (goalscorer)
 * - Occasional: `value` itself is a JSON string carrying name/line/model fields
 */

export type ParsedPlayerPropValue = {
  playerId: number | null;
  playerName: string;
  /** Raw threshold from "Name - N" (e.g. 2). */
  line: number | null;
  /** Normalized book selection, e.g. "Over 1.5" or "Anytime". */
  selection: string;
  odd: number | null;
  modelProb: number | null;
  edgePct: number | null;
  rawLabel: string;
};

export type SquadNameEntry = {
  playerId: number;
  teamId: number;
  name: string;
};

export function normalizePlayerName(name: string) {
  return cleanPersonName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function lastNameInitialKey(name: string) {
  const parts = normalizePlayerName(name).split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1];
  const initial = parts[0]?.[0] ?? "";
  return `${last}:${initial}`;
}

/** "Dominic Calvert-Lewin - 2" → name + line. Hyphenated surnames stay intact. */
export function splitNameLine(raw: string): { name: string; line: number | null } {
  const text = raw.trim();
  if (!text) return { name: "", line: null };

  const match = text.match(/^(.*?)\s+[-–]\s*(\d+(?:\.\d+)?)\s*$/);
  if (match) {
    const name = match[1].trim();
    const line = Number(match[2]);
    if (name && Number.isFinite(line)) return { name, line };
  }
  return { name: text, line: null };
}

/** Integer threshold N → Over (N - 0.5); half-lines stay as Over N. */
export function selectionFromLine(line: number | null, fallback = "Anytime"): string {
  if (line == null || !Number.isFinite(line)) return fallback;
  if (Number.isInteger(line)) {
    return `Over ${(line - 0.5).toFixed(1)}`;
  }
  return `Over ${line}`;
}

/**
 * Pull model/edge from a value record.
 * Prefer direct fields; if `value`/`label` is stringified JSON, parse nested model fields.
 */
export function extractModelEdge(
  value: unknown,
  rowModel: number | null = null,
  rowEdge: number | null = null,
): { modelProb: number | null; edgePct: number | null } {
  const rec = asRecord(value) ?? {};
  let modelProb = sanitizeModel(asNumber(rec.model_prob));
  let edgePct = asNumber(rec.edge_pct);

  if (modelProb == null || edgePct == null) {
    for (const key of ["value", "label", "selection"] as const) {
      const nested = parseJsonObject(rec[key]);
      if (!nested) continue;
      if (modelProb == null) modelProb = sanitizeModel(asNumber(nested.model_prob));
      if (edgePct == null) edgePct = asNumber(nested.edge_pct);
    }
  }

  // Row-level columns are a last-resort fallback (best card edge on the snapshot).
  if (modelProb == null) modelProb = sanitizeModel(rowModel);
  if (edgePct == null) edgePct = rowEdge;

  return { modelProb, edgePct };
}

export function parsePlayerPropValue(
  value: unknown,
  rowModel: number | null = null,
  rowEdge: number | null = null,
): ParsedPlayerPropValue | null {
  const rec = asRecord(value) ?? {};
  const nested = parseJsonObject(rec.value) ?? parseJsonObject(rec.label);
  const source = nested ?? rec;

  const playerIdRaw = Number(source.player_id ?? rec.player_id);
  const playerId = Number.isInteger(playerIdRaw) && playerIdRaw > 0 ? playerIdRaw : null;

  const label = String(source.label ?? rec.label ?? "").trim();
  const rawValue = String(source.value ?? rec.value ?? source.selection ?? rec.selection ?? "").trim();
  const display = stripOutcomeSuffix(label || rawValue);
  if (!display && playerId == null) return null;

  const fromLabel = splitNameLine(stripOutcomeSuffix(label));
  const fromValue = splitNameLine(stripOutcomeSuffix(rawValue));
  const line = fromValue.line ?? fromLabel.line ?? asNumber(source.handicap ?? rec.handicap);
  const playerName = cleanPersonName(
    (fromLabel.line != null ? fromLabel.name : "") ||
      fromValue.name ||
      fromLabel.name ||
      display ||
      (playerId != null ? `Player ${playerId}` : ""),
  );

  if (!playerName) return null;

  const odd = asNumber(source.odd ?? source.price ?? rec.odd ?? rec.price ?? rec.yes);
  const { modelProb, edgePct } = extractModelEdge(value, rowModel, rowEdge);

  return {
    playerId,
    playerName,
    line: line != null && Number.isFinite(line) ? line : null,
    selection: selectionFromLine(line, playerId != null || Boolean(playerName) ? "Anytime" : "Anytime"),
    odd: odd != null && odd > 1 ? odd : null,
    modelProb,
    edgePct,
    rawLabel: display || playerName,
  };
}

export function buildSquadNameIndex(entries: SquadNameEntry[]) {
  const byExact = new Map<string, number[]>();
  const byLast = new Map<string, number[]>();
  const byId = new Map<number, SquadNameEntry>();

  for (const entry of entries) {
    byId.set(entry.playerId, entry);
    const exact = normalizePlayerName(entry.name);
    if (exact) {
      const list = byExact.get(exact) ?? [];
      list.push(entry.playerId);
      byExact.set(exact, list);
    }
    const lastKey = lastNameInitialKey(entry.name);
    if (lastKey) {
      const list = byLast.get(lastKey) ?? [];
      list.push(entry.playerId);
      byLast.set(lastKey, list);
    }
  }

  return { byExact, byLast, byId };
}

export function resolvePlayerId(
  index: ReturnType<typeof buildSquadNameIndex>,
  name: string,
  knownId?: number | null,
): number | null {
  if (knownId != null && Number.isInteger(knownId) && knownId > 0) {
    if (index.byId.has(knownId)) return knownId;
    // Keep book player_id even when not on loaded squad snapshot.
    return knownId;
  }
  const exact = normalizePlayerName(name);
  const exactHits = exact ? unique(index.byExact.get(exact) ?? []) : [];
  if (exactHits.length === 1) return exactHits[0];

  const lastKey = lastNameInitialKey(name);
  const lastHits = lastKey ? unique(index.byLast.get(lastKey) ?? []) : [];
  if (lastHits.length === 1) return lastHits[0];

  return null;
}

function sanitizeModel(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0 || value >= 1) return null;
  return value;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function stripOutcomeSuffix(value: string) {
  return value
    .replace(/\s*\((booked|carded|yes|no)\)\s*$/i, "")
    .replace(/\s*[-–]\s*(yes|no|to be (booked|carded)|booked|carded)\s*$/i, "")
    .trim();
}

function unique(ids: number[]) {
  return [...new Set(ids)];
}
