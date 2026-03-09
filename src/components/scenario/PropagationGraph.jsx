import React, { useEffect, useState } from "react";

const SCENARIO_NODES = [
  { id: "origin", label: "Origin Shock", x: 50, y: 15, color: "#f97316" },
  { id: "rates", label: "Rates", x: 25, y: 35, color: "#38bdf8" },
  { id: "fx", label: "FX Markets", x: 75, y: 35, color: "#22d3ee" },
  { id: "equities", label: "Equities", x: 15, y: 58, color: "#34d399" },
  { id: "commodities", label: "Commodities", x: 50, y: 50, color: "#fbbf24" },
  { id: "credit", label: "Credit", x: 85, y: 58, color: "#a78bfa" },
  { id: "em", label: "EM Contagion", x: 30, y: 78, color: "#f472b6" },
  { id: "volatility", label: "Volatility", x: 70, y: 78, color: "#fb923c" },
];

const SCENARIO_EDGES = [
  { from: "origin", to: "rates" },
  { from: "origin", to: "fx" },
  { from: "origin", to: "commodities" },
  { from: "rates", to: "equities" },
  { from: "rates", to: "credit" },
  { from: "fx", to: "credit" },
  { from: "fx", to: "em" },
  { from: "commodities", to: "em" },
  { from: "commodities", to: "volatility" },
  { from: "equities", to: "volatility" },
  { from: "credit", to: "volatility" },
];

export default function PropagationGraph({ isRunning, results }) {
  const [activeNodes, setActiveNodes] = useState(new Set());
  const [activeEdges, setActiveEdges] = useState(new Set());

  useEffect(() => {
    if (!isRunning) {
      setActiveNodes(new Set());
      setActiveEdges(new Set());
      return;
    }

    setActiveNodes(new Set(["origin"]));
    const nodeOrder = ["rates", "fx", "commodities", "equities", "credit", "em", "volatility"];
    const edgeOrder = SCENARIO_EDGES.map((_, i) => i);

    nodeOrder.forEach((nodeId, i) => {
      setTimeout(() => {
        setActiveNodes(prev => new Set([...prev, nodeId]));
      }, (i + 1) * 400);
    });

    edgeOrder.forEach((edgeIdx, i) => {
      setTimeout(() => {
        setActiveEdges(prev => new Set([...prev, edgeIdx]));
      }, i * 350 + 200);
    });
  }, [isRunning]);

  const getNode = (id) => SCENARIO_NODES.find(n => n.id === id);

  return (
    <div className="atlas-glass-strong rounded-2xl p-5 h-full flex flex-col">
      <h2 className="text-sm font-semibold text-white tracking-tight mb-4">Causal Propagation Network</h2>
      
      <div className="flex-1 relative">
        <svg viewBox="-6 0 112 95" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="node-glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {SCENARIO_EDGES.map((edge, i) => {
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            const isActive = activeEdges.has(i);
            return (
              <g key={i}>
                <line
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  stroke={isActive ? "#38bdf8" : "#1e293b"}
                  strokeWidth={isActive ? "0.4" : "0.2"}
                  opacity={isActive ? 0.6 : 0.3}
                  style={{ transition: "all 0.5s ease" }}
                />
                {isActive && (
                  <circle r="0.6" fill="#38bdf8" opacity="0.9">
                    <animateMotion
                      dur="2s"
                      repeatCount="indefinite"
                      path={`M${from.x},${from.y} L${to.x},${to.y}`}
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {SCENARIO_NODES.map((node) => {
            const isActive = activeNodes.has(node.id);
            return (
              <g key={node.id}>
                {isActive && (
                  <circle
                    cx={node.x} cy={node.y}
                    r="2.2"
                    fill={node.color}
                    opacity="0.12"
                  >
                    <animate attributeName="r" values="1.7;2.4;1.7" dur="2.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.2;0.08;0.2" dur="2.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={node.x} cy={node.y}
                  r={isActive ? "2.3" : "1.7"}
                  fill={isActive ? node.color : "#1e293b"}
                  stroke={node.color}
                  strokeWidth="0.3"
                  opacity={isActive ? 0.9 : 0.3}
                  filter={isActive ? "url(#node-glow)" : undefined}
                  style={{ transition: "all 0.5s ease" }}
                />
                <circle
                  cx={node.x} cy={node.y}
                  r="0.8"
                  fill={isActive ? "white" : node.color}
                  opacity={isActive ? 0.9 : 0.2}
                  style={{ transition: "all 0.5s ease" }}
                />
                <text
                  x={node.x}
                  y={node.y + (node.y < 30 ? -5.5 : 6.5)}
                  textAnchor="middle"
                  fill={isActive ? node.color : "#475569"}
                  fontSize="2.2"
                  fontWeight="600"
                  style={{ transition: "all 0.5s ease" }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {!isRunning && !results && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-slate-600 text-sm">Configure and run a scenario</div>
              <div className="text-slate-700 text-xs mt-1">to visualize propagation</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}