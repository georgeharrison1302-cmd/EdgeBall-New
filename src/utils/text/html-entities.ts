/**
 * Decode HTML entities in person/team names from API payloads / legacy rows.
 * Handles double-encoding: "O&amp;apos;Nien" → "O'Nien".
 */
export function decodeHtmlEntities(value: string): string {
  let text = value;
  for (let i = 0; i < 4; i += 1) {
    const next = text
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => {
        const n = Number(code);
        return Number.isFinite(n) ? String.fromCharCode(n) : _;
      });
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Clean a player/person display name for UI and matching. */
export function cleanPersonName(value: string | null | undefined): string {
  if (value == null) return "";
  return decodeHtmlEntities(String(value)).trim();
}
