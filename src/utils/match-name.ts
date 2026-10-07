/** "Arsenal vs Chelsea" → ["Arsenal", "Chelsea"] */
export function splitMatch(match: string): [string, string] {
  const [home = match, away = ""] = match.split(/\s+vs\.?\s+/i);
  return [home.trim(), away.trim()];
}
