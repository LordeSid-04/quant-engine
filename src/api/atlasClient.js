const API_BASE = "/api/v1";
const LOCAL_PREVIEW_PORTS = new Set(["3000", "4173", "4174", "5173"]);
const HEADLINES_CACHE_PREFIX = "atlas:briefing-headlines:v1";
const HEADLINES_CACHE_TTL_MS = 30 * 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

function isPrivateHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

function inferBackendOrigin() {
  if (typeof window === "undefined") return "";
  try {
    const current = new URL(window.location.origin);
    if (current.port === "8000") {
      return current.origin;
    }
    if (isPrivateHost(current.hostname) && LOCAL_PREVIEW_PORTS.has(current.port)) {
      current.port = "8000";
      return current.origin;
    }
  } catch {
    return "";
  }
  return "";
}

const DEV_BACKEND_ORIGIN =
  typeof window !== "undefined" && import.meta.env.DEV ? inferBackendOrigin() || "http://127.0.0.1:8000" : "";
const BACKEND_ORIGIN = String(import.meta.env.VITE_BACKEND_ORIGIN || DEV_BACKEND_ORIGIN || inferBackendOrigin() || "").replace(/\/$/, "");
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DATA_REQUEST_TIMEOUT_MS = 45000;
const HEALTH_REQUEST_TIMEOUT_MS = 10000;
const AUTH_REQUEST_TIMEOUT_MS = 20000;
const AUTH_SESSION_TIMEOUT_MS = 12000;
const REQUEST_RETRY_DELAY_MS = 450;
const SCENARIO_OPTIONS_CACHE_KEY = "atlas:scenario-options:v2";
const SCENARIO_OPTIONS_CACHE_TTL_MS = 30 * 60 * 1000;
const WORLD_PULSE_CACHE_KEY = "atlas:world-pulse-live:v1";
const WORLD_PULSE_CACHE_TTL_MS = 20 * 1000;
const HISTORICAL_CACHE_KEY = "atlas:historical-analogues:v1";
const HISTORICAL_CACHE_TTL_MS = 10 * 60 * 1000;
const RISK_CACHE_KEY = "atlas:risk-radar:v1";
const RISK_CACHE_TTL_MS = 20 * 1000;
const THEME_LIVE_CACHE_KEY = "atlas:themes-live:v1";
const THEME_LIVE_CACHE_TTL_MS = 45 * 1000;
const DAILY_BRIEF_CACHE_KEY = "atlas:briefing-daily:v1";
const DAILY_BRIEF_CACHE_TTL_MS = 30 * 1000;
const DAILY_BRIEF_FEED_STATUS_CACHE_KEY = "atlas:briefing-feed-status:v1";
const DAILY_BRIEF_FEED_STATUS_TTL_MS = 20 * 1000;
const DEVELOPMENT_DETAIL_CACHE_PREFIX = "atlas:briefing-development:v1";
const DEVELOPMENT_DETAIL_CACHE_TTL_MS = 25 * 1000;
const BRIEFING_REQUEST_TIMEOUT_MS = 70000;
const THEME_MEMORY_CACHE_PREFIX = "atlas:theme-memory:v1";
const THEME_MEMORY_CACHE_TTL_MS = 90 * 1000;
const MEMORY_HISTORY_CACHE_KEY = "atlas:memory-history:v1";
const MEMORY_HISTORY_CACHE_TTL_MS = 30 * 1000;
const MEMORY_ENTRY_CACHE_PREFIX = "atlas:memory-entry:v1";
const MEMORY_ENTRY_CACHE_TTL_MS = 60 * 1000;
const AUTH_SESSION_KEY = "atlas:auth-session:v1";

export function buildBackendUrl(path) {
  return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${path}` : path;
}

export function describeApiError(error, fallbackMessage = "Something went wrong.") {
  const rawMessage = String(error?.message || "").trim();
  const normalized = rawMessage.toLowerCase();
  if (!rawMessage) return fallbackMessage;
  if (normalized.includes("timed out")) {
    return "This request is taking longer than expected. Please try again in a moment.";
  }
  if (normalized.includes("cannot reach backend") || normalized.includes("unable to reach")) {
    return "The service is temporarily unavailable. Please try again in a moment.";
  }
  if (normalized.includes("aborted")) {
    return "The request was interrupted before it finished. Please try again.";
  }
  return rawMessage;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildHeadlinesCacheKey({
  horizon = "daily",
  country = "",
  region = "",
  contentTypes = [],
  sourceTypes = [],
  search = "",
  limit = 24,
} = {}) {
  return [
    HEADLINES_CACHE_PREFIX,
    String(horizon || "daily").trim().toLowerCase(),
    String(country || "").trim().toLowerCase(),
    String(region || "").trim().toLowerCase(),
    [...(Array.isArray(contentTypes) ? contentTypes : [])].sort().join(","),
    [...(Array.isArray(sourceTypes) ? sourceTypes : [])].sort().join(","),
    String(search || "").trim().toLowerCase(),
    String(limit || 24),
  ].join("|");
}

export function getStoredAuthSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthSession(session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures.
  }
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function getStoredAccessToken() {
  return String(getStoredAuthSession()?.access_token || "");
}

async function executeRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_REQUEST_TIMEOUT_MS;
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeout);
      throw new Error("Request aborted");
    }
    externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let response;
  try {
    const token = getStoredAccessToken();
    const headers = new Headers(options.headers || {});
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    response = await fetch(buildBackendUrl(path), {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      if (didTimeout) {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw new Error("Request aborted");
    }
    if (import.meta.env.DEV) {
      throw new Error("Cannot reach backend API at http://127.0.0.1:8000. Start backend/run_backend_local.bat.");
    }
    throw new Error("Cannot reach backend API.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const json = await response.json();
      detail = json?.detail || json?.error || "";
    } catch {
      detail = response.statusText;
    }
    const error = new Error(detail || `Request failed (${response.status})`);
    error.statusCode = response.status;
    throw error;
  }
  return response.json();
}

function shouldRetryRequest(error, attempt, retryCount, method) {
  if (attempt >= retryCount) return false;
  if (method !== "GET") return false;
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("timed out")) return true;
  return RETRYABLE_STATUS_CODES.has(Number(error?.statusCode || 0));
}

async function request(path, options = {}) {
  const method = String(options.method || "GET").trim().toUpperCase() || "GET";
  const retryCount =
    Number.isFinite(Number(options.retryCount)) && Number(options.retryCount) >= 0
      ? Number(options.retryCount)
      : method === "GET"
        ? 1
        : 0;
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await executeRequest(path, options);
    } catch (error) {
      lastError = error;
      if (!shouldRetryRequest(error, attempt, retryCount, method)) {
        throw error;
      }
      await delay(REQUEST_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError || new Error("Request failed.");
}

function readSessionCache(key, ttlMs) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.cachedAt) return null;
    if (Date.now() - Number(parsed.cachedAt) > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSessionCache(key, data) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      })
    );
  } catch {
    // Ignore storage write failures.
  }
}

export async function fetchWorldPulse() {
  const payload = await request(`${API_BASE}/world-pulse/live`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(WORLD_PULSE_CACHE_KEY, payload);
  return payload;
}

export async function fetchCountryRelation(fromCountry, toCountry) {
  const query = new URLSearchParams({
    from_country: fromCountry,
    to_country: toCountry,
  });
  return request(`${API_BASE}/world-pulse/relation?${query.toString()}`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
}

export async function fetchScenarioOptions() {
  const payload = await request(`${API_BASE}/scenario/options`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(SCENARIO_OPTIONS_CACHE_KEY, payload);
  return payload;
}

export function getCachedScenarioOptions() {
  return readSessionCache(SCENARIO_OPTIONS_CACHE_KEY, SCENARIO_OPTIONS_CACHE_TTL_MS);
}

export async function fetchCountryDataProof(countryId) {
  const query = new URLSearchParams({ country_id: countryId });
  return request(`${API_BASE}/world-pulse/country-proof?${query.toString()}`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
}

export async function runScenario(payload) {
  return request(`${API_BASE}/scenario/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
}

export async function runScenarioStream(payload, { onLog } = {}) {
  const response = await fetch(buildBackendUrl(`${API_BASE}/scenario/run/stream`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const json = await response.json();
      detail = json?.detail || json?.error || "";
    } catch {
      detail = response.statusText;
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("Streaming body unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event = null;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (event?.type === "log" && event.log && onLog) {
        onLog(event.log);
      } else if (event?.type === "result" && event.result) {
        result = event.result;
      } else if (event?.type === "error") {
        throw new Error(event.error || "Scenario stream failed.");
      }
    }

    if (done) break;
  }

  if (!result) {
    throw new Error("Scenario stream finished without a result.");
  }
  return result;
}

export async function fetchHistoricalAnalogues() {
  const payload = await request(`${API_BASE}/historical/analogues`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(HISTORICAL_CACHE_KEY, payload);
  return payload;
}

export async function fetchRiskRadar() {
  const payload = await request(`${API_BASE}/risk-radar/live`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(RISK_CACHE_KEY, payload);
  return payload;
}

export async function fetchMarketFeedStatus() {
  return request(`${API_BASE}/market/feed-status`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
}

export async function fetchHealthStatus() {
  return request("/health", {
    timeoutMs: HEALTH_REQUEST_TIMEOUT_MS,
    retryCount: 1,
  });
}

export async function fetchThemeLive({ windowHours = 72, limit = 8 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    limit: String(limit),
  });
  const payload = await request(`${API_BASE}/themes/live?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(THEME_LIVE_CACHE_KEY, payload);
  return payload;
}

export async function fetchThemeTimeline(themeId, { windowHours = 168, maxPoints = 120 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    max_points: String(maxPoints),
  });
  return request(`${API_BASE}/themes/${encodeURIComponent(themeId)}/timeline?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
}

export async function fetchThemeSources(themeId, { windowHours = 72, limit = 12 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    limit: String(limit),
  });
  return request(`${API_BASE}/themes/${encodeURIComponent(themeId)}/sources?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
}

export function getCachedWorldPulse() {
  return readSessionCache(WORLD_PULSE_CACHE_KEY, WORLD_PULSE_CACHE_TTL_MS);
}

export function getCachedHistoricalAnalogues() {
  return readSessionCache(HISTORICAL_CACHE_KEY, HISTORICAL_CACHE_TTL_MS);
}

export function getCachedRiskRadar() {
  return readSessionCache(RISK_CACHE_KEY, RISK_CACHE_TTL_MS);
}

export function getCachedThemeLive() {
  return readSessionCache(THEME_LIVE_CACHE_KEY, THEME_LIVE_CACHE_TTL_MS);
}

export async function fetchDailyBriefing({ windowHours = 72, limit = 6 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    limit: String(limit),
  });
  const payload = await request(`${API_BASE}/briefing/daily?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(DAILY_BRIEF_CACHE_KEY, payload);
  return payload;
}

export function getCachedDailyBriefing() {
  return readSessionCache(DAILY_BRIEF_CACHE_KEY, DAILY_BRIEF_CACHE_TTL_MS);
}

export async function fetchBriefingFeedStatus({ windowHours = 72 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
  });
  const payload = await request(`${API_BASE}/briefing/feed-status?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(DAILY_BRIEF_FEED_STATUS_CACHE_KEY, payload);
  return payload;
}

export function getCachedBriefingFeedStatus() {
  return readSessionCache(DAILY_BRIEF_FEED_STATUS_CACHE_KEY, DAILY_BRIEF_FEED_STATUS_TTL_MS);
}

export async function fetchDevelopmentDetail(developmentId) {
  const payload = await request(`${API_BASE}/briefing/developments/${encodeURIComponent(developmentId)}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(`${DEVELOPMENT_DETAIL_CACHE_PREFIX}:${developmentId}`, payload);
  return payload;
}

export function getCachedDevelopmentDetail(developmentId) {
  return readSessionCache(`${DEVELOPMENT_DETAIL_CACHE_PREFIX}:${developmentId}`, DEVELOPMENT_DETAIL_CACHE_TTL_MS);
}

export async function fetchThemeMemory(themeId, { windowHours = 720, limit = 30 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    limit: String(limit),
  });
  const payload = await request(`${API_BASE}/memory/themes/${encodeURIComponent(themeId)}?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(`${THEME_MEMORY_CACHE_PREFIX}:${themeId}`, payload);
  return payload;
}

export function getCachedThemeMemory(themeId) {
  return readSessionCache(`${THEME_MEMORY_CACHE_PREFIX}:${themeId}`, THEME_MEMORY_CACHE_TTL_MS);
}

export async function fetchMemoryHistory({ limit = 80 } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  const payload = await request(`${API_BASE}/memory/history?${query.toString()}`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(MEMORY_HISTORY_CACHE_KEY, payload);
  return payload;
}

export function getCachedMemoryHistory() {
  return readSessionCache(MEMORY_HISTORY_CACHE_KEY, MEMORY_HISTORY_CACHE_TTL_MS);
}

export async function fetchMemoryEntry(entryId) {
  const payload = await request(`${API_BASE}/memory/entries/${encodeURIComponent(entryId)}`, {
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
  writeSessionCache(`${MEMORY_ENTRY_CACHE_PREFIX}:${entryId}`, payload);
  return payload;
}

export async function importMemoryEntry(payload) {
  return request(`${API_BASE}/memory/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: DATA_REQUEST_TIMEOUT_MS,
  });
}

export function getCachedMemoryEntry(entryId) {
  return readSessionCache(`${MEMORY_ENTRY_CACHE_PREFIX}:${entryId}`, MEMORY_ENTRY_CACHE_TTL_MS);
}

export function clearMemoryVaultCache(entryId = "") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(MEMORY_HISTORY_CACHE_KEY);
    if (entryId) {
      window.sessionStorage.removeItem(`${MEMORY_ENTRY_CACHE_PREFIX}:${entryId}`);
    }
  } catch {
    // Ignore storage failures.
  }
}

export async function runNewsNavigator(payload) {
  return request(`${API_BASE}/briefing/news-navigator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 65000,
  });
}

export async function fetchNewsHeadlines({
  horizon = "daily",
  country = "",
  region = "",
  contentTypes = [],
  sourceTypes = [],
  search = "",
  limit = 24,
} = {}, { signal } = {}) {
  const cacheKey = buildHeadlinesCacheKey({
    horizon,
    country,
    region,
    contentTypes,
    sourceTypes,
    search,
    limit,
  });
  const cached = readSessionCache(cacheKey, HEADLINES_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }
  const query = new URLSearchParams({
    horizon: String(horizon || "daily"),
    country: String(country || ""),
    region: String(region || ""),
    content_types: Array.isArray(contentTypes) ? contentTypes.join(",") : "",
    source_types: Array.isArray(sourceTypes) ? sourceTypes.join(",") : "",
    search: String(search || ""),
    limit: String(limit || 24),
  });
  const payload = await request(`${API_BASE}/briefing/news-headlines?${query.toString()}`, {
    timeoutMs: BRIEFING_REQUEST_TIMEOUT_MS,
    signal,
  });
  writeSessionCache(cacheKey, payload);
  return payload;
}

export async function loginWithPassword(payload) {
  return request(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function signupWithPassword(payload) {
  return request(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function fetchAuthMe() {
  return request(`${API_BASE}/auth/me`, {
    timeoutMs: AUTH_SESSION_TIMEOUT_MS,
    retryCount: 1,
  });
}

export async function bootstrapTestAccount() {
  return request(`${API_BASE}/auth/bootstrap-test-user`, {
    method: "POST",
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function fetchTestingAccount() {
  return request(`${API_BASE}/auth/testing-account`, {
    timeoutMs: AUTH_SESSION_TIMEOUT_MS,
    retryCount: 1,
  });
}
