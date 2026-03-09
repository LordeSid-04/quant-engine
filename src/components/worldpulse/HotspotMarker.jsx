import React from "react";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";

export default function HotspotMarker({ spot, onClick }) {
  const size = 12 + Math.round((spot.heat / 100) * 10);

  const icon = L.divIcon({
    html: `
      <div style="position:relative;width:${size * 3}px;height:${size * 3}px;display:flex;align-items:center;justify-content:center;">
        <div style="
          position:absolute;
          width:${size * 3}px;height:${size * 3}px;
          border-radius:50%;
          background:${spot.color};
          opacity:0.08;
          animation:pulse-glow 3s ease-in-out infinite;
        "></div>
        <div style="
          position:absolute;
          width:${size * 1.8}px;height:${size * 1.8}px;
          border-radius:50%;
          background:${spot.color};
          opacity:0.12;
          border:1px solid ${spot.color}60;
          animation:pulse-glow 3s ease-in-out infinite 0.5s;
        "></div>
        <div style="
          position:relative;
          width:${size}px;height:${size}px;
          border-radius:50%;
          background:${spot.color};
          opacity:0.85;
          border:1.5px solid ${spot.color};
          box-shadow:0 0 ${size}px ${spot.color}80,0 0 ${size * 2}px ${spot.color}30;
          cursor:pointer;
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="width:${size * 0.35}px;height:${size * 0.35}px;border-radius:50%;background:white;opacity:0.9;"></div>
        </div>
      </div>
    `,
    className: "",
    iconSize: [size * 3, size * 3],
    iconAnchor: [size * 1.5, size * 1.5],
    tooltipAnchor: [0, -size * 1.5],
  });

  return (
    <Marker
      position={[spot.lat, spot.lng]}
      icon={icon}
      eventHandlers={{ click: onClick }}
    >
      <Tooltip direction="top" offset={[0, -8]} className="atlas-map-tooltip">
        <div style={{ padding: "2px 0" }}>
          <div style={{ color: spot.color, fontWeight: 700, fontSize: "12px", marginBottom: "2px" }}>
            {spot.name}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "10px", marginBottom: "4px" }}>{spot.narrative}</div>
          <div style={{ display: "flex", gap: "12px" }}>
            <span style={{ fontSize: "10px", color: "#64748b" }}>
              Heat <span style={{ color: spot.color, fontWeight: 600 }}>{spot.heat}</span>
            </span>
            <span style={{ fontSize: "10px", color: "#64748b" }}>
              Conf <span style={{ color: "#e2e8f0" }}>{spot.confidence}%</span>
            </span>
          </div>
        </div>
      </Tooltip>
    </Marker>
  );
}