import React from "react";
import { Activity, Zap, Globe } from "lucide-react";

export default function WorldPulseHeader() {
  return (
    <div className="px-4 sm:px-6 py-4 md:py-5 flex items-center justify-between bg-transparent border-b border-white/[0.06]">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5">
          <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
          <h1 className="text-2xl sm:text-[30px] leading-none font-semibold tracking-tight atlas-title-gradient">World Pulse</h1>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-400 glow-node-fast" />
          <span className="text-xs text-emerald-400 font-medium tracking-wide">LIVE</span>
        </div>
      </div>
      <div className="hidden lg:flex items-center gap-5 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span>6 Regions Active</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>6 Transmission Arcs</span>
        </div>
      </div>
    </div>
  );
}