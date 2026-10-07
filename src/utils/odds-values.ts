export type StoredOddsPrice = {
  value: string;
  odd: number;
};

export function expandOddsValues(values: unknown): StoredOddsPrice[] {
  if (!Array.isArray(values)) return [];
  const prices: StoredOddsPrice[] = [];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const record = item as { value?: unknown; odd?: unknown };
    const value = record.value == null ? "" : String(record.value).trim();
    const odd = typeof record.odd === "number" ? record.odd : Number(record.odd);
    if (value === "" || !Number.isFinite(odd)) continue;
    prices.push({ value, odd });
  }
  return prices;
}
