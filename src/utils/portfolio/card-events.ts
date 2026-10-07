/** Card-event helpers for settling player card props from `fixture_events`. */

export type FixtureCardBook = {
  /** Fixture has at least one row in fixture_events (sync landed). */
  synced: boolean;
  playerIds: Set<number>;
  /** Normalized full names that received a yellow/second yellow/red. */
  playerNames: Set<string>;
  /** Last-name tokens for soft match (e.g. "H. Kane" ↔ "Harry Kane"). */
  surnames: Set<string>;
};

const CARD_DETAILS = new Set([
  "yellow card",
  "second yellow card",
  "red card",
]);

export function isCardEvent(type: string | null | undefined, detail: string | null | undefined) {
  const t = String(type ?? "").toLowerCase();
  const d = String(detail ?? "").toLowerCase();
  if (t.includes("card")) return true;
  return CARD_DETAILS.has(d);
}

export function normalizePlayerName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Whether the player was booked.
 * `null` = events not synced yet (keep pending).
 */
export function wasPlayerBooked(
  book: FixtureCardBook | undefined,
  playerId: number | null | undefined,
  playerName: string | null | undefined,
): boolean | null {
  if (!book?.synced) return null;
  if (playerId != null && Number.isFinite(playerId) && playerId > 0 && book.playerIds.has(playerId)) {
    return true;
  }
  const normalized = normalizePlayerName(playerName);
  if (normalized && book.playerNames.has(normalized)) return true;

  const tokens = nameTokens(playerName);
  const surname = tokens[tokens.length - 1] ?? "";
  if (surname.length >= 3 && book.surnames.has(surname)) {
    // Prefer surname+initial when odds use "H. Kane"
    if (tokens.length === 1) return true;
    const initial = tokens[0]?.[0];
    if (!initial) return true;
    for (const full of book.playerNames) {
      if (!full.includes(surname)) continue;
      if (full.startsWith(initial)) return true;
    }
    // Surname-only match when unique among booked players
    let surnameHits = 0;
    for (const name of book.surnames) if (name === surname) surnameHits += 1;
    // surnames is a Set — count from playerNames instead
    let hits = 0;
    for (const full of book.playerNames) {
      if (full.endsWith(surname)) hits += 1;
    }
    if (hits === 1) return true;
  }
  return false;
}

export function emptyCardBook(synced = false): FixtureCardBook {
  return { synced, playerIds: new Set(), playerNames: new Set(), surnames: new Set() };
}

export function ingestCardEventRow(
  book: FixtureCardBook,
  row: {
    player_id?: number | null;
    player_name?: string | null;
    type?: string | null;
    detail?: string | null;
  },
) {
  book.synced = true;
  if (!isCardEvent(row.type, row.detail)) return;
  const playerId = row.player_id == null ? null : Number(row.player_id);
  if (playerId != null && Number.isFinite(playerId) && playerId > 0) {
    book.playerIds.add(playerId);
  }
  const name = normalizePlayerName(row.player_name);
  if (name) book.playerNames.add(name);
  const tokens = nameTokens(row.player_name);
  const surname = tokens[tokens.length - 1];
  if (surname && surname.length >= 3) book.surnames.add(surname);
}
