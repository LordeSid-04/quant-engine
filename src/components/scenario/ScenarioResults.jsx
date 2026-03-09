import React from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, AlertTriangle, Minus } from "lucide-react";

const IMPACT_DATA = [
  { asset: "US Equities", impact: -4.2, severity: "high" },
  { asset: "EM Equities", impact: -7.8, severity: "critical" },
  { asset: "10Y Treasury", impact: 0.45, severity: "medium", unit: "bp" },
  { asset: "EUR/USD", impact: -2.1, severity: "medium" },
  { asset: "Crude Oil", impact: 18.5, severity: "high" },
  { asset: "Credit Spreads", impact: 35, severity: "high", unit: "bp" },
  { asset: "VIX", impact: 12.4, severity: "critical" },
  { asset: "Gold", impact: 5.2, severity: "low" },
];

export default function ScenarioResults({ config }) {
  if (!config) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="atlas-glass-strong rounded-2xl p-5"
    >
      <h3 className="text-sm font-semibold text-white mb-1">Impact Assessment</h3>
      <p className="text-xs text-slate-500 mb-4">
        {config.event} → {config.region} at {config.severity}% severity over {config.horizon}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {IMPACT_DATA.map((item, i) => {
          const isPositive = item.impact > 0;
          const severityColors = {
            low: "border-emerald-500/20",
            medium: "border-amber-500/20",
            high: "border-orange-500/20",
            critical: "border-red-500/20",
          };

          return (
            <motion.div
              key={item.asset}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-xl bg-white/[0.03] p-3 border ${severityColors[item.severity]}`}
            >
              <div className="text-[10px] text-slate-500 mb-1 truncate">{item.asset}</div>
              <div className="flex items-center gap-1">
                {item.impact > 1 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : item.impact < -1 ? (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                ) : (
                  <Minus className="w-3 h-3 text-slate-500" />
                )}
                <span className={`text-sm font-bold ${item.impact > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {item.impact > 0 ? "+" : ""}{item.impact}{item.unit === "bp" ? "bp" : "%"}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {item.severity === "critical" && <AlertTriangle className="w-2.5 h-2.5 text-red-400" />}
                <span className={`text-[9px] capitalize ${
                  item.severity === "critical" ? "text-red-400" :
                  item.severity === "high" ? "text-orange-400" :
                  item.severity === "medium" ? "text-amber-400" : "text-emerald-400"
                }`}>{item.severity}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}