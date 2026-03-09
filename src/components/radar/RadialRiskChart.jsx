import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RISK_CATEGORIES = [
  { id: "inflation", label: "Inflation Risk", score: 78, color: "#f97316", angle: 0, description: "Sticky services inflation in US, energy price volatility in Europe, food price pressures in EM." },
  { id: "growth", label: "Growth Risk", score: 55, color: "#22d3ee", angle: 60, description: "US resilient on AI capex, Europe stagnating, China deflating. Global manufacturing PMIs weakening." },
  { id: "policy", label: "Policy Risk", score: 82, color: "#a78bfa", angle: 120, description: "Fed-ECB divergence widening, BOJ normalization risk, fiscal dominance concerns in developed markets." },
  { id: "volatility", label: "Volatility Risk", score: 67, color: "#fbbf24", angle: 180, description: "VIX compressed but skew elevated. Gamma exposure concentrated. Tail risk underpriced." },
  { id: "liquidity", label: "Liquidity Stress", score: 48, color: "#34d399", angle: 240, description: "QT ongoing but at slower pace. Repo markets stable. Money market fund balances at records." },
  { id: "contagion", label: "Contagion", score: 71, color: "#f472b6", angle: 300, description: "Carry trade crowding, EM dollar debt vulnerability, China property sector linkages to global banks." },
];

export default function RadialRiskChart() {
  const [hoveredRisk, setHoveredRisk] = useState(null);
  const [selectedRisk, setSelectedRisk] = useState(null);

  const centerX = 50;
  const centerY = 50;
  const maxRadius = 38;

  const getPoint = (angle, radius) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return {
      x: centerX + radius * Math.cos(rad),
      y: centerY + radius * Math.sin(rad),
    };
  };

  const polygonPoints = RISK_CATEGORIES.map(r => {
    const radius = (r.score / 100) * maxRadius;
    const point = getPoint(r.angle, radius);
    return `${point.x},${point.y}`;
  }).join(" ");

  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" className="w-full max-w-[600px] mx-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
          <filter id="risk-glow">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circles */}
        {[0.25, 0.5, 0.75, 1].map((scale, i) => (
          <circle
            key={i}
            cx={centerX} cy={centerY}
            r={maxRadius * scale}
            fill="none"
            stroke="#1e293b"
            strokeWidth="0.15"
            opacity="0.6"
          />
        ))}

        {/* Axis lines */}
        {RISK_CATEGORIES.map((risk) => {
          const end = getPoint(risk.angle, maxRadius);
          return (
            <line
              key={risk.id}
              x1={centerX} y1={centerY}
              x2={end.x} y2={end.y}
              stroke="#1e293b"
              strokeWidth="0.15"
              opacity="0.5"
            />
          );
        })}

        {/* Risk polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(56, 189, 248, 0.08)"
          stroke="#38bdf8"
          strokeWidth="0.25"
          opacity="0.6"
        />

        {/* Scanning line */}
        <g style={{ transformOrigin: '50px 50px', animation: 'radar-spin 8s linear infinite' }}>
          <line
            x1={centerX} y1={centerY}
            x2={centerX} y2={centerY - maxRadius}
            stroke="#38bdf8"
            strokeWidth="0.2"
            opacity="0.3"
          />
          <circle cx={centerX} cy={centerY - maxRadius} r="0.5" fill="#38bdf8" opacity="0.5" />
        </g>

        {/* Risk nodes */}
        {RISK_CATEGORIES.map((risk) => {
          const radius = (risk.score / 100) * maxRadius;
          const point = getPoint(risk.angle, radius);
          const labelPoint = getPoint(risk.angle, maxRadius + 5);
          const isActive = hoveredRisk === risk.id || selectedRisk === risk.id;

          return (
            <g
              key={risk.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredRisk(risk.id)}
              onMouseLeave={() => setHoveredRisk(null)}
              onClick={() => setSelectedRisk(selectedRisk === risk.id ? null : risk.id)}
            >
              {/* Glow */}
              <circle
                cx={point.x} cy={point.y}
                r={isActive ? 3.5 : 2}
                fill={risk.color}
                opacity={isActive ? 0.15 : 0.05}
                style={{ transition: "all 0.3s" }}
              />
              {/* Node */}
              <circle
                cx={point.x} cy={point.y}
                r={isActive ? 2 : 1.2}
                fill={risk.color}
                opacity={isActive ? 0.9 : 0.6}
                filter="url(#risk-glow)"
                style={{ transition: "all 0.3s" }}
              />
              <circle
                cx={point.x} cy={point.y}
                r="0.4"
                fill="white"
                opacity="0.8"
              />
              {/* Label */}
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isActive ? risk.color : "#64748b"}
                fontSize="1.8"
                fontWeight="600"
                style={{ transition: "all 0.3s" }}
              >
                {risk.label}
              </text>
              <text
                x={labelPoint.x}
                y={labelPoint.y + 2.2}
                textAnchor="middle"
                fill={risk.color}
                fontSize="1.8"
                fontWeight="bold"
                opacity={isActive ? 1 : 0.6}
              >
                {risk.score}
              </text>
            </g>
          );
        })}

        {/* Center */}
        <circle cx={centerX} cy={centerY} r="1" fill="#38bdf8" opacity="0.5" />
        <circle cx={centerX} cy={centerY} r="0.3" fill="white" opacity="0.9" />
      </svg>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedRisk && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 atlas-glass rounded-xl p-4"
          >
            {(() => {
              const risk = RISK_CATEGORIES.find(r => r.id === selectedRisk);
              return (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: risk.color }} />
                    <span className="text-sm font-semibold text-white">{risk.label}</span>
                    <span className="text-sm font-bold ml-auto" style={{ color: risk.color }}>{risk.score}/100</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{risk.description}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${risk.score}%` }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: risk.color }}
                    />
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}