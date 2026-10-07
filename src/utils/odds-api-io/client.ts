const BASE = "https://api.odds-api.io/v3";

export function oddsApiIoKey() {
  const key = process.env.ODDS_API_IO_KEY;
  if (!key) throw new Error("Missing ODDS_API_IO_KEY");
  return key;
}

export function redactOddsApiIo(text: string) {
  return text.replace(/apiKey=[^&\s"]+/gi, "apiKey=REDACTED");
}

export async function oddsApiIoGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  auth = true,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (auth) url.searchParams.set("apiKey", oddsApiIoKey());
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url);
    const body = await response.text();
    if (response.ok) {
      if (body.trim() === "") return {} as T;
      return JSON.parse(body) as T;
    }
    lastError = redactOddsApiIo(`odds-api.io ${response.status} ${path} ${body.slice(0, 400)}`);
    if (response.status !== 503 && response.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw new Error(lastError);
}

export function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "events", "odds", "bookmakers", "markets"]) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}
