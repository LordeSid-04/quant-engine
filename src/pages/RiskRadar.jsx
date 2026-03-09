import React from "react";
import { ShieldAlert } from "lucide-react";
import RadialRiskChart from "../components/radar/RadialRiskChart";
import RiskSummaryCards from "../components/radar/RiskSummaryCards";

export default function RiskRadar() {
  return (
    <div className="min-h-[calc(100vh-96px)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-600/20 border border-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Risk Radar</h1>
            <p className="text-xs text-slate-500">Global macro risk architecture — real-time threat assessment</p>
          </div>
        </div>

        <RiskSummaryCards />

        <div className="atlas-glass-strong rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Radial Risk Architecture</h2>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Click nodes for detail</span>
          </div>
          <RadialRiskChart />
        </div>

        {/* Footer insight */}
        <div className="atlas-glass rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Risk Assessment Summary</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Elevated policy risk driven by Fed-ECB divergence and BOJ normalization. Inflation risk remains above historical mean 
              due to sticky services components. Contagion pathways are active through carry trade positioning and EM dollar debt. 
              Volatility appears suppressed but tail hedging is underpriced relative to the current macro regime complexity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}