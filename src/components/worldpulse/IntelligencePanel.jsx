import React from "react";
import { motion } from "framer-motion";
import { X, Play, Clock, ShieldAlert, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const ASSET_ICONS = {
  "+": <TrendingUp className="w-3 h-3 text-emerald-400" />,
  "↑": <TrendingUp className="w-3 h-3 text-amber-400" />,
  "↓": <TrendingDown className="w-3 h-3 text-cyan-400" />,
};

export default function IntelligencePanel({ region, onClose }) {
  if (!region) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute top-4 right-4 bottom-4 w-[400px] max-w-[calc(100%-2rem)] z-40 overflow-hidden"
    >
      <div className="atlas-glass-strong rounded-2xl h-full flex flex-col overflow-hidden border border-cyan-500/20 shadow-[0_0_40px_rgba(34,211,238,0.16)]">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center glow-node-fast"
                style={{ backgroundColor: `${region.color}20`, border: `1px solid ${region.color}40` }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: region.color, boxShadow: `0 0 12px ${region.color}` }} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{region.name}</h2>
                <span className="text-xs text-slate-400">Intelligence Briefing</span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Heat & Confidence */}
          <div className="flex gap-4 mt-4">
            <div className="flex-1 rounded-lg bg-white/[0.04] p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Heat Score</div>
              <div className="text-2xl font-bold" style={{ color: region.color }}>{region.heat}</div>
              <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${region.heat}%`, backgroundColor: region.color }} />
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-white/[0.04] p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Confidence</div>
              <div className="text-2xl font-bold text-slate-200">{region.confidence}%</div>
              <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-slate-400 transition-all duration-1000" style={{ width: `${region.confidence}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Regime Summary */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Macro Regime</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{region.regime}</p>
          </div>

          {/* Active Narratives */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Active Narratives</h3>
            <div className="flex flex-wrap gap-2">
              {region.narratives.map((n, i) => (
                <Badge key={i} variant="outline" className="border-cyan-500/20 text-cyan-300 bg-cyan-500/5 text-xs">
                  {n}
                </Badge>
              ))}
            </div>
          </div>

          {/* Key Risks */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Key Risks</h3>
            <div className="space-y-2">
              {region.risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-300">{risk}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Asset Classes */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Affected Asset Classes</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {Object.entries(region.assets).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.03]">
                  <span className="text-xs text-slate-400 capitalize">{key}</span>
                  <span className="text-xs font-medium text-slate-200">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-white/[0.06] space-y-2">
          <Link to={createPageUrl("ScenarioLab") + `?region=${region.id}`}>
            <Button className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-300 text-sm gap-2">
              <Play className="w-3.5 h-3.5" /> Run Scenario
            </Button>
          </Link>
          <div className="flex gap-2">
            <Link to={createPageUrl("HistoricalAtlas")} className="flex-1">
              <Button variant="ghost" className="w-full text-slate-400 hover:text-white text-xs gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Historical Analogues
              </Button>
            </Link>
            <Link to={createPageUrl("RiskRadar")} className="flex-1">
              <Button variant="ghost" className="w-full text-slate-400 hover:text-white text-xs gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Risk Radar
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}