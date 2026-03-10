import React from "react";
import { motion } from "framer-motion";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export default function RiskSummaryCards({ items = [] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="atlas-surface rounded-xl p-4"
        >
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">{item.label}</div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-zinc-100">{item.value}</span>
            <div className="flex items-center gap-1">
              {item.trend === "up" ? (
                <TrendingUp className="h-3 w-3 text-rose-300" />
              ) : item.trend === "down" ? (
                <TrendingDown className="h-3 w-3 text-emerald-300" />
              ) : (
                <Minus className="h-3 w-3 text-zinc-500" />
              )}
              <span
                className={`text-xs font-medium ${
                  item.trend === "up" ? "text-rose-300" : item.trend === "down" ? "text-emerald-300" : "text-zinc-500"
                }`}
              >
                {item.change}
              </span>
            </div>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${item.value}%` }}
              transition={{ duration: 1, delay: i * 0.12 }}
              className="h-full rounded-full bg-gradient-to-r from-zinc-500 to-zinc-100"
            />
          </div>
        </motion.div>
      ))}

      {items.length === 0 ? <div className="col-span-2 text-sm text-zinc-500 lg:col-span-4">Loading risk summary...</div> : null}
    </div>
  );
}
