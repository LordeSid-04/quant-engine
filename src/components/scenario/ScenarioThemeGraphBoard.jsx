import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  BookOpenText,
  ExternalLink,
  Flame,
  Globe2,
  Link2,
  Network,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  fetchThemeLive,
  fetchThemeMemory,
  fetchThemeSources,
  fetchThemeTimeline,
  getCachedThemeLive,
  getCachedThemeMemory,
} from "@/api/atlasClient";
import { SurfaceCard } from "@/components/premium/SurfaceCard";

const TIMELINE_PRESETS = [
  { label: "7D", hours: 168 },
  { label: "14D", hours: 336 },
  { label: "30D", hours: 720 },
];

const STATE_COLORS = {
  hot: "#fb7185",
  warming: "#f59e0b",
  cooling: "#38bdf8",
  cold: "#818cf8",
  neutral: "#d4d4d8",
};

const SEVERITY_COLORS = {
  critical: "#fb7185",
  high: "#f97316",
  medium: "#facc15",
  low: "#60a5fa",
};

function toStateColor(state) {
  return STATE_COLORS[String(state || "neutral").toLowerCase()] || STATE_COLORS.neutral;
}

function toSeverityColor(severity) {
  return SEVERITY_COLORS[String(severity || "low").toLowerCase()] || SEVERITY_COLORS.low;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return normalizeToken(value).replace(/\s+/g, "-") || "unknown";
}

function formatTimeLabel(value, mode = "short") {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  if (mode === "date") {
    return date.toLocaleDateString([], { month: "short", day: "2-digit" });
  }
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function classifyAssetClass(asset) {
  const text = normalizeToken(asset);
  if (/(treasury|bond|yield|rate|duration|curve|swap)/.test(text)) return "Rates";
  if (/(oil|gas|energy|commodity|copper|metal)/.test(text)) return "Commodities";
  if (/(fx|usd|dollar|yen|euro|currency|forex)/.test(text)) return "FX";
  if (/(credit|spread|high yield|loan|corp)/.test(text)) return "Credit";
  if (/(equity|stock|index|s p|nasdaq|earnings)/.test(text)) return "Equities";
  if (/(vol|vix|gamma|option)/.test(text)) return "Volatility";
  return "Cross-Asset";
}

function summarizeTrend(points) {
  if (!Array.isArray(points) || points.length < 2) return { direction: "flat", delta: 0 };
  const first = Number(points[0].temperature || 0);
  const latest = Number(points[points.length - 1].temperature || 0);
  const delta = latest - first;
  if (delta > 3) return { direction: "up", delta };
  if (delta < -3) return { direction: "down", delta };
  return { direction: "flat", delta };
}

function buildTimelineRows(points = []) {
  if (!Array.isArray(points)) return [];
  return points.map((point, index) => {
    const previous = points[index - 1];
    const state = String(point.state || "neutral").toLowerCase();
    const transition = Boolean(previous && String(previous.state || "").toLowerCase() !== state);
    return {
      as_of: point.as_of,
      timeLabel: formatTimeLabel(point.as_of, "date"),
      timestamp: Date.parse(point.as_of || "") || 0,
      temperature: Number(point.temperature || 0),
      mention_count: Number(point.mention_count || 0),
      momentum: Number(point.momentum || 0),
      state,
      transition,
      stateColor: toStateColor(state),
    };
  });
}

function buildTransitionFeed(rows = []) {
  if (!rows.length) return [];
  const transitions = [];
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const previous = rows[index - 1];
    if (current.state !== previous.state) {
      transitions.push({
        as_of: current.as_of,
        from: previous.state,
        to: current.state,
        temperature: current.temperature,
      });
    }
  }
  return transitions.slice(-6).reverse();
}

function buildHeatUniverseRows(themes = []) {
  return (themes || []).map((theme) => {
    const mentions = Number(theme.mention_count || 0);
    return {
      theme_id: theme.theme_id,
      label: theme.label,
      state: String(theme.state || "neutral").toLowerCase(),
      temperature: Number(theme.temperature || 0),
      market_reaction_score: Number(theme.market_reaction_score || 0),
      mention_count: mentions,
      momentum: Number(theme.momentum || 0),
      spread: Number(theme.cross_region_spread || 0),
      bubble: clamp(Math.sqrt(Math.max(mentions, 1)) * 7.5, 18, 68),
    };
  });
}

function buildRegionAssetBridge(articles = [], selectedTheme) {
  const pairMap = new Map();

  (articles || []).forEach((article) => {
    const regions = Array.from(new Set((article.region_tags || []).map((tag) => String(tag || "").trim()).filter(Boolean)));
    const assets = Array.from(new Set((article.asset_tags || []).map((tag) => String(tag || "").trim()).filter(Boolean)));
    if (!regions.length || !assets.length) return;
    const score = clamp(Number(article.relevance_score || 0.35), 0.1, 1.0);
    regions.slice(0, 3).forEach((region) => {
      assets.slice(0, 3).forEach((asset) => {
        const key = `${region}|||${asset}`;
        const existing = pairMap.get(key) || { region, asset, value: 0, articles: 0 };
        existing.value += score;
        existing.articles += 1;
        pairMap.set(key, existing);
      });
    });
  });

  let pairRows = Array.from(pairMap.values())
    .sort((left, right) => right.value - left.value)
    .slice(0, 16);

  let observed = true;
  if (!pairRows.length && selectedTheme) {
    observed = false;
    const regions = (selectedTheme.top_regions || []).slice(0, 4);
    const assets = (selectedTheme.top_assets || []).slice(0, 4);
    pairRows = [];
    regions.forEach((region, regionIndex) => {
      assets.forEach((asset, assetIndex) => {
        pairRows.push({
          region,
          asset,
          value: Number((1.2 - regionIndex * 0.18 - assetIndex * 0.14).toFixed(3)),
          articles: 0,
        });
      });
    });
    pairRows = pairRows.filter((row) => row.value > 0.15).slice(0, 12);
  }

  const regionOrder = Array.from(new Set(pairRows.map((row) => row.region)));
  const assetOrder = Array.from(new Set(pairRows.map((row) => row.asset)));
  const nodes = [
    ...regionOrder.map((name) => ({ name, side: "region" })),
    ...assetOrder.map((name) => ({ name, side: "asset" })),
  ];

  const indexByNode = new Map(nodes.map((node, index) => [node.name, index]));
  const links = pairRows.map((row) => ({
    source: indexByNode.get(row.region),
    target: indexByNode.get(row.asset),
    value: Number(row.value.toFixed(3)),
    article_count: row.articles,
    region: row.region,
    asset: row.asset,
  }));

  return {
    nodes,
    links,
    observed,
  };
}
function buildMemoryRows(memory) {
  const history = Array.isArray(memory?.discussion_history) ? memory.discussion_history.slice() : [];
  history.sort((left, right) => {
    const lt = Date.parse(left.as_of || "") || 0;
    const rt = Date.parse(right.as_of || "") || 0;
    return lt - rt;
  });

  return history.map((item, index) => ({
    id: `${item.as_of || "snapshot"}-${index}`,
    as_of: item.as_of,
    timeLabel: formatTimeLabel(item.as_of, "date"),
    importance: Number(item.importance || 0),
    outlook_state: String(item.outlook_state || "neutral").toLowerCase(),
    title: item.title || "Theme Snapshot",
    state: item.state || "neutral",
    summary: item.summary || "",
    primary_action: item.primary_action || "",
  }));
}

function buildSourceFilters(articles = []) {
  const regionSet = new Set();
  const assetSet = new Set();
  articles.forEach((article) => {
    (article.region_tags || []).forEach((tag) => {
      if (tag) regionSet.add(tag);
    });
    (article.asset_tags || []).forEach((tag) => {
      if (tag) assetSet.add(tag);
    });
  });
  return {
    regions: Array.from(regionSet).sort((left, right) => left.localeCompare(right)),
    assets: Array.from(assetSet).sort((left, right) => left.localeCompare(right)),
  };
}

function computeThemeAssetWeights(articles = []) {
  const weights = new Map();
  articles.forEach((article) => {
    const relevance = clamp(Number(article.relevance_score || 0.25), 0.1, 1.0);
    (article.asset_tags || []).forEach((asset) => {
      const key = normalizeToken(asset);
      if (!key) return;
      const existing = Number(weights.get(key) || 0);
      weights.set(key, existing + relevance);
    });
  });
  return weights;
}

function computeRiskRows({ selectedTheme, sources, scenarioResult }) {
  const topThemeAssets = (selectedTheme?.top_assets || []).map((asset) => normalizeToken(asset)).filter(Boolean);
  const sourceWeights = computeThemeAssetWeights(sources);

  const impacts = Array.isArray(scenarioResult?.impacts) ? scenarioResult.impacts : [];
  if (impacts.length) {
    return impacts
      .slice(0, 16)
      .map((impact) => {
        const asset = String(impact.asset || "Asset");
        const normalized = normalizeToken(asset);
        const inTheme = topThemeAssets.some((needle) => needle && normalized.includes(needle));
        const sourceWeight = Array.from(sourceWeights.entries()).reduce((maxWeight, [tag, weight]) => {
          if (normalized.includes(tag)) return Math.max(maxWeight, Number(weight || 0));
          return maxWeight;
        }, 0);
        const relevance = clamp((inTheme ? 0.65 : 0.25) + Math.min(sourceWeight / 3.5, 0.45), 0.15, 1.0);
        const weightedImpact = Number((Number(impact.impact || 0) * (0.6 + relevance * 0.4)).toFixed(2));
        return {
          asset,
          assetClass: classifyAssetClass(asset),
          impact: Number(impact.impact || 0),
          weightedImpact,
          unit: impact.unit || "bp",
          severity: String(impact.severity || "low").toLowerCase(),
          relevance: Number(relevance.toFixed(2)),
        };
      })
      .sort((left, right) => Math.abs(right.weightedImpact) - Math.abs(left.weightedImpact))
      .slice(0, 10);
  }

  if (!selectedTheme || !topThemeAssets.length) return [];

  const direction = Number(selectedTheme.momentum || 0) >= 0 ? 1 : -1;
  const baselineScale = (Number(selectedTheme.market_reaction_score || 0) / 100) * clamp(Math.abs(Number(selectedTheme.momentum || 0)) + 0.35, 0.35, 1.45);

  return topThemeAssets.slice(0, 8).map((assetToken, index) => {
    const rawWeight = Number(sourceWeights.get(assetToken) || Math.max(0.2, 1 - index * 0.12));
    const score = Number((direction * baselineScale * rawWeight * 5.4).toFixed(2));
    return {
      asset: assetToken.replace(/\b\w/g, (letter) => letter.toUpperCase()),
      assetClass: classifyAssetClass(assetToken),
      impact: score,
      weightedImpact: score,
      unit: "%",
      severity: Math.abs(score) >= 6 ? "high" : Math.abs(score) >= 3 ? "medium" : "low",
      relevance: Number(clamp(rawWeight / 2.2, 0.2, 0.9).toFixed(2)),
    };
  });
}

function deriveCausalReadout(result, selectedTheme) {
  if (!result?.config) return "Run a scenario to generate a deterministic risk readout for the selected macro theme.";
  const top = Array.isArray(result.impacts) ? result.impacts[0] : null;
  if (!top) return "Scenario completed, but no impact vectors were emitted.";
  const directionWord = Number(top.impact || 0) >= 0 ? "up" : "down";
  const movement = `${Math.abs(Number(top.impact || 0)).toFixed(top.unit === "bp" ? 1 : 2)}${top.unit === "bp" ? "bp" : "%"}`;
  const themeLabel = selectedTheme?.label || "selected theme";
  return `${result.config.event} in ${result.config.region} → ${top.asset} ${directionWord} ${movement} → ${themeLabel} risk regime re-prices across ${classifyAssetClass(top.asset)} channels.`;
}

export default function ScenarioThemeGraphBoard({ scenarioResult, isScenarioRunning = false }) {
  const cachedThemeLive = getCachedThemeLive();
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [timelineWindow, setTimelineWindow] = useState(TIMELINE_PRESETS[0].hours);
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");

  const {
    data: liveData,
    isLoading: isLoadingLive,
    isError: isLiveError,
    error: liveError,
  } = useQuery({
    queryKey: ["scenario-theme-live", 72, 14],
    queryFn: () => fetchThemeLive({ windowHours: 72, limit: 14 }),
    initialData: cachedThemeLive || undefined,
    staleTime: 25 * 1000,
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });

  const themes = liveData?.themes || [];

  useEffect(() => {
    if (!themes.length) {
      setSelectedThemeId("");
      return;
    }
    if (selectedThemeId && themes.some((theme) => theme.theme_id === selectedThemeId)) return;

    const hottest = [...themes].sort((left, right) => {
      const leftScore = Number(left.temperature || 0) + Number(left.market_reaction_score || 0) * 0.45 + Number(left.momentum || 0) * 10;
      const rightScore = Number(right.temperature || 0) + Number(right.market_reaction_score || 0) * 0.45 + Number(right.momentum || 0) * 10;
      return rightScore - leftScore;
    })[0];
    if (hottest?.theme_id) {
      setSelectedThemeId(hottest.theme_id);
    }
  }, [selectedThemeId, themes]);

  const selectedTheme = useMemo(() => {
    if (!themes.length) return null;
    return themes.find((theme) => theme.theme_id === selectedThemeId) || themes[0] || null;
  }, [selectedThemeId, themes]);

  const {
    data: timelineData,
    isLoading: isLoadingTimeline,
    isError: isTimelineError,
    error: timelineError,
  } = useQuery({
    queryKey: ["scenario-theme-timeline", selectedTheme?.theme_id || "", timelineWindow],
    queryFn: () => fetchThemeTimeline(selectedTheme.theme_id, { windowHours: timelineWindow, maxPoints: 180 }),
    enabled: Boolean(selectedTheme?.theme_id),
    staleTime: 25 * 1000,
    refetchInterval: 35000,
    refetchOnWindowFocus: false,
  });

  const {
    data: sourceData,
    isLoading: isLoadingSources,
    isError: isSourcesError,
    error: sourcesError,
  } = useQuery({
    queryKey: ["scenario-theme-sources", selectedTheme?.theme_id || "", timelineWindow],
    queryFn: () => fetchThemeSources(selectedTheme.theme_id, { windowHours: Math.max(72, timelineWindow), limit: 36 }),
    enabled: Boolean(selectedTheme?.theme_id),
    staleTime: 25 * 1000,
    refetchInterval: 35000,
    refetchOnWindowFocus: false,
  });

  const cachedThemeMemory = getCachedThemeMemory(selectedTheme?.theme_id || "");
  const {
    data: memoryData,
    isLoading: isLoadingMemory,
    isError: isMemoryError,
    error: memoryError,
  } = useQuery({
    queryKey: ["scenario-theme-memory", selectedTheme?.theme_id || ""],
    queryFn: () => fetchThemeMemory(selectedTheme.theme_id, { windowHours: 720, limit: 36 }),
    enabled: Boolean(selectedTheme?.theme_id),
    initialData: cachedThemeMemory || undefined,
    staleTime: 50 * 1000,
    refetchInterval: 90000,
    refetchOnWindowFocus: false,
  });

  const timelineRows = useMemo(() => buildTimelineRows(timelineData?.points || []), [timelineData?.points]);
  const transitionFeed = useMemo(() => buildTransitionFeed(timelineRows), [timelineRows]);
  const trend = useMemo(() => summarizeTrend(timelineRows), [timelineRows]);

  const heatUniverseRows = useMemo(() => buildHeatUniverseRows(themes), [themes]);

  const bridgeData = useMemo(
    () => buildRegionAssetBridge(sourceData?.articles || [], selectedTheme),
    [selectedTheme, sourceData?.articles],
  );

  const memoryRows = useMemo(() => buildMemoryRows(memoryData), [memoryData]);

  const filterOptions = useMemo(() => buildSourceFilters(sourceData?.articles || []), [sourceData?.articles]);

  const filteredSources = useMemo(() => {
    const query = normalizeToken(searchQuery);
    return (sourceData?.articles || [])
      .filter((article) => {
        const regionMatch = !regionFilter || (article.region_tags || []).includes(regionFilter);
        const assetMatch = !assetFilter || (article.asset_tags || []).includes(assetFilter);
        if (!regionMatch || !assetMatch) return false;
        if (!query) return true;

        const haystack = normalizeToken(
          [
            article.title,
            article.source,
            article.excerpt,
            ...(article.region_tags || []),
            ...(article.asset_tags || []),
            ...(article.matched_keywords || []),
          ].join(" "),
        );
        return haystack.includes(query);
      })
      .sort((left, right) => Number(right.relevance_score || 0) - Number(left.relevance_score || 0));
  }, [assetFilter, regionFilter, searchQuery, sourceData?.articles]);

  const riskRows = useMemo(
    () => computeRiskRows({ selectedTheme, sources: sourceData?.articles || [], scenarioResult }),
    [scenarioResult, selectedTheme, sourceData?.articles],
  );

  const causalReadout = useMemo(() => deriveCausalReadout(scenarioResult, selectedTheme), [scenarioResult, selectedTheme]);

  const maxAbsRisk = useMemo(() => {
    if (!riskRows.length) return 5;
    return Math.max(5, ...riskRows.map((row) => Math.abs(Number(row.weightedImpact || 0))));
  }, [riskRows]);

  const contentLoading = isLoadingTimeline || isLoadingSources || isLoadingMemory;

  return (
    <SurfaceCard tone="strong" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="atlas-chip">Interactive Risk Intelligence</div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-zinc-100 sm:text-xl">Scenario Theme Explorer</h3>
          <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
            Track heat transitions, trace region-to-asset propagation, and convert each macro theme into source-backed risk implications.
          </p>
        </div>
        <div className="rounded-xl border border-white/14 bg-black/30 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Selected Theme</div>
          <div className="text-sm font-semibold text-zinc-100">{selectedTheme?.label || "--"}</div>
          <div className="text-[11px] text-zinc-400">
            temp {selectedTheme?.temperature ?? "--"} | state {selectedTheme?.state || "--"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-zinc-300">
              <Flame className="h-3.5 w-3.5 text-amber-300" />
              Theme Heat Evolution
            </div>
            <div className="flex items-center gap-1.5">
              {TIMELINE_PRESETS.map((preset) => {
                const active = timelineWindow === preset.hours;
                return (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => setTimelineWindow(preset.hours)}
                    className={`atlas-focus-ring rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition ${
                      active
                        ? "border-white/35 bg-white/[0.14] text-zinc-100"
                        : "border-white/16 bg-transparent text-zinc-400 hover:border-white/30 hover:text-zinc-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 h-[256px]">
            {timelineRows.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timelineRows} margin={{ top: 8, right: 14, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id="mentions-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickMargin={8}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="temp"
                    domain={[0, 100]}
                    tick={{ fill: "#d4d4d8", fontSize: 11 }}
                    width={40}
                    tickMargin={8}
                  />
                  <YAxis
                    yAxisId="mentions"
                    orientation="right"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    width={44}
                    tickMargin={8}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(8, 10, 16, 0.95)",
                    }}
                    labelStyle={{ color: "#f4f4f5", fontSize: 12 }}
                    formatter={(value, key) => {
                      if (key === "temperature") return [`${value}`, "Temperature"];
                      if (key === "mention_count") return [`${value}`, "Mentions"];
                      if (key === "momentum") return [`${Number(value).toFixed(2)}`, "Momentum"];
                      return [value, key];
                    }}
                  />
                  <ReferenceLine yAxisId="temp" y={75} stroke="rgba(251,113,133,0.45)" strokeDasharray="4 4" />
                  <ReferenceLine yAxisId="temp" y={40} stroke="rgba(56,189,248,0.45)" strokeDasharray="4 4" />
                  <Area
                    yAxisId="mentions"
                    type="monotone"
                    dataKey="mention_count"
                    stroke="rgba(56,189,248,0.35)"
                    fill="url(#mentions-area)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temperature"
                    stroke="#f8fafc"
                    strokeWidth={2.2}
                    dot={({ cx, cy, payload }) => (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={payload.transition ? 4.5 : 2.8}
                        fill={payload.stateColor}
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth={payload.transition ? 1.2 : 0.5}
                      />
                    )}
                    isAnimationActive={false}
                  />
                  <Brush
                    dataKey="timeLabel"
                    height={22}
                    stroke="rgba(255,255,255,0.35)"
                    travellerWidth={8}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-white/10 bg-black/25 text-xs text-zinc-500">
                Waiting for enough timeline samples for this theme.
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-white/16 px-2.5 py-1 text-zinc-300">
              trend {trend.direction === "up" ? "warming" : trend.direction === "down" ? "cooling" : "stable"}
            </span>
            <span className="rounded-full border border-white/16 px-2.5 py-1 text-zinc-300">delta {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(1)}</span>
            <span className="rounded-full border border-white/16 px-2.5 py-1 text-zinc-300">
              transitions {transitionFeed.length}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/12 bg-black/28 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.12em] text-zinc-300">Live Themes Universe</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">click bubble</div>
            </div>

            <div className="mt-2 h-[200px]">
              {heatUniverseRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 10, left: 2, bottom: 8 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="temperature"
                      domain={[0, 100]}
                      name="Temperature"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickMargin={7}
                    />
                    <YAxis
                      type="number"
                      dataKey="market_reaction_score"
                      domain={[0, 100]}
                      name="Market Reaction"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickMargin={7}
                    />
                    <ZAxis type="number" dataKey="bubble" range={[70, 460]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(8, 10, 16, 0.95)",
                      }}
                      formatter={(value, name) => {
                        if (name === "temperature") return [value, "Temperature"];
                        if (name === "market_reaction_score") return [value, "Market Reaction"];
                        if (name === "mention_count") return [value, "Mentions"];
                        return [value, name];
                      }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label || "Theme"}
                    />
                    <Scatter
                      data={heatUniverseRows}
                      shape="circle"
                      onClick={(point) => {
                        const themeId = point?.payload?.theme_id;
                        if (themeId) setSelectedThemeId(themeId);
                      }}
                      isAnimationActive={false}
                    >
                      {heatUniverseRows.map((row) => {
                        const selected = row.theme_id === selectedTheme?.theme_id;
                        return (
                          <Cell
                            key={`bubble-${row.theme_id}`}
                            fill={toStateColor(row.state)}
                            stroke={selected ? "#ffffff" : "rgba(255,255,255,0.2)"}
                            strokeWidth={selected ? 1.8 : 0.6}
                          />
                        );
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">Theme universe is refreshing.</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/12 bg-black/28 p-3">
            <div className="text-xs uppercase tracking-[0.12em] text-zinc-300">Hot/Cool Transition Feed</div>
            <div className="mt-2 max-h-[154px] space-y-2 overflow-auto pr-1">
              {transitionFeed.map((entry) => (
                <div key={`${entry.as_of}-${entry.to}`} className="rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-2">
                  <div className="text-[11px] text-zinc-200">
                    {entry.from.toUpperCase()} → <span style={{ color: toStateColor(entry.to) }}>{entry.to.toUpperCase()}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    {formatTimeLabel(entry.as_of)} | temp {entry.temperature}
                  </div>
                </div>
              ))}
              {!transitionFeed.length ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.01] px-2.5 py-3 text-[11px] text-zinc-500">
                  No state transitions in the selected horizon.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-zinc-300">
              <Network className="h-3.5 w-3.5 text-cyan-300" />
              Region → Asset Propagation Bridge
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {bridgeData.observed ? "source-derived" : "theme-derived"}
            </div>
          </div>

          <div className="mt-3 h-[260px]">
            {bridgeData.links.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={bridgeData}
                  nodePadding={30}
                  linkCurvature={0.45}
                  margin={{ left: 8, right: 8, top: 10, bottom: 10 }}
                >
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(8, 10, 16, 0.95)",
                    }}
                    formatter={(value, key, item) => {
                      if (key === "value") {
                        return [Number(value).toFixed(2), `${item?.payload?.region || "Region"} → ${item?.payload?.asset || "Asset"}`];
                      }
                      return [value, key];
                    }}
                  />
                </Sankey>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-white/10 bg-black/22 text-xs text-zinc-500">
                Source tags are still building region/asset co-occurrence links.
              </div>
            )}
          </div>

          <div className="mt-2 text-[11px] text-zinc-400">
            Connected regions: {bridgeData.nodes.filter((node) => node.side === "region").length} | assets: {bridgeData.nodes.filter((node) => node.side === "asset").length}
          </div>
        </div>

        <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-zinc-300">
              <Globe2 className="h-3.5 w-3.5 text-zinc-100" />
              Institutional Memory Curve
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">discussion snapshots</div>
          </div>

          <div className="mt-3 h-[190px]">
            {memoryRows.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={memoryRows} margin={{ top: 10, right: 10, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="memory-importance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f8fafc" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#f8fafc" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="timeLabel" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={26} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={38} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(8, 10, 16, 0.95)",
                    }}
                    formatter={(value, key) => [value, key === "importance" ? "Importance" : key]}
                    labelFormatter={(_, payload) => {
                      if (!payload?.length) return "Snapshot";
                      return payload[0].payload.title;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="importance"
                    stroke="#f8fafc"
                    strokeWidth={2}
                    fill="url(#memory-importance)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-white/10 bg-black/22 text-xs text-zinc-500">
                Institutional memory snapshots are still accumulating for this theme.
              </div>
            )}
          </div>

          <div className="mt-3 max-h-[136px] space-y-2 overflow-auto pr-1">
            {memoryRows.slice(-4).reverse().map((row) => (
              <div key={row.id} className="rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-2">
                <div className="text-[11px] text-zinc-200">{row.title}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">{formatTimeLabel(row.as_of)} | action: {row.primary_action || "monitor"}</div>
              </div>
            ))}
            {!memoryRows.length ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.01] px-2.5 py-3 text-[11px] text-zinc-500">No memory snapshots yet.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-zinc-300">
              {trend.direction === "up" ? <TrendingUp className="h-3.5 w-3.5 text-rose-300" /> : <TrendingDown className="h-3.5 w-3.5 text-sky-300" />}
              Risk Implication Ladder
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {scenarioResult?.config ? "scenario-weighted" : "theme-baseline"}
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-white/10 bg-black/24 px-3 py-2 text-[11px] text-zinc-300">{causalReadout}</div>

          <div className="mt-3 h-[248px]">
            {riskRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskRows} layout="vertical" margin={{ top: 8, right: 16, left: 20, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    domain={[-maxAbsRisk, maxAbsRisk]}
                    tick={{ fill: "#a1a1aa", fontSize: 11 }}
                    tickFormatter={(value) => value.toFixed(0)}
                  />
                  <YAxis
                    type="category"
                    dataKey="asset"
                    width={108}
                    tick={{ fill: "#d4d4d8", fontSize: 10 }}
                    tickFormatter={(value) => String(value).slice(0, 18)}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(8, 10, 16, 0.95)",
                    }}
                    formatter={(value, name, item) => {
                      if (name === "weightedImpact") {
                        const unit = item?.payload?.unit === "bp" ? "bp" : "%";
                        return [`${Number(value).toFixed(unit === "bp" ? 1 : 2)}${unit}`, "Weighted Impact"];
                      }
                      if (name === "relevance") {
                        return [`${Math.round(Number(value) * 100)}%`, "Theme Relevance"];
                      }
                      return [value, name];
                    }}
                  />
                  <ReferenceLine x={0} stroke="rgba(255,255,255,0.25)" />
                  <Bar dataKey="weightedImpact" radius={[5, 5, 5, 5]}>
                    {riskRows.map((row) => (
                      <Cell key={`risk-${slug(row.asset)}`} fill={toSeverityColor(row.severity)} fillOpacity={Math.max(0.38, row.relevance)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-white/10 bg-black/22 text-xs text-zinc-500">
                Run scenario or wait for theme evidence to generate risk implications.
              </div>
            )}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {["critical", "high", "medium"].map((severity) => (
              <div key={severity} className="rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-2 text-[10px] uppercase tracking-[0.1em] text-zinc-300">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: toSeverityColor(severity) }} /> {severity}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-zinc-300">
              <BookOpenText className="h-3.5 w-3.5 text-cyan-300" />
              Source Navigator
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{filteredSources.length} articles</div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-white/14 bg-black/35 px-2.5 py-2 text-xs text-zinc-400">
              <Search className="h-3.5 w-3.5" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search source evidence"
                className="w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            </label>

            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="atlas-focus-ring rounded-lg border border-white/14 bg-black/35 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Regions</option>
              {filterOptions.regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>

            <select
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
              className="atlas-focus-ring rounded-lg border border-white/14 bg-black/35 px-2.5 py-2 text-xs text-zinc-200 sm:col-span-2"
            >
              <option value="">All Asset Tags</option>
              {filterOptions.assets.map((asset) => (
                <option key={asset} value={asset}>{asset}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-[292px] space-y-2 overflow-auto pr-1">
            {filteredSources.slice(0, 14).map((article) => (
              <a
                key={article.article_id}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-2 transition hover:border-white/28"
              >
                <div className="text-[11px] font-medium text-zinc-100">{article.title}</div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {article.source} | {formatTimeLabel(article.published_at)} | relevance {(Number(article.relevance_score || 0) * 100).toFixed(0)}%
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
                  {(article.region_tags || []).slice(0, 2).map((tag) => (
                    <span key={`${article.article_id}-${tag}`} className="rounded-full border border-white/14 px-2 py-0.5">{tag}</span>
                  ))}
                  {(article.asset_tags || []).slice(0, 2).map((tag) => (
                    <span key={`${article.article_id}-${tag}`} className="rounded-full border border-cyan-400/25 px-2 py-0.5 text-cyan-200">{tag}</span>
                  ))}
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-zinc-300">
                  Open Source <ExternalLink className="h-3 w-3" />
                </div>
              </a>
            ))}
            {!filteredSources.length ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.01] px-2.5 py-5 text-center text-xs text-zinc-500">
                No source records match current filters.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/14 px-2.5 py-1">
          <Link2 className="h-3 w-3" /> region-asset linkage
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/14 px-2.5 py-1">
          global and local signal continuity
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/14 px-2.5 py-1">
          {isScenarioRunning ? "scenario run in progress" : "scenario engine synced"}
        </span>
      </div>

      {(isLiveError || isTimelineError || isSourcesError || isMemoryError) && (
        <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Data sync issue: {liveError?.message || timelineError?.message || sourcesError?.message || memoryError?.message || "Unknown error"}
        </div>
      )}
      {(isLoadingLive || contentLoading) && (
        <div className="mt-2 text-xs text-zinc-500">Refreshing interactive data layers...</div>
      )}
    </SurfaceCard>
  );
}
