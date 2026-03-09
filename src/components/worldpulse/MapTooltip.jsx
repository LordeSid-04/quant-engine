import React from "react";

export default function MapTooltip({ spot, position }) {
  return (
    <div
      className="fixed z-[100] pointer-events-none fade-up"
      style={{
        left: position.x + 16,
        top: position.y - 10,
      }}
    >
      <div className="atlas-glass-strong rounded-xl px-4 py-3 min-w-[200px] shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-2.5 h-2.5 rounded-full glow-node-fast"
            style={{ backgroundColor: spot.color, boxShadow: `0 0 8px ${spot.color}` }}
          />
          <span className="text-sm font-semibold text-white">{spot.name}</span>
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Narrative</span>
            <span className="text-slate-200 font-medium">{spot.narrative}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Heat Score</span>
            <span className="font-semibold" style={{ color: spot.color }}>{spot.heat}/100</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Confidence</span>
            <span className="text-slate-200">{spot.confidence}%</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-slate-500">
          Click for intelligence briefing
        </div>
      </div>
    </div>
  );
}