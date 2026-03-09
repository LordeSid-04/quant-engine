import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const REGIMES = [
  {
    id: "gfc",
    year: 2008,
    label: "Global Financial Crisis",
    x: 10, y: 50,
    color: "#ef4444",
    size: 4,
    description: "Lehman collapse triggered a global deleveraging cycle. Credit markets froze, equities dropped 50%+, and coordinated central bank action began the era of unconventional monetary policy.",
    drivers: ["Credit contagion", "Bank insolvency", "Housing collapse"],
    assets: "Equities -55%, Credit spreads 600bp+, Gold +25%, USD safe haven bid",
    similarity: 32
  },
  {
    id: "euro",
    year: 2011,
    label: "European Debt Crisis",
    x: 22, y: 35,
    color: "#f97316",
    size: 3,
    description: "Sovereign debt fears in peripheral Europe threatened EMU integrity. ECB's 'whatever it takes' moment became pivotal in modern central banking.",
    drivers: ["Sovereign debt", "Bank-sovereign nexus", "Austerity"],
    assets: "EUR -15%, Peripheral spreads 500bp+, Bunds rally",
    similarity: 28
  },
  {
    id: "taper",
    year: 2013,
    label: "Taper Tantrum",
    x: 35, y: 60,
    color: "#fbbf24",
    size: 2.5,
    description: "Fed hints at tapering QE. EM currencies and bonds sold off sharply. Demonstrated the global dependency on Fed liquidity.",
    drivers: ["Fed policy shift", "EM vulnerability", "USD strength"],
    assets: "EM FX -10%, US 10Y +130bp, EM equities -15%",
    similarity: 58
  },
  {
    id: "china2015",
    year: 2015,
    label: "China Devaluation",
    x: 48, y: 40,
    color: "#22d3ee",
    size: 2.5,
    description: "PBoC devalued CNY, triggering global risk-off. Highlighted China's systemic importance and capital flow dynamics.",
    drivers: ["CNY devaluation", "Capital outflows", "Growth fears"],
    assets: "Global equities -10%, Commodities -20%, VIX spike to 40",
    similarity: 45
  },
  {
    id: "covid",
    year: 2020,
    label: "COVID Shock",
    x: 62, y: 30,
    color: "#a78bfa",
    size: 4.5,
    description: "Fastest bear market in history followed by unprecedented fiscal/monetary stimulus. Reshaped global supply chains and accelerated digitization.",
    drivers: ["Pandemic", "Supply shock", "Fiscal stimulus"],
    assets: "Equities -34% then V-recovery, Rates to zero, Gold +30%",
    similarity: 40
  },
  {
    id: "inflation",
    year: 2022,
    label: "Inflation Surge",
    x: 76, y: 55,
    color: "#f472b6",
    size: 3.5,
    description: "Post-COVID inflation forced aggressive central bank tightening. Bond market experienced worst drawdown in decades. Rate-sensitive sectors repriced violently.",
    drivers: ["Supply-demand imbalance", "Energy crisis", "Rate hikes"],
    assets: "Bonds -20%, Growth stocks -30%, Commodities +30%, USD +15%",
    similarity: 72
  },
  {
    id: "ai",
    year: 2024,
    label: "AI Boom",
    x: 90, y: 42,
    color: "#34d399",
    size: 3,
    description: "Generative AI triggers massive capex cycle. Tech concentration reaches historic levels. Productivity narrative supports equity premium despite tight policy.",
    drivers: ["AI capex", "Tech concentration", "Productivity hope"],
    assets: "Magnificent 7 +80%, Semis rally, Power demand surge",
    similarity: 85
  },
];

const CONNECTIONS = [
  { from: "gfc", to: "euro" },
  { from: "euro", to: "taper" },
  { from: "taper", to: "china2015" },
  { from: "china2015", to: "covid" },
  { from: "covid", to: "inflation" },
  { from: "inflation", to: "ai" },
];

export default function TimelineConstellation() {
  const [selected, setSelected] = useState(null);

  const getNode = (id) => REGIMES.find(r => r.id === id);

  return (
    <div className="relative h-full min-h-[500px]">
      <svg viewBox="-10 0 120 90" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="constellation-glow">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connections */}
        {CONNECTIONS.map((conn, i) => {
          const from = getNode(conn.from);
          const to = getNode(conn.to);
          return (
            <line
              key={i}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="#38bdf8"
              strokeWidth="0.15"
              opacity="0.15"
              strokeDasharray="1 1"
            />
          );
        })}

        {/* Regime nodes */}
        {REGIMES.map((regime) => {
          const isSelected = selected?.id === regime.id;
          const nodeRadius = Math.min(regime.size * 0.62, 2.8);
          const glowRadius = nodeRadius * 1.55;
          return (
            <g key={regime.id} className="cursor-pointer" onClick={() => setSelected(isSelected ? null : regime)}>
              <circle
                cx={regime.x} cy={regime.y}
                r={Math.max(glowRadius * 0.72, 1.6)}
                fill={regime.color}
                opacity={0.1}
              >
                <animate attributeName="r" values={`${Math.max(glowRadius * 0.58, 1.4)};${Math.max(glowRadius * 0.8, 2)};${Math.max(glowRadius * 0.58, 1.4)}`} dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.16;0.06;0.16" dur="2.6s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={regime.x} cy={regime.y}
                r={nodeRadius}
                fill={regime.color}
                opacity={isSelected ? 0.9 : 0.5}
                filter="url(#constellation-glow)"
                style={{ transition: "all 0.3s" }}
              />
              <circle
                cx={regime.x} cy={regime.y}
                r={nodeRadius * 0.32}
                fill="white"
                opacity={0.8}
              />
              <text
                x={regime.x}
                y={regime.y - nodeRadius - 1.6}
                textAnchor="middle"
                fill={regime.color}
                fontSize="2"
                fontWeight="600"
              >
                {regime.label}
              </text>
              <text
                x={regime.x}
                y={regime.y - nodeRadius + 0.1}
                textAnchor="middle"
                fill="#64748b"
                fontSize="1.4"
              >
                {regime.year}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[400px] atlas-glass-strong rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selected.color }} />
                  <h3 className="text-base font-bold text-white">{selected.label}</h3>
                </div>
                <span className="text-xs text-slate-500">{selected.year}</span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-white/10 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-3">{selected.description}</p>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Key Drivers</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selected.drivers.map((d, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-white/10 text-slate-300">{d}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Asset Impact</span>
                <p className="text-xs text-slate-400 mt-1">{selected.assets}</p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Current Similarity</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${selected.similarity}%`, backgroundColor: selected.color }}
                  />
                </div>
                <span className="text-xs font-bold" style={{ color: selected.color }}>{selected.similarity}%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}