export type OddsFormat = "decimal" | "fractional" | "american";
export type CurrencyCode = "GBP" | "EUR" | "USD";

export type DisplayPrefs = {
  oddsFormat: OddsFormat;
  currency: CurrencyCode;
  /** IANA zone, or `"browser"` to follow the client clock. */
  timeZone: string;
};

export const DISPLAY_PREFS_STORAGE_KEY = "edgeball.displayPrefs";
export const DISPLAY_TZ_COOKIE = "edgeball_tz";

export const UK_DEFAULTS: DisplayPrefs = {
  oddsFormat: "decimal",
  currency: "GBP",
  timeZone: "Europe/London",
};

export const TIME_ZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Europe/London", label: "UK (London)" },
  { value: "Europe/Dublin", label: "Ireland (Dublin)" },
  { value: "Europe/Paris", label: "Central Europe (Paris)" },
  { value: "Europe/Berlin", label: "Germany (Berlin)" },
  { value: "Europe/Madrid", label: "Spain (Madrid)" },
  { value: "Europe/Rome", label: "Italy (Rome)" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "browser", label: "Browser local" },
];

const ODDS_FORMATS = new Set<OddsFormat>(["decimal", "fractional", "american"]);
const CURRENCIES = new Set<CurrencyCode>(["GBP", "EUR", "USD"]);

export function resolveTimeZone(pref: string, browserZone?: string | null): string {
  if (pref === "browser") {
    return browserZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || UK_DEFAULTS.timeZone;
  }
  return pref.trim() || UK_DEFAULTS.timeZone;
}

export function parseDisplayPrefs(raw: unknown): DisplayPrefs {
  if (!raw || typeof raw !== "object") return { ...UK_DEFAULTS };
  const row = raw as Partial<DisplayPrefs>;
  return {
    oddsFormat: ODDS_FORMATS.has(row.oddsFormat as OddsFormat)
      ? (row.oddsFormat as OddsFormat)
      : UK_DEFAULTS.oddsFormat,
    currency: CURRENCIES.has(row.currency as CurrencyCode)
      ? (row.currency as CurrencyCode)
      : UK_DEFAULTS.currency,
    timeZone: typeof row.timeZone === "string" && row.timeZone.trim()
      ? row.timeZone.trim()
      : UK_DEFAULTS.timeZone,
  };
}

export function readStoredDisplayPrefs(): DisplayPrefs {
  if (typeof window === "undefined") return { ...UK_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY);
    if (!raw) return { ...UK_DEFAULTS };
    return parseDisplayPrefs(JSON.parse(raw) as unknown);
  } catch {
    return { ...UK_DEFAULTS };
  }
}

export function writeStoredDisplayPrefs(prefs: DisplayPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISPLAY_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  const zone = resolveTimeZone(prefs.timeZone);
  document.cookie = `${DISPLAY_TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
}

/** Convert decimal odds (>1) to the selected display format. */
export function formatOdds(
  decimalOdds: number | null | undefined,
  format: OddsFormat = UK_DEFAULTS.oddsFormat,
): string | null {
  if (decimalOdds == null || !Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  if (format === "decimal") return decimalOdds.toFixed(2);
  if (format === "fractional") return decimalToFractional(decimalOdds);
  return decimalToAmerican(decimalOdds);
}

export function formatOddsLabel(
  decimalOdds: number | null | undefined,
  format: OddsFormat = UK_DEFAULTS.oddsFormat,
  prefix = "@",
): string {
  const formatted = formatOdds(decimalOdds, format);
  return formatted ? `${prefix}${formatted}` : "No Book Odds";
}

export function formatMoney(
  amount: number | null | undefined,
  currency: CurrencyCode = UK_DEFAULTS.currency,
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatKickoff(
  utc: string | number | Date | null | undefined,
  timeZone: string = UK_DEFAULTS.timeZone,
): string {
  const date = toUtcDate(utc);
  if (!date) return "";

  const zone = resolveTimeZone(timeZone);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  const today = dayKey(new Date(), zone);
  const kickDay = dayKey(date, zone);
  if (kickDay === today) return `Today, ${time}`;
  if (kickDay === shiftDayKey(today, 1)) return `Tomorrow, ${time}`;

  const monthDay = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
  }).format(date);
  return `${monthDay}, ${time}`;
}

function shiftDayKey(day: string, offsetDays: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + offsetDays)).toISOString().slice(0, 10);
}

function decimalToFractional(decimal: number): string {
  const profit = decimal - 1;
  const { numerator, denominator } = approximateFraction(profit, 100);
  return `${numerator}/${denominator}`;
}

function decimalToAmerican(decimal: number): string {
  if (decimal >= 2) {
    return `+${Math.round((decimal - 1) * 100)}`;
  }
  return `${Math.round(-100 / (decimal - 1))}`;
}

function approximateFraction(value: number, maxDenominator: number) {
  let bestNum = 1;
  let bestDen = 1;
  let bestError = Math.abs(value - 1);
  for (let den = 1; den <= maxDenominator; den += 1) {
    const num = Math.round(value * den);
    if (num < 1) continue;
    const error = Math.abs(value - num / den);
    if (error < bestError - 1e-12 || (Math.abs(error - bestError) < 1e-12 && den < bestDen)) {
      bestNum = num;
      bestDen = den;
      bestError = error;
      if (error < 1e-8) break;
    }
  }
  const factor = gcd(bestNum, bestDen);
  return { numerator: bestNum / factor, denominator: bestDen / factor };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function toUtcDate(utc: string | number | Date | null | undefined) {
  if (utc == null || utc === "") return null;
  if (utc instanceof Date) return Number.isNaN(utc.getTime()) ? null : utc;
  if (typeof utc === "number") {
    const milliseconds = utc < 1_000_000_000_000 ? utc * 1000 : utc;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
