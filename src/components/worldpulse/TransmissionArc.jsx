import React from "react";

export default function TransmissionArc({ x1, y1, x2, y2, color, delay }) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - 8;
  const path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;

  return (
    <g>
      {/* Shadow arc */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="0.15"
        opacity="0.08"
      />
      {/* Animated arc */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="0.2"
        opacity="0.4"
        strokeDasharray="2 4"
        strokeLinecap="round"
        style={{
          animation: `arc-flow 4s ease-in-out ${delay}s infinite`,
        }}
      />
      {/* Particle dot traveling along arc */}
      <circle r="0.4" fill={color} opacity="0.8" filter="url(#glow)">
        <animateMotion
          dur={`${3 + delay * 0.5}s`}
          repeatCount="indefinite"
          begin={`${delay}s`}
          path={path}
        />
      </circle>
    </g>
  );
}