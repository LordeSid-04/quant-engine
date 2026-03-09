import React from "react";

export default function HotspotNode({ spot, isHovered, onHover, onLeave, onClick }) {
  const baseRadius = 1.2 + (spot.heat / 100) * 1.2;
  const glowRadius = baseRadius * 2.5;

  return (
    <g
      className="hotspot-interactive cursor-pointer"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Outer glow */}
      <circle
        cx={spot.x}
        cy={spot.y}
        r={glowRadius}
        fill={spot.color}
        opacity={isHovered ? 0.15 : 0.06}
        style={{ transition: 'opacity 0.3s, r 0.3s' }}
      />

      {/* Heat ring */}
      <circle
        cx={spot.x}
        cy={spot.y}
        r={baseRadius * 1.6}
        fill="none"
        stroke={spot.color}
        strokeWidth="0.12"
        opacity={0.3}
        className="glow-node"
        style={{ animationDelay: `${Math.random() * 2}s` }}
      />

      {/* Core node */}
      <circle
        cx={spot.x}
        cy={spot.y}
        r={baseRadius}
        fill={spot.color}
        opacity={isHovered ? 0.9 : 0.6}
        filter="url(#glow)"
        style={{ transition: 'opacity 0.3s' }}
      />

      {/* Center bright point */}
      <circle
        cx={spot.x}
        cy={spot.y}
        r={baseRadius * 0.35}
        fill="white"
        opacity={isHovered ? 0.9 : 0.7}
      />

      {/* Label */}
      <text
        x={spot.x}
        y={spot.y - baseRadius - 1.5}
        textAnchor="middle"
        fill={spot.color}
        fontSize="1.6"
        fontWeight="600"
        opacity={isHovered ? 1 : 0.7}
        style={{ transition: 'opacity 0.3s' }}
      >
        {spot.name}
      </text>
      <text
        x={spot.x}
        y={spot.y - baseRadius - 0.2}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="1"
        opacity={isHovered ? 0.9 : 0.5}
      >
        {spot.narrative}
      </text>
    </g>
  );
}