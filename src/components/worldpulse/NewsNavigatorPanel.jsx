import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, FileUp, Loader2, Send, Sparkles } from "lucide-react";
import { runNewsNavigator } from "@/api/atlasClient";

const HORIZON_OPTIONS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function HighlightedNarrative({ text, highlights }) {
  const highlightMap = useMemo(() => {
    const map = new Map();
    (highlights || []).forEach((item) => {
      const key = String(item.term || "").toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, item);
      }
    });
    return map;
  }, [highlights]);

  const tokens = useMemo(() => {
    return Array.from(highlightMap.keys()).sort((a, b) => b.length - a.length);
  }, [highlightMap]);

  if (!tokens.length || !text) {
    return <div className="text-sm leading-relaxed text-zinc-200 whitespace-pre-line">{text || "No response yet."}</div>;
  }

  const regex = new RegExp(`(${tokens.map((token) => escapeRegex(token)).join("|")})`, "gi");
  const parts = String(text).split(regex);

  return (
    <div className="text-sm leading-relaxed text-zinc-200 whitespace-pre-line">
      {parts.map((part, index) => {
        const key = part.toLowerCase();
        const meta = highlightMap.get(key);
        if (!meta) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }
        return (
          <span key={`${part}-${index}`} className="group relative mx-[1px] rounded-sm bg-emerald-300/18 px-[2px] text-zinc-100">
            {part}
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-[min(320px,70vw)] rounded-xl border border-emerald-200/35 bg-black/92 p-2.5 text-[11px] leading-relaxed text-zinc-200 shadow-[0_16px_34px_rgba(0,0,0,0.45)] group-hover:block">
              <span className="block text-[10px] uppercase tracking-[0.1em] text-emerald-200/90">Why Highlighted</span>
              <span>{meta.explanation}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function insightStateLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("hot")) return "Heating";
  if (normalized.includes("warm")) return "Warming";
  if (normalized.includes("cool")) return "Cooling";
  if (normalized.includes("cold")) return "Cooling";
  return "Stable";
}

export default function NewsNavigatorPanel() {
  const [horizon, setHorizon] = useState("daily");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState("");

  const handleFileChange = (event) => {
    const selected = Array.from(event.target.files || []).slice(0, 4);
    setFiles(selected);
  };

  const buildAttachments = async () => {
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
  };

  const handleRun = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Enter a prompt to run News Navigator.");
      return;
    }

    setIsRunning(true);
    setError("");
    try {
      const attachments = await buildAttachments();
      const payload = await runNewsNavigator({
        prompt: trimmedPrompt,
        horizon,
        attachments,
      });
      setResult(payload);
    } catch (runError) {
      setError(runError?.message || "Failed to run News Navigator.");
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    const firstThemeId = result?.theme_insights?.[0]?.theme_id || "";
    setSelectedThemeId(firstThemeId);
  }, [result]);

  const activeThemeInsight = useMemo(() => {
    const insights = result?.theme_insights || [];
    if (!insights.length) return null;
    return insights.find((item) => item.theme_id === selectedThemeId) || insights[0];
  }, [result, selectedThemeId]);

  return (
    <section className="rounded-2xl border border-white/12 bg-black/38 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300">
            <Sparkles className="h-3.5 w-3.5" />
            Shazam For News
          </div>
          <h3 className="mt-2 text-lg font-semibold text-zinc-100">News Navigator</h3>
          <p className="mt-1 text-xs text-zinc-400">
            Ask about any macro topic, upload supporting files, and get source-backed intelligence with theme heat mapping.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Example: What does a hotter US inflation print imply for Fed path, US rates volatility, and spillover into Asia equities over the next week?"
            className="atlas-focus-ring min-h-[118px] w-full resize-y rounded-xl border border-white/15 bg-black/35 p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/12 bg-black/28 p-3">
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

          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="atlas-focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/28 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.11em] text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isRunning ? "Analyzing..." : "Run Navigator"}
          </button>
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
            <div className="rounded-xl border border-white/12 bg-black/35 p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-zinc-500">
                <BrainCircuit className="h-3.5 w-3.5" />
                Navigator Brief
              </div>
              <HighlightedNarrative text={result.answer} highlights={result.highlights || []} />
            </div>

            <div className="rounded-xl border border-white/12 bg-black/28 p-3">
              <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">Why This Matters</div>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-200">
                <p>{result.importance_analysis}</p>
                <p>
                  <span className="font-semibold text-zinc-100">Local impact:</span> {result.local_impact_analysis}
                </p>
                <p>
                  <span className="font-semibold text-zinc-100">Global impact:</span> {result.global_impact_analysis}
                </p>
                <p>
                  <span className="font-semibold text-zinc-100">Emerging theme view:</span> {result.emerging_theme_analysis}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">Theme Interpretation</div>
                  <select
                    value={activeThemeInsight?.theme_id || ""}
                    onChange={(event) => setSelectedThemeId(event.target.value)}
                    className="atlas-focus-ring rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[11px] text-zinc-200"
                  >
                    {(result.theme_insights || []).map((insight) => (
                      <option key={insight.theme_id} value={insight.theme_id}>
                        {insight.label}
                      </option>
                    ))}
                  </select>
                </div>

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

                <div className="mt-2 text-[10px] text-zinc-500">Saved to Memory Vault entry: {result.memory_entry_id}</div>
              </div>

              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-[10px] uppercase tracking-[0.11em] text-zinc-500">Verified Source Articles</div>
                <div className="mt-2 max-h-[242px] space-y-2 overflow-auto pr-1">
                  {(result.sources || []).map((source) => (
                    <a
                      key={source.article_id}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-white/10 bg-white/[0.04] p-2.5 transition hover:border-white/25 hover:bg-white/[0.07]"
                    >
                      <div className="text-[11px] text-zinc-100">{source.title}</div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {source.source}
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-400">{source.reason}</div>
                    </a>
                  ))}
                </div>
              </div>
            </div>

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
