import "server-only";
import { createIngestClient } from "@/utils/supabase/admin";
import { getActiveSeasonYear, seasonStartingYear } from "./season";

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

/** Hard cap. 7/s is 420/minute, under the Ultra 450/minute firewall limit. */
const REQUESTS_PER_SECOND = 7;
const SECOND_MS = 1_000;
const MINUTE_WINDOW_MS = 60_000;
const MINUTE_REMAINING_FLOOR = 5;
/** Stop before the daily quota is emptied. */
export const API_FOOTBALL_DAILY_RESERVE = 2_000;
const RETRY_BASE_MS = 2_000;
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 60_000;
/** 499 and 500 are retried once. This wait is short, and it is not immediate. */
const TRANSIENT_RETRY_MS = 1_500;
/** Documented page sizes. Callers must follow `paging.total`, not these counts. */
const PAGE_SIZES = {
  "/players": 20,
  "/odds": 10,
} as const;

type Query = Record<string, string | number | boolean | null | undefined>;

export class CoverageNotSupported extends Error {
  readonly success = false as const;
  readonly reason = "Coverage not supported" as const;

  constructor() {
    super("Coverage not supported");
  }
}

export function isCoverageNotSupported(
  value: unknown,
): value is { success: false; reason: "Coverage not supported" } {
  if (value instanceof CoverageNotSupported) return true;
  if (!value || typeof value !== "object") return false;
  const record = value as { success?: unknown; reason?: unknown };
  return record.success === false && record.reason === "Coverage not supported";
}

export type ApiFootballPaging = {
  current: number;
  total: number;
};

export type ApiFootballEnvelope<T> = {
  get: string;
  parameters: Record<string, string> | unknown[];
  errors: string[] | Record<string, string>;
  results: number;
  paging: ApiFootballPaging;
  response: T;
};

export type ApiFootballPagedEnvelope<T> = ApiFootballEnvelope<T[]> & {
  pagesFetched: number[];
  pageSizes: number[];
};

export type ApiFootballRateLimit = {
  /** `x-ratelimit-requests-remaining`: requests left today. */
  dailyRemaining: number | null;
  /** `X-Ratelimit-Remaining`: requests left in the current minute. */
  minuteRemaining: number | null;
  updatedAt: number | null;
};

export class ApiFootballError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

export class ApiFootballQuotaError extends ApiFootballError {
  constructor(readonly dailyRemaining: number) {
    super(
      `API-Football daily request reserve reached (${dailyRemaining} remaining)`,
      429,
    );
    this.name = "ApiFootballQuotaError";
  }
}

class MinuteWindowError extends Error {
  constructor(readonly retryAfterMs: number | null) {
    super("API-Football per-minute limit reached");
    this.name = "MinuteWindowError";
  }
}

class TransientServerError extends Error {
  constructor(
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(`API-Football request failed with status ${status}`);
    this.name = "TransientServerError";
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function headerNumber(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function errorText(body: ApiFootballEnvelope<unknown> | null) {
  if (!body || body.errors == null) return "";
  const errors = body.errors;
  if (Array.isArray(errors)) return errors.map(String).join("; ");
  if (typeof errors === "object") {
    return Object.entries(errors)
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ");
  }
  return "";
}

function logDevelopmentError(status: number, body: ApiFootballEnvelope<unknown> | null) {
  if (process.env.NODE_ENV === "production") return;
  const detail = errorText(body);
  console.error(
    detail
      ? `API-Football error ${status}: ${detail}`
      : `API-Football error ${status}: ${JSON.stringify(body?.errors ?? null)}`,
  );
}

function isDailyLimit(body: ApiFootballEnvelope<unknown> | null) {
  return /limit for the day|daily request|reached the request limit/i.test(errorText(body));
}

function isMinuteLimit(status: number, body: ApiFootballEnvelope<unknown> | null) {
  if (status === 429) return true;
  if (!body || Array.isArray(body.errors) || !body.errors) return false;
  return "rateLimit" in body.errors;
}

function hasApiFootballErrors(errors: ApiFootballEnvelope<unknown>["errors"] | undefined) {
  if (errors == null) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  return Object.keys(errors).length > 0;
}

function apiErrorMessage(status: number, body: ApiFootballEnvelope<unknown>) {
  const detail = errorText(body);
  return detail
    ? `API-Football error: ${detail}`
    : `API-Football request failed with status ${status}`;
}

function pageCount(paging: ApiFootballPaging | undefined) {
  const total = paging?.total;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 1) return 1;
  return total;
}

function pageItems<T>(response: T[] | T) {
  return Array.isArray(response) ? [...response] : [];
}

function normalizedPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function assertNotBettingOddsPath(path: string) {
  const key = normalizedPath(path);
  if (key === "/odds" || key === "/odds/live") {
    throw new Error(
      "Betting odds must come from Odds-API.io via prematch_odds / live_odds. API-Football /odds and /odds/live are disabled.",
    );
  }
}

/**
 * Single API-Football client. Share {@link apiFootballClient} so every caller
 * counts toward the same 7 requests/second window.
 */
export class ApiFootballClient {
  private rateLimit: ApiFootballRateLimit = {
    dailyRemaining: null,
    minuteRemaining: null,
    updatedAt: null,
  };
  private recentStarts: number[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private warnedMissingHeaders = false;
  private warnedLogFailure = false;
  private seasonYears = new Map<number, number | null>();

  constructor(private readonly apiKey?: string) {}

  getRateLimit(): ApiFootballRateLimit {
    return { ...this.rateLimit };
  }

  async get<T>(path: string, params?: Query): Promise<ApiFootballEnvelope<T>> {
    assertNotBettingOddsPath(path);
    const next = await this.withActiveSeason(path, params);
    if (await this.coverageBlocks(path, next)) throw new CoverageNotSupported();
    return this.enqueue(() => this.getWithBackoff(path, next));
  }

  async getAllPages<T>(path: string, params?: Query): Promise<ApiFootballPagedEnvelope<T>> {
    const first = await this.get<T[]>(path, { ...params, page: 1 });
    const items = pageItems(first.response);
    const empty = first.results === 0 || items.length === 0;
    const total = empty ? 0 : pageCount(first.paging);
    const pagesFetched = [1];
    const pageSizes = [items.length];

    if (!empty) {
      for (let page = 2; page <= total; page += 1) {
        pagesFetched.push(page);
        const next = await this.get<T[]>(path, { ...params, page });
        const nextItems = pageItems(next.response);
        pageSizes.push(nextItems.length);
        items.push(...nextItems);
      }
    }

    return {
      ...first,
      results: items.length,
      paging: { current: pagesFetched[pagesFetched.length - 1] ?? 1, total },
      response: items,
      pagesFetched,
      pageSizes,
    };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async getWithBackoff<T>(path: string, params?: Query): Promise<ApiFootballEnvelope<T>> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await this.fetchAllowingTransientRetry<T>(path, params);
      } catch (cause) {
        if (!(cause instanceof MinuteWindowError) || attempt === MAX_RETRIES) {
          if (cause instanceof MinuteWindowError) {
            throw new ApiFootballError("API-Football per-minute limit reached", 429);
          }
          throw cause;
        }
        const delay = Math.max(this.backoffMs(attempt), cause.retryAfterMs ?? 0);
        await sleep(delay);
        this.rateLimit = { ...this.rateLimit, minuteRemaining: null };
      }
    }

    throw new ApiFootballError("API-Football per-minute limit reached", 429);
  }

  /** 499 and 500 are retried once. A second failure is returned to the caller. */
  private async fetchAllowingTransientRetry<T>(
    path: string,
    params?: Query,
  ): Promise<ApiFootballEnvelope<T>> {
    try {
      return await this.fetchOnce<T>(path, params);
    } catch (cause) {
      if (!(cause instanceof TransientServerError)) throw cause;
      await sleep(TRANSIENT_RETRY_MS);
      try {
        return await this.fetchOnce<T>(path, params);
      } catch (retryCause) {
        if (retryCause instanceof TransientServerError) {
          const body = retryCause.body as ApiFootballEnvelope<unknown> | undefined;
          throw new ApiFootballError(
            body ? apiErrorMessage(retryCause.status, body) : retryCause.message,
            retryCause.status,
            retryCause.body,
          );
        }
        throw retryCause;
      }
    }
  }

  private backoffMs(attempt: number) {
    const exponential = RETRY_BASE_MS * 2 ** attempt;
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(exponential + jitter, MAX_BACKOFF_MS);
  }

  private async fetchOnce<T>(path: string, params?: Query): Promise<ApiFootballEnvelope<T>> {
    if (
      this.rateLimit.dailyRemaining != null &&
      this.rateLimit.dailyRemaining < API_FOOTBALL_DAILY_RESERVE
    ) {
      throw new ApiFootballQuotaError(this.rateLimit.dailyRemaining);
    }

    await this.waitForMinuteBudget();
    await this.acquireSlot();

    const response = await fetch(this.buildUrl(path, params), {
      method: "GET",
      headers: {
        "x-apisports-key": this.getApiKey(),
      },
      cache: "no-store",
    });

    this.rememberHeaders(response.headers);
    await this.recordQuota(path, response.status);

    const body = (await response.json().catch(() => null)) as ApiFootballEnvelope<T> | null;

    if (!body) {
      logDevelopmentError(response.status, null);
      throw new ApiFootballError("API-Football returned an empty response", response.status);
    }

    if (isDailyLimit(body)) {
      logDevelopmentError(response.status, body);
      throw new ApiFootballError(`API-Football error: ${errorText(body)}`, response.status, body);
    }

    if (isMinuteLimit(response.status, body)) {
      logDevelopmentError(response.status, body);
      const retryAfter = headerNumber(response.headers, "retry-after");
      throw new MinuteWindowError(retryAfter == null ? null : retryAfter * SECOND_MS);
    }

    if (response.status === 499 || response.status === 500) {
      logDevelopmentError(response.status, body);
      throw new TransientServerError(response.status, body);
    }

    if (!response.ok) {
      logDevelopmentError(response.status, body);
      throw new ApiFootballError(apiErrorMessage(response.status, body), response.status, body);
    }

    if (hasApiFootballErrors(body.errors)) {
      logDevelopmentError(response.status, body);
      throw new ApiFootballError(apiErrorMessage(response.status, body), response.status, body);
    }

    this.notePartialPage(path, params, body);
    return body;
  }

  /** A 200 with `results: 0` is valid. Warn only when further pages were left behind. */
  private notePartialPage<T>(path: string, params: Query | undefined, body: ApiFootballEnvelope<T>) {
    if (process.env.NODE_ENV === "production") return;
    const total = pageCount(body.paging);
    if (total <= 1 || params?.page != null) return;
    const pageSize = PAGE_SIZES[normalizedPath(path) as keyof typeof PAGE_SIZES];
    const sizeNote = pageSize ? ` (${pageSize} per page)` : "";
    console.warn(
      `API-Football ${normalizedPath(path)} has ${total} pages${sizeNote}. This call returned page ${body.paging?.current ?? 1} only.`,
    );
  }

  /** At most {@link REQUESTS_PER_SECOND} request starts in any rolling second. */
  private async acquireSlot() {
    for (;;) {
      const now = Date.now();
      while (this.recentStarts.length > 0 && now - this.recentStarts[0] >= SECOND_MS) {
        this.recentStarts.shift();
      }
      if (this.recentStarts.length < REQUESTS_PER_SECOND) {
        this.recentStarts.push(now);
        return;
      }
      const oldest = this.recentStarts[0] ?? now;
      await sleep(SECOND_MS - (now - oldest) + 5);
    }
  }

  private async waitForMinuteBudget() {
    const seenAt = this.rateLimit.updatedAt;
    if (seenAt == null) return;
    if (
      this.rateLimit.minuteRemaining == null ||
      this.rateLimit.minuteRemaining > MINUTE_REMAINING_FLOOR
    ) {
      return;
    }
    const wait = MINUTE_WINDOW_MS - (Date.now() - seenAt);
    if (wait > 0) await sleep(wait);
  }

  private rememberHeaders(headers: Headers) {
    const dailyRemaining = headerNumber(headers, "x-ratelimit-requests-remaining");
    const minuteRemaining = headerNumber(headers, "x-ratelimit-remaining");

    if (dailyRemaining == null && minuteRemaining == null && !this.warnedMissingHeaders) {
      this.warnedMissingHeaders = true;
      console.warn("API-Football response did not include rate-limit headers");
    }

    this.rateLimit = {
      dailyRemaining: dailyRemaining ?? this.rateLimit.dailyRemaining,
      minuteRemaining: minuteRemaining ?? this.rateLimit.minuteRemaining,
      updatedAt: Date.now(),
    };
  }

  private async recordQuota(path: string, status: number) {
    try {
      const supabase = createIngestClient();
      const { error } = await supabase.from("api_quota_log").insert({
        requests_remaining: this.rateLimit.dailyRemaining,
        minute_remaining: this.rateLimit.minuteRemaining,
        path: path.startsWith("/") ? path : `/${path}`,
        status,
      });
      if (error) this.warnLogFailure(error.message);
    } catch (cause) {
      this.warnLogFailure(cause instanceof Error ? cause.message : String(cause));
    }
  }

  private warnLogFailure(message: string) {
    if (this.warnedLogFailure) return;
    this.warnedLogFailure = true;
    console.warn(`API-Football quota log failed: ${message}`);
  }

  private getApiKey() {
    const apiKey = this.apiKey ?? process.env.API_FOOTBALL_KEY;
    if (!apiKey) throw new ApiFootballError("Missing API_FOOTBALL_KEY", 500);
    return apiKey;
  }

  private buildUrl(path: string, params?: Query) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${API_FOOTBALL_BASE_URL}${normalizedPath}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (key === "timezone") continue;
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async withActiveSeason(path: string, params?: Query) {
    if (!params || !SEASON_ENDPOINTS.has(normalizedPath(path))) return params;
    const explicit = seasonStartingYear(params.season);
    if (explicit != null) return { ...params, season: explicit };
    const leagueId = positiveInteger(params.league);
    if (leagueId == null) {
      if (params.season == null || params.season === "") return params;
      const { season: _season, ...rest } = params;
      return rest;
    }
    const year = await this.activeSeasonYear(leagueId);
    if (year == null) {
      if (params.season == null || params.season === "") return params;
      const { season: _season, ...rest } = params;
      return rest;
    }
    return { ...params, season: year };
  }

  private async activeSeasonYear(leagueId: number) {
    if (this.seasonYears.has(leagueId)) return this.seasonYears.get(leagueId) ?? null;
    const year = await getActiveSeasonYear(leagueId);
    this.seasonYears.set(leagueId, year);
    return year;
  }

  private async coverageBlocks(path: string, params?: Query) {
    const kind = coverageKind(normalizedPath(path));
    if (!kind) return false;
    const leagueId = await leagueIdForCoverage(params);
    if (leagueId == null) return false;
    const coverage = await leagueCoverage(leagueId);
    return coverageFlag(coverage, kind) === false;
  }
}

const SEASON_ENDPOINTS = new Set([
  "/leagues",
  "/teams",
  "/teams/statistics",
  "/standings",
  "/fixtures",
  "/fixtures/rounds",
  "/fixtures/headtohead",
  "/injuries",
  "/players",
  "/players/topscorers",
  "/players/topassists",
  "/players/topyellowcards",
  "/players/topredcards",
  "/odds",
]);

function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function coverageKind(path: string) {
  if (path === "/odds") return "odds" as const;
  if (path === "/fixtures/statistics") return "statistics_fixtures" as const;
  if (path === "/predictions") return "predictions" as const;
  return null;
}

async function leagueIdForCoverage(params?: Query) {
  if (typeof params?.league === "number" && Number.isInteger(params.league)) return params.league;
  if (typeof params?.fixture !== "number" || !Number.isInteger(params.fixture)) return null;
  const supabase = createIngestClient();
  const { data, error } = await supabase.from("fixtures").select("league_id").eq("id", params.fixture).maybeSingle();
  if (error) throw error;
  return data?.league_id == null ? null : Number(data.league_id);
}

async function leagueCoverage(leagueId: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase.from("leagues").select("coverage").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  return data?.coverage ?? null;
}

function coverageFlag(coverage: unknown, kind: "odds" | "statistics_fixtures" | "predictions") {
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) return null;
  const record = coverage as Record<string, unknown>;
  if (kind === "statistics_fixtures") {
    const fixtures = record.fixtures;
    if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) return null;
    const value = (fixtures as Record<string, unknown>).statistics_fixtures;
    return typeof value === "boolean" ? value : null;
  }
  const value = record[kind];
  return typeof value === "boolean" ? value : null;
}

export const apiFootballClient = new ApiFootballClient();

export function getApiFootballRateLimit() {
  return apiFootballClient.getRateLimit();
}

export function apiFootballGet<T>(path: string, params?: Query) {
  return apiFootballClient.get<T>(path, params);
}

export function apiFootballGetAllPages<T>(path: string, params?: Query) {
  return apiFootballClient.getAllPages<T>(path, params);
}

export function isEmptyApiResponse<T>(envelope: {
  results: number;
  response: T[] | null | undefined;
}) {
  return envelope.results === 0 || !envelope.response || envelope.response.length === 0;
}
