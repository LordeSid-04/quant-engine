import React, { useMemo } from "react";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function KeywordHighlighter({
  text,
  highlights = [],
  className = "",
  emptyText = "No data available.",
  tooltipLabel = "Keyword Context",
}) {
  const content = String(text || "");

  const highlightMap = useMemo(() => {
    const map = new Map();
    (highlights || []).forEach((item) => {
      const term = String(item?.term || "").trim();
      if (!term) return;
      const key = term.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          term,
          explanation: String(item?.explanation || "This term drives the live macro interpretation."),
        });
      }
    });
    return map;
  }, [highlights]);

  const tokens = useMemo(
    () =>
      Array.from(highlightMap.keys())
        .filter((term) => term.length >= 3)
        .sort((a, b) => b.length - a.length),
    [highlightMap],
  );

  if (!content) {
    return <div className={className}>{emptyText}</div>;
  }

  if (!tokens.length) {
    return <div className={className}>{content}</div>;
  }

  const regex = new RegExp(`(${tokens.map((token) => escapeRegex(token)).join("|")})`, "gi");
  const parts = content.split(regex);

  return (
    <div className={className}>
      {parts.map((part, index) => {
        const key = part.toLowerCase();
        const meta = highlightMap.get(key);
        if (!meta) {
          return <span key={`plain-${index}`}>{part}</span>;
        }

        return (
          <span key={`highlight-${index}`} className="group relative mx-[1px]">
            <span className="rounded-sm bg-cyan-300/16 px-[2px] font-semibold text-cyan-100 underline decoration-cyan-300 decoration-2 underline-offset-2">
              {part}
            </span>
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-[min(330px,72vw)] rounded-xl border border-cyan-200/40 bg-black/95 p-2.5 text-[11px] leading-relaxed text-zinc-200 shadow-[0_16px_36px_rgba(0,0,0,0.48)] group-hover:block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-cyan-200">{tooltipLabel}</span>
              <span>{meta.explanation}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
