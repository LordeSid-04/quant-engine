import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function toneFromScore(score) {
  const value = Number(score || 0);
  if (value >= 75) return "#f4f4f5";
  if (value >= 55) return "#d4d4d8";
  return "#a1a1aa";
}

export default function RadialRiskChart({ categories = [] }) {
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

  const polygonPoints = categories
    .map((risk) => {
      const radius = (risk.score / 100) * maxRadius;
      const point = getPoint(risk.angle, radius);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <div className="relative">
      {categories.length > 0 ? (
        <svg viewBox="0 0 100 100" className="mx-auto w-full max-w-[620px]" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="risk-glow">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0.25, 0.5, 0.75, 1].map((scale, i) => (
            <circle key={i} cx={centerX} cy={centerY} r={maxRadius * scale} fill="none" stroke="#3f3f46" strokeWidth="0.16" opacity="0.62" />
          ))}

          {categories.map((risk) => {
            const end = getPoint(risk.angle, maxRadius);
            return <line key={risk.id} x1={centerX} y1={centerY} x2={end.x} y2={end.y} stroke="#3f3f46" strokeWidth="0.16" opacity="0.56" />;
          })}

          <polygon points={polygonPoints} fill="rgba(255, 255, 255, 0.1)" stroke="#f4f4f5" strokeWidth="0.25" opacity="0.75" />

          <g style={{ transformOrigin: "50px 50px", animation: "radar-spin 10s linear infinite" }}>
            <line x1={centerX} y1={centerY} x2={centerX} y2={centerY - maxRadius} stroke="#e4e4e7" strokeWidth="0.2" opacity="0.35" />
            <circle cx={centerX} cy={centerY - maxRadius} r="0.5" fill="#f4f4f5" opacity="0.5" />
          </g>

          {categories.map((risk) => {
            const radius = (risk.score / 100) * maxRadius;
            const point = getPoint(risk.angle, radius);
            const labelPoint = getPoint(risk.angle, maxRadius + 5);
            const isActive = hoveredRisk === risk.id || selectedRisk === risk.id;
            const tone = toneFromScore(risk.score);

            return (
              <g
                key={risk.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRisk(risk.id)}
                onMouseLeave={() => setHoveredRisk(null)}
                onClick={() => setSelectedRisk(selectedRisk === risk.id ? null : risk.id)}
              >
                <circle cx={point.x} cy={point.y} r={isActive ? 3.5 : 2} fill={tone} opacity={isActive ? 0.16 : 0.08} style={{ transition: "all 0.3s" }} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 2 : 1.2}
                  fill={tone}
                  opacity={isActive ? 0.95 : 0.68}
                  filter="url(#risk-glow)"
                  style={{ transition: "all 0.3s" }}
                />
                <circle cx={point.x} cy={point.y} r="0.4" fill="white" opacity="0.86" />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isActive ? "#f4f4f5" : "#71717a"}
                  fontSize="1.8"
                  fontWeight="600"
                  style={{ transition: "all 0.3s" }}
                >
                  {risk.label}
                </text>
                <text x={labelPoint.x} y={labelPoint.y + 2.2} textAnchor="middle" fill={tone} fontSize="1.8" fontWeight="bold" opacity={isActive ? 1 : 0.64}>
                  {risk.score}
                </text>
              </g>
            );
          })}

          <circle cx={centerX} cy={centerY} r="1" fill="#f4f4f5" opacity="0.62" />
          <circle cx={centerX} cy={centerY} r="0.3" fill="white" opacity="0.96" />
        </svg>
      ) : null}

      {categories.length === 0 ? <div className="flex h-[320px] items-center justify-center text-sm text-zinc-500">Loading risk architecture...</div> : null}

      <AnimatePresence>
        {selectedRisk ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="atlas-surface mt-4 rounded-xl p-4">
            {(() => {
              const risk = categories.find((r) => r.id === selectedRisk);
              if (!risk) return null;
              const tone = toneFromScore(risk.score);
              return (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone }} />
                    <span className="text-sm font-semibold text-zinc-100">{risk.label}</span>
                    <span className="ml-auto text-sm font-bold" style={{ color: tone }}>
                      {risk.score}/100
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-400">{risk.description}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${risk.score}%` }} className="h-full rounded-full bg-gradient-to-r from-zinc-500 to-zinc-100" />
                  </div>
                </div>
              );
            })()}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
