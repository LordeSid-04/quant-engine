import React from "react";

const CURRENTS = [
  { path: "M 5,50 Q 20,35 40,40 Q 60,45 80,35 Q 95,28 100,30", color: "#38bdf8", opacity: 0.04 },
  { path: "M 0,60 Q 15,55 35,58 Q 55,62 75,55 Q 90,48 100,52", color: "#22d3ee", opacity: 0.03 },
  { path: "M 10,30 Q 30,25 50,32 Q 70,38 90,30", color: "#fbbf24", opacity: 0.025 },
  { path: "M 0,45 Q 25,50 50,42 Q 75,35 100,40", color: "#a78bfa", opacity: 0.03 },
];

export default function NarrativeCurrents() {
  return (
    <g>
      {CURRENTS.map((current, i) => (
        <g key={i}>
          <path
            d={current.path}
            fill="none"
            stroke={current.color}
            strokeWidth="3"
            opacity={current.opacity}
            strokeLinecap="round"
          />
          <path
            d={current.path}
            fill="none"
            stroke={current.color}
            strokeWidth="0.8"
            opacity={current.opacity * 3}
            strokeLinecap="round"
            strokeDasharray="1 6"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-30"
              dur={`${20 + i * 5}s`}
              repeatCount="indefinite"
            />
          </path>
        </g>
      ))}
    </g>
  );
}