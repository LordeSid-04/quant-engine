const API_BASE = "/api/v1";
const DEV_BACKEND_ORIGIN =
  typeof window !== "undefined" && import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
const BACKEND_ORIGIN = String(import.meta.env.VITE_BACKEND_ORIGIN || DEV_BACKEND_ORIGIN || "").replace(/\/$/, "");
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;
const SCENARIO_OPTIONS_CACHE_KEY = "atlas:scenario-options:v1";
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
const BRIEFING_REQUEST_TIMEOUT_MS = 32000;
const THEME_MEMORY_CACHE_PREFIX = "atlas:theme-memory:v1";
const THEME_MEMORY_CACHE_TTL_MS = 90 * 1000;

export function buildBackendUrl(path) {
  return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${path}` : path;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    response = await fetch(buildBackendUrl(path), {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
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
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json();
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
  const payload = await request(`${API_BASE}/world-pulse/live`);
  writeSessionCache(WORLD_PULSE_CACHE_KEY, payload);
  return payload;
}

export async function fetchCountryRelation(fromCountry, toCountry) {
  const query = new URLSearchParams({
    from_country: fromCountry,
    to_country: toCountry,
  });
  return request(`${API_BASE}/world-pulse/relation?${query.toString()}`);
}

export async function fetchScenarioOptions() {
  const payload = await request(`${API_BASE}/scenario/options`);
  writeSessionCache(SCENARIO_OPTIONS_CACHE_KEY, payload);
  return payload;
}

export function getCachedScenarioOptions() {
  return readSessionCache(SCENARIO_OPTIONS_CACHE_KEY, SCENARIO_OPTIONS_CACHE_TTL_MS);
}

export async function fetchCountryDataProof(countryId) {
  const query = new URLSearchParams({ country_id: countryId });
  return request(`${API_BASE}/world-pulse/country-proof?${query.toString()}`);
}

export async function runScenario(payload) {
  return request(`${API_BASE}/scenario/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
  const payload = await request(`${API_BASE}/historical/analogues`);
  writeSessionCache(HISTORICAL_CACHE_KEY, payload);
  return payload;
}

export async function fetchRiskRadar() {
  const payload = await request(`${API_BASE}/risk-radar/live`);
  writeSessionCache(RISK_CACHE_KEY, payload);
  return payload;
}

export async function fetchMarketFeedStatus() {
  return request(`${API_BASE}/market/feed-status`);
}

export async function fetchThemeLive({ windowHours = 72, limit = 8 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    limit: String(limit),
  });
  const payload = await request(`${API_BASE}/themes/live?${query.toString()}`);
  writeSessionCache(THEME_LIVE_CACHE_KEY, payload);
  return payload;
}

export async function fetchThemeTimeline(themeId, { windowHours = 168, maxPoints = 120 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    max_points: String(maxPoints),
  });
  return request(`${API_BASE}/themes/${encodeURIComponent(themeId)}/timeline?${query.toString()}`);
}

export async function fetchThemeSources(themeId, { windowHours = 72, limit = 12 } = {}) {
  const query = new URLSearchParams({
    window_hours: String(windowHours),
    limit: String(limit),
  });
  return request(`${API_BASE}/themes/${encodeURIComponent(themeId)}/sources?${query.toString()}`);
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
  const payload = await request(`${API_BASE}/memory/themes/${encodeURIComponent(themeId)}?${query.toString()}`);
  writeSessionCache(`${THEME_MEMORY_CACHE_PREFIX}:${themeId}`, payload);
  return payload;
}

export function getCachedThemeMemory(themeId) {
  return readSessionCache(`${THEME_MEMORY_CACHE_PREFIX}:${themeId}`, THEME_MEMORY_CACHE_TTL_MS);
}

export async function runNewsNavigator(payload) {
  return request(`${API_BASE}/briefing/news-navigator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 28000,
  });
}
