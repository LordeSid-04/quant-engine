import React from "react";
import { Landmark } from "lucide-react";
import TimelineConstellation from "../components/historical/TimelineConstellation";

export default function HistoricalAtlas() {
  return (
    <div className="min-h-[calc(100vh-96px)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/20 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Historical Atlas</h1>
            <p className="text-xs text-slate-500">Explore macro regimes through the constellation of economic history</p>
          </div>
        </div>

        <div className="atlas-glass-strong rounded-2xl overflow-hidden" style={{ minHeight: '600px' }}>
          <TimelineConstellation />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 px-2">
          <span className="text-slate-400 font-medium">Node size = Impact magnitude</span>
          <span>•</span>
          <span>Click a node for detailed regime analysis</span>
          <span>•</span>
          <span>Similarity score shows correlation to current conditions</span>
        </div>
      </div>
    </div>
  );
}