import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ExternalLink, Filter, Search } from "lucide-react";
import {
  describeApiError,
  fetchDailyBriefing,
  fetchThemeLive,
  fetchThemeSources,
  getCachedDailyBriefing,
  getCachedThemeLive,
} from "@/api/atlasClient";

function normalizeText(value) {
  return String(value || "").trim();
}

function formatTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EvidenceExplorer() {
  const [query, setQuery] = useState("");
  const [themeId, setThemeId] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const cachedBrief = getCachedDailyBriefing();
  const cachedThemes = getCachedThemeLive();

  const { data: briefData, isLoading: isLoadingBrief, isError: isBriefError, error: briefError } = useQuery({
    queryKey: ["briefing-daily", "evidence", 72, 10],
    queryFn: () => fetchDailyBriefing({ windowHours: 72, limit: 10 }),
    initialData: cachedBrief || undefined,
    staleTime: 12 * 1000,
    refetchInterval: 20000,
  });

  const { data: themesData, isLoading: isLoadingThemes } = useQuery({
    queryKey: ["themes-live", "evidence", 72, 12],
    queryFn: () => fetchThemeLive({ windowHours: 72, limit: 12 }),
    initialData: cachedThemes || undefined,
    staleTime: 20 * 1000,
    refetchInterval: 30000,
  });

  const resolvedThemeId = themeId || themesData?.themes?.[0]?.theme_id || "";

  const { data: themeSourcesData, isLoading: isLoadingThemeSources } = useQuery({
    queryKey: ["theme-sources", resolvedThemeId, 120, 30],
    queryFn: () => fetchThemeSources(resolvedThemeId, { windowHours: 120, limit: 30 }),
    enabled: Boolean(resolvedThemeId),
    staleTime: 25 * 1000,
    refetchInterval: 35000,
  });

  const briefingEvidence = useMemo(() => {
    const developments = briefData?.developments || [];
    const rows = [];
    const seen = new Set();
    developments.forEach((development) => {
      const evidences = development?.proof_bundle?.source_evidence || [];
      evidences.forEach((item) => {
        const key = item?.article_id || `${item?.url || ""}::${item?.title || ""}`;
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push({
          id: key,
          title: normalizeText(item.title) || "Untitled Evidence",
          source: normalizeText(item.source) || "Unknown Source",
          url: normalizeText(item.url),
          published_at: item.published_at,
          theme: normalizeText(development.label) || "Macro Development",
          lane: "Briefing",
          snippet: normalizeText(item.summary || ""),
        });
      });
    });
    return rows;
  }, [briefData]);

  const themeEvidence = useMemo(() => {
    const rows = themeSourcesData?.sources || [];
    return rows.map((item, idx) => ({
      id: item.article_id || `${item.url || ""}::${idx}`,
      title: normalizeText(item.title) || "Untitled Evidence",
      source: normalizeText(item.source) || "Unknown Source",
      url: normalizeText(item.url),
      published_at: item.published_at,
      theme: normalizeText(item.theme_label || item.theme_id) || "Theme Evidence",
      lane: "Theme Feed",
      snippet: normalizeText(item.summary || item.snippet || ""),
    }));
  }, [themeSourcesData]);

  const allEvidence = useMemo(() => {
    const rows = [...briefingEvidence, ...themeEvidence];
    return rows.sort((a, b) => {
      const at = Date.parse(a.published_at || "") || 0;
      const bt = Date.parse(b.published_at || "") || 0;
      return bt - at;
    });
  }, [briefingEvidence, themeEvidence]);

  const sourceOptions = useMemo(() => {
    const set = new Set();
    allEvidence.forEach((item) => {
      if (item.source) set.add(item.source);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEvidence]);

  const filteredEvidence = useMemo(() => {
    const q = normalizeText(query).toLowerCase();
    const sf = normalizeText(sourceFilter).toLowerCase();

    return allEvidence.filter((item) => {
      if (sf && item.source.toLowerCase() !== sf) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.theme.toLowerCase().includes(q) ||
        item.snippet.toLowerCase().includes(q)
      );
    });
  }, [allEvidence, query, sourceFilter]);

  const loading = isLoadingBrief || isLoadingThemes || isLoadingThemeSources;

  return (
    <div className="min-h-[calc(100vh-96px)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <section className="atlas-glass-strong rounded-2xl border border-white/[0.08] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-cyan-200">
                <BookOpenText className="h-3.5 w-3.5" />
                Evidence Explorer
              </div>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Source Trail For Macro Narratives
              </h1>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                Explore article-level evidence powering briefing conclusions, theme temperature, and scenario context.
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Visible Records</div>
              <div className="text-lg font-semibold text-cyan-200">{filteredEvidence.length}</div>
            </div>
          </div>
        </section>

        <section className="atlas-glass-strong rounded-2xl border border-white/[0.08] p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
            <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, source, theme, snippet..."
                className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={resolvedThemeId}
                onChange={(e) => setThemeId(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-200 outline-none"
              >
                {(themesData?.themes || []).map((theme) => (
                  <option key={theme.theme_id} value={theme.theme_id} className="bg-slate-900 text-slate-100">
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-200 outline-none"
              >
                <option value="" className="bg-slate-900 text-slate-100">All sources</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source} className="bg-slate-900 text-slate-100">
                    {source}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="atlas-glass-strong rounded-2xl border border-white/[0.08] p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Evidence Records</div>
            {loading && <div className="text-xs text-slate-500">Refreshing evidence feeds...</div>}
          </div>

          <div className="max-h-[62vh] space-y-2 overflow-auto pr-1">
            {filteredEvidence.map((item) => {
              const cardClassName =
                "block rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 transition hover:border-cyan-400/35 hover:bg-cyan-500/[0.05]";

              if (!item.url) {
                return (
                  <div key={item.id} className={cardClassName}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{item.lane}</div>
                      <div className="text-[11px] text-slate-500">{formatTime(item.published_at)}</div>
                    </div>
                    <div className="mt-1 text-sm font-medium text-cyan-200">{item.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{item.source}</span>
                      <span className="text-slate-600">|</span>
                      <span>{item.theme}</span>
                    </div>
                    {item.snippet ? <div className="mt-1 text-xs text-slate-400">{item.snippet}</div> : null}
                    <div className="mt-1 text-[11px] text-slate-500">Source link unavailable for this record.</div>
                  </div>
                );
              }

              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cardClassName}
                >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{item.lane}</div>
                  <div className="text-[11px] text-slate-500">{formatTime(item.published_at)}</div>
                </div>
                <div className="mt-1 text-sm font-medium text-cyan-200">{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>{item.source}</span>
                  <span className="text-slate-600">|</span>
                  <span>{item.theme}</span>
                </div>
                {item.snippet && <div className="mt-1 text-xs text-slate-400">{item.snippet}</div>}
                <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan-300">
                  Open source
                  <ExternalLink className="h-3.5 w-3.5" />
                </div>
                </a>
              );
            })}

            {!loading && !filteredEvidence.length && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-6 text-center text-sm text-slate-500">
                No evidence records match your current filters.
              </div>
            )}
          </div>
        </section>

        {isBriefError && (
          <div className="text-xs text-rose-300">
            {describeApiError(briefError, "Could not load briefing evidence.")}
          </div>
        )}
      </div>
    </div>
  );
}

