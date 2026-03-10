import React, { useEffect, useMemo, useRef } from "react";
import { TerminalSquare } from "lucide-react";

const STAGE_COLORS = {
  validation: "text-zinc-200",
  baseline: "text-zinc-200",
  shock_injection: "text-zinc-100",
  propagation: "text-zinc-100",
  spillover_adjustment: "text-zinc-200",
  asset_mapping: "text-zinc-200",
  confidence: "text-zinc-100",
  finalization: "text-zinc-100",
};

function toTerminalLine(log) {
  const stage = String(log.stage || "stage").replaceAll("_", "-");
  return `[step ${log.step}] ${stage} :: ${log.message}`;
}

export default function SimulationLog({ logs, isRunning }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, isRunning]);

  const terminalLines = useMemo(() => logs.map((log, index) => ({ ...log, __index: index, line: toTerminalLine(log) })), [logs]);
  const latest = terminalLines[terminalLines.length - 1];

  return (
    <div className="atlas-surface overflow-hidden rounded-2xl border border-white/12 shadow-[0_14px_34px_rgba(0,0,0,0.34)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-white/[0.06] to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare className={`h-4 w-4 ${isRunning ? "animate-pulse text-zinc-100" : "text-zinc-500"}`} />
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Simulation Terminal</h3>
        </div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">pipeline-terminal</div>
      </div>

      <div ref={scrollRef} className="relative h-52 overflow-y-auto bg-black/38 px-4 py-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-70" />
        {terminalLines.map((log) => (
          <div key={`${log.step}-${log.stage}-${log.__index}`} className="mb-2 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
            <div className={`break-words text-[12px] leading-relaxed ${STAGE_COLORS[log.stage] || "text-zinc-200"}`}>
              <span className="mr-1 text-zinc-500">&gt;</span>
              {log.line}
            </div>
            {log.details && Object.keys(log.details).length > 0 ? (
              <div className="mt-1 ml-4 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-400">
                {Object.entries(log.details)
                  .slice(0, 4)
                  .map(([key, value]) => (
                    <span key={`${log.__index}-${key}`} className="break-all">
                      {key}={String(value)}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>
        ))}

        {isRunning ? (
          <div className="flex items-center gap-1 text-[12px] text-zinc-200">
            <span className="text-zinc-500">&gt;</span>
            awaiting next signal event
            <span className="inline-block h-4 w-2 animate-pulse bg-zinc-300" />
          </div>
        ) : null}

        {!isRunning && !terminalLines.length ? (
          <div className="text-[12px] text-zinc-500">
            <span className="mr-1 text-zinc-600">&gt;</span>run a scenario to stream simulation execution logs
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-black/22 px-4 py-2 text-[10px] text-zinc-500">
        status: {isRunning ? "streaming" : "ready"} | lines: {terminalLines.length} | latest: {latest?.stage || "none"}
      </div>
    </div>
  );
}
