import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookCopy, FileText, History, Link2, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { SurfaceCard } from "@/components/premium/SurfaceCard";
import {
  fetchMemoryEntry,
  fetchMemoryHistory,
  getCachedMemoryEntry,
  getCachedMemoryHistory,
} from "@/api/atlasClient";

const MEMORY_PANEL =
  "rounded-2xl border border-white/10 bg-black/38 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-md";

function formatMemoryTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function HistoricalAtlas({ embedded = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const cachedHistory = getCachedMemoryHistory();
  const [selectedEntryId, setSelectedEntryId] = useState("");

  const { data: historyData, isLoading: isLoadingHistory, isError: isHistoryError, error: historyError } = useQuery({
    queryKey: ["memory-history", 80],
    queryFn: () => fetchMemoryHistory({ limit: 80 }),
    initialData: cachedHistory || undefined,
    staleTime: 30 * 1000,
    refetchInterval: 30000,
  });

  const historyEntries = historyData?.entries || [];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const entryId = params.get("memory_id") || "";
    if (entryId && historyEntries.some((item) => item.entry_id === entryId)) {
      setSelectedEntryId(entryId);
      return;
    }
    if (!selectedEntryId && historyEntries.length) {
      setSelectedEntryId(historyEntries[0].entry_id);
    }
  }, [historyEntries, location.search, selectedEntryId]);

  const cachedEntry = selectedEntryId ? getCachedMemoryEntry(selectedEntryId) : null;
  const {
    data: memoryEntry,
    isLoading: isLoadingEntry,
    isError: isEntryError,
    error: entryError,
  } = useQuery({
    queryKey: ["memory-entry", selectedEntryId],
    queryFn: () => fetchMemoryEntry(selectedEntryId),
    initialData: cachedEntry || undefined,
    staleTime: 60 * 1000,
    refetchInterval: 60000,
    enabled: Boolean(selectedEntryId),
  });

  const handleSelectEntry = (entryId) => {
    setSelectedEntryId(entryId);
    const params = new URLSearchParams(location.search);
    params.set("memory_id", entryId);
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
        hash: "#memory-vault",
      },
      { replace: true },
    );
  };

  const reveal = {
    initial: { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: 0.45, ease: "easeOut" },
  };

  return (
    <div className={`${embedded ? "min-h-0" : "min-h-[calc(100vh-74px)]"} px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6`}>
      <div className="mx-auto max-w-[1550px] space-y-5">
        <motion.div {...reveal}>
          <SurfaceCard tone="strong" className="p-5 sm:p-6">
            <div className="pl-1">
              <h2 className="text-[1.85rem] font-semibold tracking-tight text-zinc-100 sm:text-[2.2rem]">Memory Vault</h2>
              <p className="mt-2 text-[15px] text-zinc-400 sm:text-base">
                News Navigator conversation history, preserved as reusable research memory.
              </p>
            </div>
          </SurfaceCard>
        </motion.div>

        <motion.section {...reveal} className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <SurfaceCard tone="strong" className="p-4 sm:p-5">
            <div className={`${MEMORY_PANEL} p-4`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <History className="h-4 w-4 text-zinc-300" />
                Memory History
              </div>
              <div className="mt-4 max-h-[760px] space-y-2 overflow-auto pr-1">
                {historyEntries.map((item) => {
                  const active = item.entry_id === selectedEntryId;
                  return (
                    <button
                      key={item.entry_id}
                      type="button"
                      onClick={() => handleSelectEntry(item.entry_id)}
                      className={`atlas-focus-ring w-full rounded-xl border px-3.5 py-3 text-left transition ${
                        active
                          ? "border-white/18 bg-zinc-800/55"
                          : "border-white/10 bg-black/38 hover:border-white/22 hover:bg-black/52"
                      }`}
                    >
                      <div className="text-sm font-semibold text-zinc-100">{item.heading}</div>
                      <div className="mt-1 text-[12px] text-zinc-500">{formatMemoryTime(item.created_at)}</div>
                      <div className="mt-1 text-[12px] text-zinc-400">{item.theme_label}</div>
                      <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-zinc-400">{item.prompt_preview}</div>
                    </button>
                  );
                })}
                {!historyEntries.length && !isLoadingHistory ? (
                  <div className="text-sm text-zinc-500">No News Navigator memories saved yet.</div>
                ) : null}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard tone="strong" className="p-4 sm:p-5">
            <div className={`${MEMORY_PANEL} p-5 sm:p-6`}>
              {memoryEntry ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[1.45rem] font-semibold text-zinc-100 sm:text-[1.75rem]">{memoryEntry.heading}</h3>
                      <div className="mt-2 text-[14px] text-zinc-400 sm:text-[15px]">
                        {memoryEntry.theme_label} | {formatMemoryTime(memoryEntry.created_at)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Mode</div>
                      <div className="mt-1 text-base font-semibold text-zinc-100">{memoryEntry.analysis_mode}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <FileText className="h-4 w-4 text-zinc-300" />
                          Prompt
                        </div>
                        <div className="mt-3 text-[15px] leading-relaxed text-zinc-200 sm:text-[16px]">{memoryEntry.prompt}</div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <Sparkles className="h-4 w-4 text-zinc-300" />
                          Model Response
                        </div>
                        <div className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-zinc-200 sm:text-[16px]">
                          {memoryEntry.answer}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="text-base font-semibold text-zinc-100">Analysis Notes</div>
                        <div className="mt-3 space-y-3">
                          <div className="text-[14px] leading-relaxed text-zinc-300 sm:text-[15px]">
                            <span className="font-semibold text-zinc-100">Importance:</span> {memoryEntry.importance_analysis || "n/a"}
                          </div>
                          <div className="text-[14px] leading-relaxed text-zinc-300 sm:text-[15px]">
                            <span className="font-semibold text-zinc-100">Local impact:</span> {memoryEntry.local_impact_analysis || "n/a"}
                          </div>
                          <div className="text-[14px] leading-relaxed text-zinc-300 sm:text-[15px]">
                            <span className="font-semibold text-zinc-100">Global impact:</span> {memoryEntry.global_impact_analysis || "n/a"}
                          </div>
                          <div className="text-[14px] leading-relaxed text-zinc-300 sm:text-[15px]">
                            <span className="font-semibold text-zinc-100">Emerging themes:</span> {memoryEntry.emerging_theme_analysis || "n/a"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <BookCopy className="h-4 w-4 text-zinc-300" />
                          Resources Used
                        </div>
                        <div className="mt-4 max-h-[360px] space-y-3 overflow-auto pr-1">
                          {(memoryEntry.sources || []).map((source) => (
                            <a
                              key={source.article_id}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3 transition hover:border-white/20 hover:bg-white/[0.06]"
                            >
                              <div className="text-[15px] font-medium text-zinc-100">{source.title}</div>
                              <div className="mt-1 text-[13px] text-zinc-500">
                                {source.source} | {new Date(source.published_at).toLocaleString()}
                              </div>
                              <div className="mt-2 text-[13px] leading-relaxed text-zinc-300">{source.summary || source.reason}</div>
                            </a>
                          ))}
                          {!memoryEntry.sources?.length ? <div className="text-sm text-zinc-500">No linked resources stored.</div> : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <Link2 className="h-4 w-4 text-zinc-300" />
                          Links
                        </div>
                        <div className="mt-4 space-y-2">
                          {(memoryEntry.sources || []).map((source) => (
                            <a
                              key={`${source.article_id}-link`}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-[14px] text-zinc-300 transition hover:text-zinc-100"
                            >
                              {source.url}
                            </a>
                          ))}
                          {!memoryEntry.sources?.length ? <div className="text-sm text-zinc-500">No source links stored.</div> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">
                  {isLoadingEntry ? "Loading memory entry..." : "Select a memory on the left to inspect the stored conversation."}
                </div>
              )}
            </div>
          </SurfaceCard>
        </motion.section>

        {isLoadingHistory ? <div className="text-xs text-zinc-500">Loading memory history...</div> : null}
        {isHistoryError ? <div className="text-xs text-rose-300">Memory history failed: {historyError?.message || "Unknown error"}</div> : null}
        {isEntryError ? <div className="text-xs text-rose-300">Memory entry failed: {entryError?.message || "Unknown error"}</div> : null}
      </div>
    </div>
  );
}
