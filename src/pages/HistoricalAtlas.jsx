import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, BookCopy, Clock3, History } from "lucide-react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { SectionHeading, SurfaceCard } from "@/components/premium/SurfaceCard";
import {
  fetchDailyBriefing,
  fetchThemeMemory,
  getCachedDailyBriefing,
  getCachedThemeMemory,
} from "@/api/atlasClient";

function buildSparklinePoints(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const values = points.map((point) => Number(point.temperature || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 34 - ((value - min) / span) * 28;
    return `${x},${y}`;
  });
}

export default function HistoricalAtlas({ embedded = false }) {
  const location = useLocation();
  const cachedBrief = getCachedDailyBriefing();
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [themeFromUrl, setThemeFromUrl] = useState("");

  const { data: dailyBrief } = useQuery({
    queryKey: ["briefing-daily-for-memory"],
    queryFn: () => fetchDailyBriefing({ windowHours: 72, limit: 8 }),
    initialData: cachedBrief || undefined,
    staleTime: 30 * 1000,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const themeId = params.get("theme_id");
    setThemeFromUrl(themeId || "");
  }, [location.search]);

  useEffect(() => {
    const themes = dailyBrief?.theme_board || [];
    if (!themes.length) {
      setSelectedThemeId("");
      return;
    }
    if (themeFromUrl && themes.some((item) => item.theme_id === themeFromUrl)) {
      setSelectedThemeId(themeFromUrl);
      return;
    }
    if (!selectedThemeId || !themes.some((item) => item.theme_id === selectedThemeId)) {
      setSelectedThemeId(themes[0].theme_id);
    }
  }, [dailyBrief, selectedThemeId, themeFromUrl]);

  const cachedThemeMemory = getCachedThemeMemory(selectedThemeId);
  const {
    data: themeMemory,
    isLoading: isLoadingThemeMemory,
    isError: isThemeMemoryError,
    error: themeMemoryError,
  } = useQuery({
    queryKey: ["theme-memory", selectedThemeId],
    queryFn: () => fetchThemeMemory(selectedThemeId, { windowHours: 720, limit: 30 }),
    initialData: cachedThemeMemory || undefined,
    staleTime: 60 * 1000,
    refetchInterval: 60000,
    enabled: Boolean(selectedThemeId),
  });

  const sparkline = useMemo(() => buildSparklinePoints(themeMemory?.timeline_points || []), [themeMemory?.timeline_points]);

  const reveal = {
    initial: { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: 0.45, ease: "easeOut" },
  };

  return (
    <div className={`${embedded ? "min-h-0" : "min-h-[calc(100vh-74px)]"} atlas-ghost-theme px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6`}>
      <div className="mx-auto max-w-[1550px] space-y-5">
        <motion.div {...reveal}>
          <SurfaceCard tone="strong" className="p-5 sm:p-6">
            <SectionHeading
              eyebrow="Memory Vault"
              title="Institutional Memory For Macro Themes"
              description="Recover prior discussions, supporting sources, and historical analogues so research context is retained across cycles."
              action={
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Confidence</div>
                  <div className="text-lg font-semibold text-zinc-100">{themeMemory?.confidence?.score ?? "--"}</div>
                </div>
              }
            />
          </SurfaceCard>
        </motion.div>

        <motion.section {...reveal} className="grid grid-cols-1 gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <SurfaceCard tone="strong" className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Archive className="h-4 w-4 text-zinc-300" />
              Tracked Themes
            </div>
            <div className="mt-3 space-y-1.5">
              {(dailyBrief?.theme_board || []).map((theme) => {
                const active = theme.theme_id === selectedThemeId;
                return (
                  <button
                    key={theme.theme_id}
                    type="button"
                    onClick={() => setSelectedThemeId(theme.theme_id)}
                    className={`atlas-focus-ring w-full rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "text-zinc-100"
                        : "text-zinc-300 hover:text-zinc-100"
                    }`}
                  >
                    <div className="text-xs font-medium">{theme.label}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      temp {theme.temperature} | {theme.state} | {theme.outlook_state}
                    </div>
                  </button>
                );
              })}
            </div>
          </SurfaceCard>

          <section className="space-y-4">
            <SurfaceCard tone="strong" className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Clock3 className="h-4 w-4 text-zinc-300" />
                Discussion Timeline
              </div>
              <div className="mt-3 p-3">
                {sparkline.length > 1 ? (
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-20 w-full">
                    <polyline
                      fill="none"
                      stroke="#f4f4f5"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={sparkline.join(" ")}
                    />
                  </svg>
                ) : (
                  <div className="flex h-20 items-center justify-center text-xs text-zinc-500">Timeline builds as snapshots accumulate.</div>
                )}
              </div>
              <div className="mt-3 space-y-3">
                {(themeMemory?.discussion_history || []).slice(0, 8).map((item, idx) => (
                  <div key={`${item.as_of}-${idx}`} className="flex items-start gap-2">
                    <div className="pt-[2px] text-zinc-500">*</div>
                    <div>
                      <div className="text-[11px] text-zinc-200">{item.title || "Theme Snapshot"}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-500">{new Date(item.as_of).toLocaleString()}</div>
                      <div className="mt-1 text-[11px] text-zinc-300">{item.summary}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">Primary action: {item.primary_action}</div>
                    </div>
                  </div>
                ))}
                {!themeMemory?.discussion_history?.length ? (
                  <div className="text-xs text-zinc-500">No historical discussion snapshots for this theme yet.</div>
                ) : null}
              </div>
            </SurfaceCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SurfaceCard tone="strong" className="p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <BookCopy className="h-4 w-4 text-zinc-300" />
                  Source Trail
                </div>
                <div className="mt-3 max-h-[320px] space-y-2 overflow-auto pr-1">
                  {(themeMemory?.source_articles || []).slice(0, 15).map((source) => (
                    <a
                      key={source.article_id}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block py-1.5"
                    >
                      <div className="text-xs text-zinc-200">{source.title}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        {source.source} | {new Date(source.published_at).toLocaleString()}
                      </div>
                    </a>
                  ))}
                  {!themeMemory?.source_articles?.length ? <div className="text-xs text-zinc-500">No source records.</div> : null}
                </div>
              </SurfaceCard>

              <SurfaceCard tone="strong" className="p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <History className="h-4 w-4 text-zinc-300" />
                  Related Analogues
                </div>
                <div className="mt-3 space-y-2.5">
                  {(themeMemory?.related_analogues || []).map((regime) => (
                    <div key={regime.id} className="pb-1">
                      <div className="text-xs text-zinc-100">
                        {regime.year} | {regime.label}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-300">Similarity {regime.similarity}%</div>
                      <div className="mt-1 text-[11px] text-zinc-500">{regime.description}</div>
                    </div>
                  ))}
                  {!themeMemory?.related_analogues?.length ? <div className="text-xs text-zinc-500">No analogue matches yet.</div> : null}
                </div>
              </SurfaceCard>
            </div>
          </section>
        </motion.section>

        {isLoadingThemeMemory ? <div className="text-xs text-zinc-500">Loading theme memory...</div> : null}
        {isThemeMemoryError ? <div className="text-xs text-rose-300">Memory load failed: {themeMemoryError?.message || "Unknown error"}</div> : null}
      </div>
    </div>
  );
}
