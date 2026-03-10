import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from "lucide-react";

export default function ScenarioResults({ result }) {
  if (!result) return null;

  const config = result.config;
  const impacts = result.impacts ?? [];
  const maxAbsImpact = Math.max(1, ...impacts.map((item) => Math.abs(Number(item.impact || 0))));

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5">
      <h3 className="mb-1 text-sm font-semibold text-zinc-100">Impact Assessment</h3>
      <p className="mb-1 text-xs text-zinc-500">
        {config.event}
        {" -> "}
        {config.region} at {config.severity}% severity over {config.horizon}
      </p>
      <p className="mb-4 text-xs text-zinc-300">{result.summary}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {impacts.map((item, i) => {
          const severityPills = {
            low: "text-zinc-400",
            medium: "text-zinc-200",
            high: "text-amber-200",
            critical: "text-rose-200",
          };
          const barWidth = Math.max(8, Math.min(100, (Math.abs(item.impact) / maxAbsImpact) * 100));
          const impactTone = item.impact > 0 ? "bg-emerald-300/70" : "bg-rose-300/70";

          return (
            <motion.div
              key={item.asset}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[11px] text-zinc-200">{item.asset}</div>
                <span
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] ${
                    severityPills[item.severity] ?? severityPills.low
                  }`}
                >
                  {item.severity}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-1">
                {item.impact > 1 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-300" />
                ) : item.impact < -1 ? (
                  <TrendingDown className="h-3 w-3 text-rose-300" />
                ) : (
                  <Minus className="h-3 w-3 text-zinc-500" />
                )}

                <span className={`text-sm font-bold ${item.impact > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {item.impact > 0 ? "+" : ""}
                  {item.impact}
                  {item.unit === "bp" ? "bp" : "%"}
                </span>
              </div>

               <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${impactTone}`} style={{ width: `${barWidth}%` }} />
              </div>

              <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                {item.severity === "critical" ? <AlertTriangle className="h-2.5 w-2.5 text-rose-300" /> : null}
                <span className="capitalize">{item.severity} impact tier</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
