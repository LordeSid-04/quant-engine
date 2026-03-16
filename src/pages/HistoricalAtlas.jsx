import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Download,
  FileText,
  History,
  Link2,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { SurfaceCard } from "@/components/premium/SurfaceCard";
import {
  clearMemoryVaultCache,
  describeApiError,
  fetchMemoryEntry,
  fetchMemoryHistory,
  getCachedMemoryEntry,
  getCachedMemoryHistory,
  importMemoryEntry,
} from "@/api/atlasClient";
import { exportMemoryEntryFile, parseMemoryImportFile } from "@/lib/memoryFiles";

const MEMORY_PANEL =
  "rounded-2xl border border-white/10 bg-black/38 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-md";

function formatMemoryTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function HistoricalAtlas({ embedded = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cachedHistory = getCachedMemoryHistory();
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const {
    data: historyData,
    isLoading: isLoadingHistory,
    isError: isHistoryError,
    error: historyError,
  } = useQuery({
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

  const quickReadItems = useMemo(() => {
    if (!memoryEntry) return [];
    return [
      { label: "Why it mattered", value: memoryEntry.importance_analysis },
      { label: "Near-term local effect", value: memoryEntry.local_impact_analysis },
      { label: "Broader global effect", value: memoryEntry.global_impact_analysis },
      { label: "Theme shift", value: memoryEntry.emerging_theme_analysis },
    ].filter((item) => String(item.value || "").trim());
  }, [memoryEntry]);

  const handleSelectEntry = (entryId) => {
    setSelectedEntryId(entryId);
    const params = new URLSearchParams(location.search);
    params.set("memory_id", entryId);
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
        hash: embedded ? "#memory-vault" : "",
      },
      { replace: true },
    );
  };

  const handleImportFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setIsImporting(true);
    setImportError("");

    try {
      let latestEntryId = "";
      for (const file of files) {
        const parsed = await parseMemoryImportFile(file);
        const response = await importMemoryEntry(parsed);
        latestEntryId = response.entry_id || latestEntryId;
      }

      clearMemoryVaultCache();
      await queryClient.invalidateQueries({ queryKey: ["memory-history"] });
      if (latestEntryId) {
        handleSelectEntry(latestEntryId);
        await queryClient.invalidateQueries({ queryKey: ["memory-entry", latestEntryId] });
      }
    } catch (error) {
      setImportError(describeApiError(error, "Could not import this memory file."));
    } finally {
      event.target.value = "";
      setIsImporting(false);
    }
  };

  const handleExportSelected = () => {
    if (!memoryEntry) return;
    const { fileName, content } = exportMemoryEntryFile(memoryEntry);
    downloadTextFile(fileName, content);
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <h2 className="text-[1.85rem] font-semibold tracking-tight text-zinc-100 sm:text-[2.2rem]">Memory Vault</h2>
                <p className="mt-2 text-[15px] leading-7 text-zinc-400 sm:text-base">
                  Reopen past News Navigator conversations, import older notes, and keep one clean record of what was asked, answered, and worth remembering.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="atlas-focus-ring inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/18 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-200 transition hover:border-white/28 hover:bg-white/[0.08]">
                  {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {isImporting ? "Importing..." : "Import Chats"}
                  <input
                    type="file"
                    accept=".json,.atlasmemory,.txt,.md,.markdown,.log"
                    multiple
                    className="hidden"
                    onChange={handleImportFiles}
                    disabled={isImporting}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleExportSelected}
                  disabled={!memoryEntry}
                  className="atlas-focus-ring inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-200 transition hover:border-white/28 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Selected
                </button>
              </div>
            </div>
            {importError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{importError}</div>
            ) : null}
          </SurfaceCard>
        </motion.div>

        <motion.section {...reveal} className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <SurfaceCard tone="strong" className="p-4 sm:p-5">
            <div className={`${MEMORY_PANEL} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <History className="h-4 w-4 text-zinc-300" />
                  Saved conversations
                </div>
                <div className="rounded-full border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                  {historyEntries.length} entries
                </div>
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
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-zinc-500">
                    No saved memories yet. Run News Navigator or import a chat file to get started.
                  </div>
                ) : null}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard tone="strong" className="p-4 sm:p-5">
            <div className={`${MEMORY_PANEL} p-5 sm:p-6`}>
              {memoryEntry ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-4xl">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Selected memory</div>
                      <h3 className="mt-1 text-[1.45rem] font-semibold text-zinc-100 sm:text-[1.75rem]">{memoryEntry.heading}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-zinc-400">
                        <span>{memoryEntry.theme_label}</span>
                        <span>|</span>
                        <span>{formatMemoryTime(memoryEntry.created_at)}</span>
                      </div>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Mode</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">{memoryEntry.analysis_mode}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Sources</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">{memoryEntry.sources?.length || 0}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Horizon</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">{memoryEntry.horizon}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <FileText className="h-4 w-4 text-zinc-300" />
                          What you asked
                        </div>
                        <div className="mt-3 text-[15px] leading-relaxed text-zinc-200 sm:text-[16px]">{memoryEntry.prompt}</div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <Sparkles className="h-4 w-4 text-zinc-300" />
                          Atlas answer
                        </div>
                        <div className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-zinc-200 sm:text-[16px]">
                          {memoryEntry.answer}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="text-base font-semibold text-zinc-100">Quick read</div>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {quickReadItems.length ? (
                            quickReadItems.map((item) => (
                              <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{item.label}</div>
                                <div className="mt-2 text-[14px] leading-relaxed text-zinc-200">{item.value}</div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-zinc-500">
                              No structured notes were stored for this memory.
                            </div>
                          )}
                        </div>
                      </div>

                      {memoryEntry.decision_artifact || memoryEntry.portfolio_twin ? (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          {memoryEntry.decision_artifact ? (
                            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4 backdrop-blur-md">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-amber-100/85">Best next move</div>
                              <div className="mt-2 text-base font-semibold text-zinc-100">{memoryEntry.decision_artifact.title}</div>
                              <div className="mt-2 text-[14px] leading-relaxed text-zinc-200">
                                {memoryEntry.decision_artifact.executive_call}
                              </div>
                              <div className="mt-3 space-y-2">
                                {(memoryEntry.decision_artifact.action_checklist || []).slice(0, 4).map((item, index) => (
                                  <div key={`memory-action-${index}`} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-zinc-200">
                                    {index + 1}. {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {memoryEntry.portfolio_twin ? (
                            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 backdrop-blur-md">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/85">Portfolio angle</div>
                              <div className="mt-2 text-base font-semibold text-zinc-100">{memoryEntry.portfolio_twin.label}</div>
                              <div className="mt-1 text-[13px] text-zinc-300">
                                {memoryEntry.portfolio_twin.institution_type} | {memoryEntry.portfolio_twin.objective || memoryEntry.portfolio_twin.mandate}
                              </div>
                              <div className="mt-3 text-[14px] leading-relaxed text-zinc-200">{memoryEntry.portfolio_twin.summary}</div>
                              <div className="mt-3 grid grid-cols-1 gap-3">
                                <div className="rounded-xl border border-rose-300/18 bg-rose-300/[0.08] p-3 text-[13px] text-zinc-200">
                                  <span className="font-semibold text-zinc-100">Main risk:</span> {memoryEntry.portfolio_twin.primary_risk}
                                </div>
                                <div className="rounded-xl border border-cyan-300/18 bg-cyan-300/[0.08] p-3 text-[13px] text-zinc-200">
                                  <span className="font-semibold text-zinc-100">Main opportunity:</span> {memoryEntry.portfolio_twin.primary_opportunity}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-5">
                      {memoryEntry.memory_recall ? (
                        <div className="rounded-2xl border border-violet-300/18 bg-violet-300/[0.08] p-4 backdrop-blur-md">
                          <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                            <BrainCircuit className="h-4 w-4 text-violet-100" />
                            What it reminded Atlas of
                          </div>
                          <div className="mt-3 text-[14px] leading-relaxed text-zinc-200">{memoryEntry.memory_recall.summary}</div>
                          <div className="mt-2 text-[13px] leading-relaxed text-zinc-300">{memoryEntry.memory_recall.regime_signal}</div>
                          <div className="mt-3 space-y-2">
                            {(memoryEntry.memory_recall.matches || []).length ? (
                              (memoryEntry.memory_recall.matches || []).slice(0, 4).map((item) => (
                                <div key={item.entry_id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                                  <div className="text-[13px] font-semibold text-zinc-100">{item.heading}</div>
                                  <div className="mt-1 text-[11px] text-zinc-500">
                                    {item.theme_label} | {formatMemoryTime(item.created_at)}
                                  </div>
                                  <div className="mt-2 text-[13px] leading-relaxed text-zinc-300">{item.why_relevant}</div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-zinc-400">
                                No similar memories were stored for this entry.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-white/10 bg-black/38 p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                          <Link2 className="h-4 w-4 text-zinc-300" />
                          Sources used
                        </div>
                        <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                          {(memoryEntry.sources || []).length ? (
                            (memoryEntry.sources || []).map((source) => (
                              <a
                                key={source.article_id}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3 transition hover:border-white/20 hover:bg-white/[0.06]"
                              >
                                <div className="text-[15px] font-medium text-zinc-100">{source.title}</div>
                                <div className="mt-1 text-[13px] text-zinc-500">
                                  {source.source} | {formatMemoryTime(source.published_at)}
                                </div>
                                <div className="mt-2 text-[13px] leading-relaxed text-zinc-300">{source.summary || source.reason}</div>
                              </a>
                            ))
                          ) : (
                            <div className="text-sm text-zinc-500">No linked sources were stored for this memory.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-zinc-500">
                  {isLoadingEntry ? "Loading memory entry..." : "Select a memory on the left to reopen the saved conversation."}
                </div>
              )}
            </div>
          </SurfaceCard>
        </motion.section>

        {isLoadingHistory ? <div className="text-xs text-zinc-500">Loading memory history...</div> : null}
        {isHistoryError ? <div className="text-xs text-rose-300">{describeApiError(historyError, "Could not load memory history.")}</div> : null}
        {isEntryError ? <div className="text-xs text-rose-300">{describeApiError(entryError, "Could not load this memory.")}</div> : null}
      </div>
    </div>
  );
}
