import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Flame,
  Landmark,
  Loader2,
  ScrollText,
  Send,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Target,
} from "lucide-react";
import { clearMemoryVaultCache, describeApiError, fetchNewsHeadlines, runNewsNavigator } from "@/api/atlasClient";
import KeywordHighlighter from "@/components/worldpulse/KeywordHighlighter";

const HORIZON_OPTIONS = [
  { id: "daily", label: "Day" },
  { id: "weekly", label: "Week" },
  { id: "monthly", label: "Month" },
  { id: "yearly", label: "Year" },
];

const CONTENT_TYPE_OPTIONS = [
  { id: "macroeconomic_releases", label: "Macro Releases" },
  { id: "central_bank_commentary", label: "Central Bank" },
  { id: "geopolitical_developments", label: "Geopolitics" },
  { id: "regulatory_announcements", label: "Regulatory" },
  { id: "sector_specific_events", label: "Sector Events" },
  { id: "fiscal_policy", label: "Fiscal Policy" },
  { id: "trade_policy", label: "Trade Policy" },
  { id: "market_volatility", label: "Market Volatility" },
];

const CONTENT_TYPE_LABELS = Object.fromEntries(CONTENT_TYPE_OPTIONS.map((item) => [item.id, item.label]));
const SOURCE_TYPE_OPTIONS = [
  { id: "wire", label: "Wire" },
  { id: "institutional", label: "Institutional" },
  { id: "publisher", label: "Publisher" },
  { id: "rss", label: "RSS" },
];
const REGION_OPTIONS = [
  { id: "", label: "All Regions" },
  { id: "global", label: "Global" },
  { id: "united_states", label: "United States" },
  { id: "europe", label: "Europe" },
  { id: "china", label: "China" },
  { id: "japan", label: "Japan" },
  { id: "middle_east", label: "Middle East" },
  { id: "emerging_markets", label: "Emerging Markets" },
  { id: "latin_america", label: "Latin America" },
  { id: "asia_pacific", label: "Asia Pacific" },
];
const DEFAULT_FILTERS = {
  country: "",
  region: "",
  search: "",
  contentTypes: [],
  sourceTypes: [],
};
const TWIN_OPTIONS = [
  {
    id: "multi_asset_fund",
    label: "Global Multi-Asset Fund",
    description: "Balances rates, equities, FX, and credit with fast rebalancing in mind.",
  },
  {
    id: "retail_bank",
    label: "Retail Bank Treasury",
    description: "Prioritizes liquidity, margin stability, and mortgage/consumer credit resilience.",
  },
  {
    id: "fintech_lender",
    label: "Fintech Credit Platform",
    description: "Focuses on underwriting quality, warehouse lines, and borrower affordability.",
  },
  {
    id: "global_treasury",
    label: "Global Corporate Treasury",
    description: "Optimizes cash, FX hedging, and funding plans across operating regions.",
  },
  {
    id: "canadian_pension",
    label: "Canadian Pension CIO",
    description: "Balances long-duration liabilities with inflation, growth, and real-asset exposure.",
  },
];
const DEFAULT_TWIN = {
  profileId: "multi_asset_fund",
  customName: "",
  objective: "",
};

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatPublishedAt(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRegionLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function insightStateLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("hot")) return "Heating";
  if (normalized.includes("warm")) return "Warming";
  if (normalized.includes("cool")) return "Cooling";
  if (normalized.includes("cold")) return "Cooling";
  return "Stable";
}

function trendLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "rising") return "On The Rise";
  if (normalized === "falling") return "On The Fall";
  return "Sideways";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clipText(value, maxWords = 18) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function parseNavigatorSections(text) {
  const sectionTitles = [
    "Summary",
    "Why It Matters Now",
    "Local Impact",
    "Global Impact",
    "Portfolio Twin",
    "Agent Debate",
    "Memory Recall",
    "What To Watch",
  ];

  const normalized = String(text || "").replace(/\r/g, "");
  const matches = Array.from(
    normalized.matchAll(/^(Summary|Why It Matters Now|Local Impact|Global Impact|Portfolio Twin|Agent Debate|Memory Recall|What To Watch)$/gm),
  );
  if (!matches.length) return {};

  return matches.reduce((accumulator, match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const heading = match[0];
    const body = normalized.slice(start, end).trim();
    if (sectionTitles.includes(heading)) {
      accumulator[heading] = body;
    }
    return accumulator;
  }, {});
}

function extractTerms(text) {
  const words = String(text || "")
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g);
  if (!words) return [];
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "while",
    "over",
    "under",
    "about",
    "after",
    "before",
    "market",
    "global",
    "today",
  ]);
  const unique = [];
  const seen = new Set();
  words.forEach((word) => {
    if (stop.has(word) || seen.has(word)) return;
    seen.add(word);
    unique.push(word);
  });
  return unique;
}

function headlinePrompt(headline, horizon) {
  return `Analyze this headline for ${horizon} horizon. Cover both local and global impact clearly: ${headline}`;
}

export default function NewsNavigatorPanel({
  onHeadlineSelected = null,
  onThemeSelected = null,
  borderless = false,
  overviewStats = null,
}) {
  const queryClient = useQueryClient();
  const [horizon, setHorizon] = useState("daily");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [themeHotCoolFilter, setThemeHotCoolFilter] = useState("all");
  const [twin, setTwin] = useState(DEFAULT_TWIN);

  const [headlines, setHeadlines] = useState([]);
  const [headlineTotal, setHeadlineTotal] = useState(0);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);
  const [headlinesError, setHeadlinesError] = useState("");
  const [selectedHeadlineId, setSelectedHeadlineId] = useState("");
  const [lastHeadlinesRefreshAt, setLastHeadlinesRefreshAt] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const autoRunSignatureRef = useRef("");
  const headlinesRef = useRef([]);

  const handleFileChange = (event) => {
    const selected = Array.from(event.target.files || []).slice(0, 4);
    setFiles(selected);
  };

  const buildAttachments = useCallback(async () => {
    const rows = [];
    for (const file of files) {
      const mime = String(file.type || "application/octet-stream");
      const base = {
        file_name: file.name,
        mime_type: mime,
        size_bytes: file.size || 0,
        text_excerpt: "",
        image_data_url: null,
      };

      try {
        if (mime.startsWith("text/") || /\.(txt|md|csv|json|log|xml|yaml|yml|tsv)$/i.test(file.name)) {
          const text = await readAsText(file);
          rows.push({ ...base, text_excerpt: text.slice(0, 6000) });
          continue;
        }
        if (mime.startsWith("image/")) {
          const dataUrl = await readAsDataURL(file);
          rows.push({ ...base, image_data_url: dataUrl.slice(0, 120000) });
          continue;
        }
      } catch {
        rows.push(base);
        continue;
      }
      rows.push(base);
    }
    return rows;
  }, [files]);

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        country: filters.country,
        region: filters.region,
        search: filters.search,
        contentTypes: [...filters.contentTypes].sort(),
        sourceTypes: [...filters.sourceTypes].sort(),
      }),
    [filters],
  );
  const twinSignature = useMemo(
    () =>
      JSON.stringify({
        profileId: twin.profileId,
        customName: twin.customName.trim(),
        objective: twin.objective.trim(),
      }),
    [twin],
  );
  const selectedTwinOption = useMemo(
    () => TWIN_OPTIONS.find((item) => item.id === twin.profileId) || TWIN_OPTIONS[0],
    [twin.profileId],
  );

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.country.trim() ||
          filters.region.trim() ||
          filters.search.trim() ||
          filters.contentTypes.length ||
          filters.sourceTypes.length,
      ),
    [filters],
  );

  const toggleFilterValue = (key, value) => {
    setFilters((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const exists = current.includes(value);
      return {
        ...prev,
        [key]: exists ? current.filter((item) => item !== value) : [...current, value],
      };
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTick((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    headlinesRef.current = headlines;
  }, [headlines]);

  useEffect(() => {
    const controller = new AbortController();
    const debounce = setTimeout(async () => {
      setHeadlinesLoading(true);
      setHeadlinesError("");
      try {
        const payload = await fetchNewsHeadlines(
          {
            horizon,
            country: filters.country,
            region: filters.region,
            contentTypes: filters.contentTypes,
            sourceTypes: filters.sourceTypes,
            search: filters.search,
            limit: 50,
          },
          { signal: controller.signal },
        );
        setHeadlines(Array.isArray(payload?.headlines) ? payload.headlines : []);
        setHeadlineTotal(Number(payload?.total || 0));
        setLastHeadlinesRefreshAt(new Date());
      } catch (loadError) {
        if (loadError?.name === "AbortError" || String(loadError?.message || "").toLowerCase().includes("aborted")) {
          return;
        }
        if ((headlinesRef.current || []).length) {
          setHeadlinesError("Live refresh delayed. Showing last synced headlines.");
        } else {
          setHeadlines([]);
          setHeadlineTotal(0);
          setHeadlinesError(describeApiError(loadError, "Could not load live headlines."));
        }
      } finally {
        setHeadlinesLoading(false);
      }
    }, 160);

    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [filterSignature, horizon, refreshTick]);

  useEffect(() => {
    if (!headlines.length) {
      setSelectedHeadlineId("");
      return;
    }
    if (selectedHeadlineId && headlines.some((item) => item.article_id === selectedHeadlineId)) {
      return;
    }
    setSelectedHeadlineId(headlines[0].article_id);
  }, [headlines, selectedHeadlineId]);

  const selectedHeadline = useMemo(() => {
    if (!headlines.length) return null;
    if (!selectedHeadlineId) return headlines[0];
    return headlines.find((item) => item.article_id === selectedHeadlineId) || headlines[0];
  }, [headlines, selectedHeadlineId]);

  const selectedHeadlineIndex = useMemo(
    () => headlines.findIndex((item) => item.article_id === selectedHeadline?.article_id),
    [headlines, selectedHeadline?.article_id],
  );

  const headlineHighlights = useMemo(() => {
    if (!selectedHeadline?.title) return [];

    const fromAnalysis = (result?.highlights || [])
      .filter((item) => selectedHeadline.title.toLowerCase().includes(String(item.term || "").toLowerCase()))
      .slice(0, 8);
    if (fromAnalysis.length) {
      return fromAnalysis;
    }

    return extractTerms(selectedHeadline.title)
      .slice(0, 6)
      .map((term) => ({
        term,
        explanation: `The term "${term}" is a high-signal keyword in the current macro headline.`,
      }));
  }, [result?.highlights, selectedHeadline?.title]);

  const runAnalysis = useCallback(
    async ({ auto = false } = {}) => {
      const manualPrompt = prompt.trim();
      const selectedTitle = selectedHeadline?.title || "";
      const effectivePrompt = manualPrompt || headlinePrompt(selectedTitle, horizon);

      if (!effectivePrompt.trim()) {
        setError("Select a headline or enter a prompt to run News Navigator.");
        return;
      }

      setIsRunning(true);
      setError("");
      try {
        const attachments = await buildAttachments();
        const payload = await runNewsNavigator({
          prompt: effectivePrompt,
          horizon,
          attachments,
          persist_memory: !auto,
          twin: {
            profile_id: twin.profileId,
            custom_name: twin.customName.trim(),
            objective: twin.objective.trim(),
          },
          filters: {
            country: filters.country,
            region: filters.region,
            content_types: filters.contentTypes,
            source_types: filters.sourceTypes,
            query: filters.search,
          },
        });
        startTransition(() => {
          setResult(payload);
          setSelectedThemeId(payload?.theme_insights?.[0]?.theme_id || "");
        });
        if (payload?.memory_entry_id) {
          const historyEntry = {
            entry_id: payload.memory_entry_id,
            heading: payload.memory_heading || payload.theme_insights?.[0]?.label || "Saved discussion",
            created_at: payload.as_of || new Date().toISOString(),
            theme_label: payload.theme_insights?.[0]?.label || "Unclassified",
            prompt_preview:
              effectivePrompt.length > 140 ? `${effectivePrompt.slice(0, 140)}...` : effectivePrompt,
            source_count: Array.isArray(payload.sources) ? payload.sources.length : 0,
          };

          queryClient.setQueriesData({ queryKey: ["memory-history"] }, (current) => {
            if (!current || !Array.isArray(current.entries)) {
              return {
                as_of: payload.as_of || new Date().toISOString(),
                entries: [historyEntry],
                explanation: { summary: "Memory history updated from latest News Navigator run.", top_factors: [] },
              };
            }
            const filtered = current.entries.filter((item) => item.entry_id !== payload.memory_entry_id);
            return {
              ...current,
              as_of: payload.as_of || current.as_of,
              entries: [historyEntry, ...filtered],
            };
          });

          queryClient.setQueryData(["memory-entry", payload.memory_entry_id], {
            as_of: payload.as_of || new Date().toISOString(),
            entry_id: payload.memory_entry_id,
            heading: payload.memory_heading || historyEntry.heading,
            created_at: payload.as_of || new Date().toISOString(),
            theme_id: payload.theme_insights?.[0]?.theme_id || "unclassified",
            theme_label: payload.theme_insights?.[0]?.label || "Unclassified",
            prompt: effectivePrompt,
            answer: payload.answer,
            horizon: payload.horizon,
            analysis_mode: payload.analysis_mode,
            importance_analysis: payload.importance_analysis,
            local_impact_analysis: payload.local_impact_analysis,
            global_impact_analysis: payload.global_impact_analysis,
            emerging_theme_analysis: payload.emerging_theme_analysis,
            sources: payload.sources || [],
            attachment_insights: payload.attachment_insights || [],
            theme_insights: payload.theme_insights || [],
            portfolio_twin: payload.portfolio_twin || null,
            agent_debate: payload.agent_debate || null,
            memory_recall: payload.memory_recall || null,
            decision_artifact: payload.decision_artifact || null,
            explanation: payload.explanation,
          });

          clearMemoryVaultCache(payload.memory_entry_id);
          queryClient.invalidateQueries({ queryKey: ["memory-history"] });
          queryClient.invalidateQueries({ queryKey: ["memory-entry", payload.memory_entry_id] });
        }
        if (selectedHeadline && typeof onHeadlineSelected === "function") {
          onHeadlineSelected({ headline: selectedHeadline, analysis: payload });
        }
        if (selectedHeadline?.theme_id && typeof onThemeSelected === "function") {
          onThemeSelected(selectedHeadline.theme_id, selectedHeadline, payload);
        }
      } catch (runError) {
        if (!auto) {
          setError(describeApiError(runError, "Could not run News Navigator."));
        }
      } finally {
        setIsRunning(false);
      }
    },
    [buildAttachments, filters, horizon, onHeadlineSelected, onThemeSelected, prompt, selectedHeadline, twin],
  );

  useEffect(() => {
    if (!selectedHeadline?.article_id) return;
    if (selectedHeadline?.theme_id && typeof onThemeSelected === "function") {
      onThemeSelected(selectedHeadline.theme_id, selectedHeadline, null);
    }
  }, [onThemeSelected, selectedHeadline]);

  useEffect(() => {
    if (!selectedHeadline?.article_id) return;
    const signature = `${horizon}:${selectedHeadline.article_id}:${filterSignature}:${twinSignature}`;
    if (autoRunSignatureRef.current === signature) return;
    autoRunSignatureRef.current = signature;
    const timer = setTimeout(() => {
      runAnalysis({ auto: true });
    }, 180);
    return () => clearTimeout(timer);
  }, [filterSignature, horizon, runAnalysis, selectedHeadline?.article_id, twinSignature]);

  useEffect(() => {
    const firstThemeId = result?.theme_insights?.[0]?.theme_id || "";
    setSelectedThemeId(firstThemeId);
  }, [result]);

  const activeThemeInsight = useMemo(() => {
    const insights = result?.theme_insights || [];
    if (!insights.length) return null;
    return insights.find((item) => item.theme_id === selectedThemeId) || insights[0];
  }, [result, selectedThemeId]);

  const macroThemeRows = useMemo(() => {
    const rows = Array.isArray(result?.theme_insights) ? result.theme_insights : [];
    const normalized = rows.map((item) => {
      const hotness = toNumber(item.hotness_score, Math.round(toNumber(item.relevance_score) * 100));
      const coolness = toNumber(item.coolness_score, Math.max(0, 100 - hotness));
      return {
        ...item,
        hotness,
        coolness,
        trend_direction: String(item.trend_direction || "stable").toLowerCase(),
        plain_english_story:
          item.plain_english_story ||
          `${item.label} is ${String(item.heat_state || "neutral").toLowerCase()} based on current live source flow and market confirmation.`,
      };
    });

    const filtered = normalized.filter((item) => {
      if (themeHotCoolFilter === "hot") return item.hotness >= item.coolness;
      if (themeHotCoolFilter === "cool") return item.coolness > item.hotness;
      return true;
    });

    const sorted = [...filtered].sort((left, right) => {
      if (themeHotCoolFilter === "cool") {
        return right.coolness - left.coolness;
      }
      return right.hotness - left.hotness;
    });
    return sorted.slice(0, 5);
  }, [result?.theme_insights, themeHotCoolFilter]);

  const liveEvidenceCount = useMemo(() => {
    const rows = Array.isArray(result?.sources) ? result.sources : [];
    return rows.filter((item) => !String(item.article_id || "").startsWith("seed-")).length;
  }, [result?.sources]);

  const answerSections = useMemo(() => parseNavigatorSections(result?.answer || ""), [result?.answer]);
  const quickTakeCards = useMemo(
    () =>
      [
        {
          id: "summary",
          label: "Primary Call",
          text: answerSections["Summary"] || result?.decision_artifact?.executive_call || result?.answer || "",
        },
        {
          id: "local",
          label: "Local Channel",
          text: result?.local_impact_analysis || answerSections["Local Impact"] || "",
        },
        {
          id: "global",
          label: "Global Channel",
          text: result?.global_impact_analysis || answerSections["Global Impact"] || "",
        },
      ].filter((item) => String(item.text || "").trim()),
    [answerSections, result?.answer, result?.decision_artifact?.executive_call, result?.global_impact_analysis, result?.local_impact_analysis],
  );

  const goHeadline = (direction) => {
    if (!headlines.length) return;
    const currentIndex = selectedHeadlineIndex >= 0 ? selectedHeadlineIndex : 0;
    const nextIndex = (currentIndex + direction + headlines.length) % headlines.length;
    setSelectedHeadlineId(headlines[nextIndex].article_id);
  };

  const overviewChips = [
    overviewStats?.asOf ? `As Of ${overviewStats.asOf}` : "",
    overviewStats?.confidence !== undefined && overviewStats?.confidence !== null ? `Confidence ${overviewStats.confidence}` : "",
    overviewStats?.healthySources ? `Healthy Sources ${overviewStats.healthySources}` : "",
    overviewStats?.status ? `Status ${overviewStats.status}` : "",
    headlineTotal ? `${headlineTotal} tracked` : "",
    lastHeadlinesRefreshAt ? `Synced ${formatPublishedAt(lastHeadlinesRefreshAt.toISOString())}` : "",
  ].filter(Boolean);

  return (
    <section
      className={
        borderless ? "space-y-4" : "rounded-2xl border border-white/12 bg-black/38 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-5"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {overviewChips.map((chip) => (
          <div key={chip} className="rounded-full border border-white/16 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300">
            {chip}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="space-y-3">
          <div className="rounded-xl border border-white/12 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Prompt</div>
                <div className="text-[11px] text-zinc-500">Ask Atlas directly or let the selected headline guide the answer.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {HORIZON_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setHorizon(option.id)}
                    className={`atlas-focus-ring rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.11em] transition ${
                      horizon === option.id
                        ? "border-white/35 bg-white/[0.14] text-zinc-100"
                        : "border-white/20 bg-white/[0.05] text-zinc-300 hover:border-white/30 hover:text-zinc-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Explain what this means for rates, currencies, and overall market risk."
              className="atlas-focus-ring mt-1.5 min-h-[108px] w-full resize-y rounded-xl border border-white/15 bg-black/35 p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-zinc-400">
                Atlas keeps this answer synced with the live headline you have selected below.
              </div>
              <button
                type="button"
                onClick={() => runAnalysis({ auto: false })}
                disabled={isRunning}
                className="atlas-focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-white/24 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isRunning ? "Analyzing..." : "Run Navigator"}
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Optional files</div>
                  <div className="text-[11px] text-zinc-500">Add notes, screenshots, or supporting context.</div>
                </div>
                <label className="atlas-focus-ring inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-white/25 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/35 hover:text-zinc-100">
                  <FileUp className="h-4 w-4" />
                  Upload files
                  <input type="file" className="hidden" multiple onChange={handleFileChange} />
                </label>
              </div>

              <div className="mt-2 max-h-[110px] space-y-1.5 overflow-auto pr-1">
                {files.length ? (
                  files.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300">
                      {file.name}
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-zinc-500">No files selected.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/12 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">Live headlines</div>
                <div className="text-[11px] text-zinc-500">{headlineTotal} matches {hasActiveFilters ? "| filtered view" : ""}</div>
              </div>
              {headlinesLoading ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refreshing
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Auto refresh 30s</span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search by topic or keyword"
                className="atlas-focus-ring rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
              />
              <select
                value={filters.region}
                onChange={(event) => setFilters((prev) => ({ ...prev, region: event.target.value }))}
                className="atlas-focus-ring rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs text-zinc-200"
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option.id || "all-regions"} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={filters.country}
                onChange={(event) => setFilters((prev) => ({ ...prev, country: event.target.value }))}
                placeholder="Country"
                className="atlas-focus-ring rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
              />
            </div>

            <details className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                Advanced Filters {hasActiveFilters ? "(active)" : "(optional)"}
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Content Type</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {CONTENT_TYPE_OPTIONS.map((option) => {
                      const active = filters.contentTypes.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleFilterValue("contentTypes", option.id)}
                          className={`atlas-focus-ring rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] transition ${
                            active
                              ? "border-cyan-200/45 bg-cyan-300/18 text-cyan-100"
                              : "border-white/18 bg-white/[0.03] text-zinc-300 hover:border-white/28 hover:text-zinc-100"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Source Type</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {SOURCE_TYPE_OPTIONS.map((option) => {
                      const active = filters.sourceTypes.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleFilterValue("sourceTypes", option.id)}
                          className={`atlas-focus-ring rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] transition ${
                            active
                              ? "border-cyan-200/45 bg-cyan-300/18 text-cyan-100"
                              : "border-white/18 bg-white/[0.03] text-zinc-300 hover:border-white/28 hover:text-zinc-100"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                        className="atlas-focus-ring rounded-full border border-white/20 bg-white/[0.02] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-zinc-300 transition hover:border-white/35 hover:text-zinc-100"
                      >
                        Clear Filters
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </details>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => goHeadline(-1)}
                disabled={headlines.length <= 1}
                className="atlas-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/[0.05] text-zinc-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous headline"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <select
                value={selectedHeadline?.article_id || ""}
                onChange={(event) => setSelectedHeadlineId(event.target.value)}
                className="atlas-focus-ring min-w-[260px] flex-1 rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-xs text-zinc-200"
              >
                {!headlines.length ? <option value="">No headlines matched current filters</option> : null}
                {headlines.map((item, index) => (
                  <option key={item.article_id} value={item.article_id}>
                    {index + 1}. {item.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => goHeadline(1)}
                disabled={headlines.length <= 1}
                className="atlas-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/[0.05] text-zinc-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next headline"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {headlinesError ? <div className="mt-2 text-[11px] text-rose-300">{headlinesError}</div> : null}

            <div className="mt-3 rounded-xl border border-white/12 bg-white/[0.04] p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">Selected headline</div>
              <KeywordHighlighter
                text={selectedHeadline?.title || "No headline available yet."}
                highlights={headlineHighlights}
                tooltipLabel="Headline keyword"
                className="mt-1.5 text-xl font-bold leading-tight text-zinc-100 sm:text-2xl"
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                <span>{selectedHeadline?.source || "--"}</span>
                <span>|</span>
                <span>{formatPublishedAt(selectedHeadline?.published_at)}</span>
                {selectedHeadline?.region ? (
                  <>
                    <span>|</span>
                    <span>{formatRegionLabel(selectedHeadline.region)}</span>
                  </>
                ) : null}
              </div>
              <div className="mt-2 text-xs leading-relaxed text-zinc-300">
                {selectedHeadline?.summary || "Waiting for reliable source summary..."}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden space-y-3 rounded-xl border border-white/12 bg-black/28 p-3">
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/8 p-2.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-emerald-100/85">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              Active Desk
            </div>
            <div className="mt-2 text-sm font-semibold text-zinc-100">{selectedTwinOption.label}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">{selectedTwinOption.description}</div>
            <details className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
              <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                Customize twin
              </summary>
              <div className="mt-2 space-y-2">
                <select
                  value={twin.profileId}
                  onChange={(event) => setTwin((prev) => ({ ...prev, profileId: event.target.value }))}
                  className="atlas-focus-ring w-full rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-xs text-zinc-200"
                >
                  {TWIN_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={twin.customName}
                  onChange={(event) => setTwin((prev) => ({ ...prev, customName: event.target.value }))}
                  placeholder="Optional custom desk name"
                  className="atlas-focus-ring w-full rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
                />
                <textarea
                  value={twin.objective}
                  onChange={(event) => setTwin((prev) => ({ ...prev, objective: event.target.value }))}
                  placeholder="Optional custom objective, e.g. protect Canadian mortgage resilience and FX funding."
                  className="atlas-focus-ring min-h-[88px] w-full rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-500"
                />
              </div>
            </details>
          </div>

          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              Attachments {files.length ? `(${files.length})` : ""}
            </summary>
            <div className="mt-2 space-y-2">
              <label className="atlas-focus-ring flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 transition hover:border-white/35 hover:text-zinc-100">
                <FileUp className="h-4 w-4" />
                Upload Media/Files
                <input type="file" className="hidden" multiple onChange={handleFileChange} />
              </label>

              <div className="max-h-[110px] space-y-1.5 overflow-auto pr-1">
                {files.length ? (
                  files.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300">
                      {file.name}
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-zinc-500">No files selected.</div>
                )}
              </div>
            </div>
          </details>

          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/8 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.1em] text-cyan-100/85">Theme Matrix</div>
              <div className="rounded-full border border-white/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-200">
                Live evidence {liveEvidenceCount}/{(result?.sources || []).length || 0}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { id: "all", label: "All" },
                { id: "hot", label: "Hot" },
                { id: "cool", label: "Cool" },
              ].map((option) => {
                const active = themeHotCoolFilter === option.id;
                return (
                  <button
                    key={`theme-filter-${option.id}`}
                    type="button"
                    onClick={() => setThemeHotCoolFilter(option.id)}
                    className={`atlas-focus-ring rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] transition ${
                      active
                        ? "border-white/35 bg-white/[0.14] text-zinc-100"
                        : "border-white/18 bg-white/[0.03] text-zinc-300 hover:border-white/30 hover:text-zinc-100"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 space-y-2">
              {macroThemeRows.length ? (
                macroThemeRows.map((item) => (
                  <button
                    key={`macro-theme-${item.theme_id}`}
                    type="button"
                    onClick={() => {
                      setSelectedThemeId(item.theme_id);
                      if (typeof onThemeSelected === "function") {
                        onThemeSelected(item.theme_id, selectedHeadline, result);
                      }
                    }}
                    className="atlas-focus-ring w-full rounded-lg border border-white/14 bg-white/[0.04] px-2.5 py-2 text-left transition hover:border-white/30 hover:bg-white/[0.08]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-zinc-100">{item.label}</div>
                      <div className="text-[9px] uppercase tracking-[0.09em] text-zinc-300">{trendLabel(item.trend_direction)}</div>
                    </div>
                    <div className="mt-2 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-1.5 rounded-full bg-[linear-gradient(90deg,rgba(56,189,248,0.9),rgba(251,146,60,0.92),rgba(248,113,113,0.94))]"
                        style={{ width: `${Math.max(10, Math.min(100, item.hotness))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                      <div className="rounded-md border border-rose-200/18 bg-rose-300/8 px-1.5 py-1">
                        <Flame className="mr-1 inline h-3 w-3 text-rose-100" />
                        Temp {item.hotness}
                      </div>
                      <div className="rounded-md border border-cyan-200/18 bg-cyan-300/8 px-1.5 py-1">
                        <Snowflake className="mr-1 inline h-3 w-3 text-cyan-100" />
                        Relief {item.coolness}
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">{clipText(item.plain_english_story, 18)}</div>
                    <div className="mt-1.5 grid grid-cols-1 gap-1 text-[10px] text-zinc-400">
                      <div><span className="text-zinc-200">Local:</span> {clipText(item.local_impact, 13)}</div>
                      <div><span className="text-zinc-200">Global:</span> {clipText(item.global_impact, 13)}</div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-white/12 bg-white/[0.02] px-2 py-1.5 text-[11px] text-zinc-400">
                  Run Navigator to populate hot/cool macro themes from live evidence.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-zinc-300">
            Atlas keeps the fast desk view concise: headline, transmission, decision, evidence, and memory are separated so the first read stays clear.
          </div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}

      <AnimatePresence>
        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {quickTakeCards.map((card) => (
                <div key={card.id} className="rounded-xl border border-white/12 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">{card.label}</div>
                  <KeywordHighlighter
                    text={clipText(card.text, 24)}
                    highlights={result.highlights || []}
                    tooltipLabel="Analysis keyword"
                    className="mt-2 text-[12px] leading-relaxed text-zinc-200"
                  />
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/12 bg-black/35 p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-zinc-500">
                <BrainCircuit className="h-3.5 w-3.5" />
                Navigator Brief
                <span className="ml-auto rounded-full border border-white/20 px-2 py-0.5 text-[9px] tracking-[0.1em] text-zinc-300">
                  {result.analysis_mode === "informational" ? "Informational Mode" : "Intelligence Mode"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {["Summary", "Why It Matters Now", "What To Watch"].map((section) => (
                  <div key={section} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">{section}</div>
                    <KeywordHighlighter
                      text={answerSections[section] || result.answer}
                      highlights={result.highlights || []}
                      tooltipLabel="Analysis keyword"
                      className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-zinc-200"
                    />
                  </div>
                ))}
              </div>
            </div>

            {result.portfolio_twin || result.decision_artifact ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                {result.portfolio_twin ? (
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-emerald-100/85">
                        <BriefcaseBusiness className="h-3.5 w-3.5" />
                        Portfolio Twin
                      </div>
                      <div className="rounded-full border border-white/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-200">
                        Confidence {Math.round((Number(result.portfolio_twin.confidence) || 0) * 100)}%
                      </div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-100">{result.portfolio_twin.label}</div>
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {result.portfolio_twin.institution_type} | {result.portfolio_twin.objective || result.portfolio_twin.mandate}
                    </div>
                    <div className="mt-2 text-[12px] leading-relaxed text-zinc-200">{result.portfolio_twin.summary}</div>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-rose-300/20 bg-rose-300/10 p-2.5">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-rose-100/85">Primary Risk</div>
                        <div className="mt-1 text-[11px] leading-relaxed text-zinc-200">{result.portfolio_twin.primary_risk}</div>
                      </div>
                      <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-2.5">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-cyan-100/85">Primary Opportunity</div>
                        <div className="mt-1 text-[11px] leading-relaxed text-zinc-200">{result.portfolio_twin.primary_opportunity}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      {(result.portfolio_twin.pnl_pressure_points || []).map((item, index) => (
                        <div key={`pressure-${index}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-[11px] leading-relaxed text-zinc-300">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.decision_artifact ? (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-amber-100/85">
                      <ScrollText className="h-3.5 w-3.5" />
                      Decision Artifact
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-100">{result.decision_artifact.title}</div>
                    <div className="mt-1 text-[11px] text-zinc-400">Audience: {result.decision_artifact.audience}</div>
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.05] p-2.5 text-[12px] leading-relaxed text-zinc-200">
                      {result.decision_artifact.executive_call}
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-zinc-300">{result.decision_artifact.why_now}</div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {(result.decision_artifact.action_checklist || []).map((item, index) => (
                        <div key={`decision-action-${index}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] text-zinc-200">
                          {index + 1}. {item}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-lg border border-rose-300/18 bg-rose-300/[0.08] px-2.5 py-2 text-[11px] leading-relaxed text-zinc-300">
                      Caution: {result.decision_artifact.caution_note}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <details className="rounded-xl border border-white/12 bg-black/28 p-3" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">Theme Interpretation</div>
                  <select
                    value={activeThemeInsight?.theme_id || ""}
                    onChange={(event) => setSelectedThemeId(event.target.value)}
                    className="atlas-focus-ring rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[11px] text-zinc-200"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {(result.theme_insights || []).map((insight) => (
                      <option key={insight.theme_id} value={insight.theme_id}>
                        {insight.label}
                      </option>
                    ))}
                  </select>
                </summary>

                {activeThemeInsight ? (
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-100">{activeThemeInsight.label}</div>
                      <div className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-300">
                        {insightStateLabel(activeThemeInsight.heat_state)}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-300">{activeThemeInsight.rationale}</div>
                    <div className="mt-1 text-[11px] text-zinc-300">
                      <span className="font-semibold text-zinc-100">Local:</span> {activeThemeInsight.local_impact}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">
                      <span className="font-semibold text-zinc-200">Global:</span> {activeThemeInsight.global_impact}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-zinc-500">No theme interpretation available yet.</div>
                )}

                {result.memory_entry_id ? (
                  <div className="mt-2 text-[10px] text-zinc-500">Saved to Memory Vault entry: {result.memory_entry_id}</div>
                ) : (
                  <div className="mt-2 text-[10px] text-zinc-500">Live analysis only. Use Run Navigator to save this prompt into Memory Vault.</div>
                )}
              </details>

              <details className="rounded-xl border border-white/12 bg-black/28 p-3" open>
                <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.11em] text-zinc-500">Verified Source Articles (Live)</summary>
                <div className="mt-2 max-h-[260px] space-y-2 overflow-auto pr-1">
                  {(result.sources || []).length ? (
                    (result.sources || []).map((source) => (
                      <a
                        key={source.article_id}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-white/10 bg-white/[0.04] p-2.5 transition hover:border-white/25 hover:bg-white/[0.07]"
                      >
                        <div className="text-[11px] text-zinc-100">{source.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                          <span>{source.source}</span>
                          <span>|</span>
                          <span>{formatPublishedAt(source.published_at)}</span>
                          {source.region ? (
                            <>
                              <span>|</span>
                              <span>{formatRegionLabel(source.region)}</span>
                            </>
                          ) : null}
                          {source.source_type ? (
                            <>
                              <span>|</span>
                              <span>{formatRegionLabel(source.source_type)}</span>
                            </>
                          ) : null}
                        </div>
                        {source.reason ? <div className="mt-1 text-[10px] text-zinc-400">{source.reason}</div> : null}
                        {(source.content_types || []).length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {source.content_types.slice(0, 3).map((type) => (
                              <span key={`${source.article_id}-${type}`} className="rounded-full border border-white/14 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-300">
                                {CONTENT_TYPE_LABELS[type] || formatRegionLabel(type)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </a>
                    ))
                  ) : (
                    <div className="text-[11px] text-zinc-500">No reliable live source articles matched this selection.</div>
                  )}
                </div>
              </details>
            </div>

            {result.agent_debate || result.memory_recall ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {result.agent_debate ? (
                  <div className="rounded-xl border border-cyan-300/18 bg-cyan-300/[0.08] p-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-cyan-100/85">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Agent Debate
                    </div>
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.05] p-2.5 text-[12px] leading-relaxed text-zinc-200">
                      {result.agent_debate.consensus}
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-zinc-300">
                      Disagreement: {result.agent_debate.disagreement}
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-zinc-300">
                      Next action: {result.agent_debate.next_action}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {(result.agent_debate.agents || []).map((agent) => (
                        <div key={agent.agent_id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[11px] font-semibold text-zinc-100">{agent.name}</div>
                              <div className="text-[10px] text-zinc-500">{agent.role}</div>
                            </div>
                            <div className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-200">
                              {agent.conviction}%
                            </div>
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-cyan-100/85">{agent.stance}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">{agent.thesis}</div>
                          <div className="mt-1 text-[11px] text-zinc-400">
                            <span className="font-semibold text-zinc-200">Risk:</span> {agent.key_risk}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-300">
                            <span className="font-semibold text-zinc-100">Move:</span> {agent.recommendation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.memory_recall ? (
                  <div className="rounded-xl border border-violet-300/18 bg-violet-300/[0.08] p-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-violet-100/85">
                      <Landmark className="h-3.5 w-3.5" />
                      Memory Recall
                    </div>
                    <div className="mt-2 text-[12px] leading-relaxed text-zinc-200">{result.memory_recall.summary}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">{result.memory_recall.regime_signal}</div>
                    <div className="mt-3 space-y-2">
                      {(result.memory_recall.matches || []).length ? (
                        (result.memory_recall.matches || []).map((item) => (
                          <div key={item.entry_id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] font-semibold text-zinc-100">{item.heading}</div>
                              <div className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-200">
                                Similarity {item.similarity}%
                              </div>
                            </div>
                            <div className="mt-1 text-[10px] text-zinc-500">
                              {item.theme_label} | {formatPublishedAt(item.created_at)}
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-300">{item.why_relevant}</div>
                            <div className="mt-1 text-[11px] text-zinc-400">
                              <span className="font-semibold text-zinc-200">Carry forward:</span> {item.carry_forward}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] text-zinc-400">
                          No prior internal memories cleared the similarity threshold yet.
                        </div>
                      )}
                    </div>
                    {(result.memory_recall.carry_forward_actions || []).length ? (
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.05] p-2.5">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                          <Target className="h-3.5 w-3.5" />
                          Carry Forward Actions
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {(result.memory_recall.carry_forward_actions || []).map((item, index) => (
                            <div key={`carry-forward-${index}`} className="text-[11px] text-zinc-200">
                              {index + 1}. {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(result.attachment_insights || []).length ? (
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">Attachment Interpretation</div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {(result.attachment_insights || []).map((item) => (
                    <div key={item.file_name} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                      <div className="text-[11px] font-semibold text-zinc-100">{item.file_name}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">{item.media_type}</div>
                      <div className="mt-1 text-[11px] text-zinc-300">{item.summary}</div>
                      <div className="mt-1 text-[11px] text-zinc-300">
                        <span className="font-semibold text-zinc-100">Relevance:</span> {item.relevance}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        <span className="font-semibold text-zinc-200">Impact:</span> {item.impact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
