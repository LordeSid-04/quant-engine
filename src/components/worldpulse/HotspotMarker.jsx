import React from "react";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";

export default function HotspotMarker({ spot, onClick }) {
  const pinSize = 16 + Math.round((spot.heat / 100) * 3);
  const coreColor = spot.heat >= 75 ? "#fafafa" : spot.heat >= 50 ? "#d4d4d8" : "#a1a1aa";
  const ringColor = spot.heat >= 75 ? "#ffffff" : "#e4e4e7";
  const glowColor = spot.heat >= 75 ? "rgba(255,255,255,0.7)" : "rgba(228,228,231,0.52)";

  const icon = L.divIcon({
    html: `
      <div style="position:relative;width:${pinSize * 2.6}px;height:${pinSize * 2.6}px;display:flex;align-items:center;justify-content:center;">
        <div style="
          position:absolute;
          width:${pinSize * 2.3}px;height:${pinSize * 2.3}px;
          border-radius:50%;
          background:${coreColor};
          opacity:0.14;
          animation:pin-heartbeat 1.6s ease-in-out infinite;
        "></div>
        <div style="
          position:absolute;
          width:${pinSize * 1.3}px;height:${pinSize * 1.3}px;
          border-radius:50%;
          border:1px solid ${ringColor};
          opacity:0.32;
          animation:pin-heartbeat 1.6s ease-in-out infinite 0.22s;
        "></div>
        <div style="
          position:relative;
          width:${pinSize}px;height:${pinSize}px;
          cursor:pointer;
          animation:pin-bounce 2.3s ease-in-out infinite;
        ">
          <svg viewBox="0 0 24 24" width="${pinSize}" height="${pinSize}" fill="${coreColor}" style="filter: drop-shadow(0 0 8px ${glowColor});">
            <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.44 11.24 7.02 11.77a1.5 1.5 0 0 0 1.96 0C13.56 21.24 20 15.25 20 10c0-4.42-3.58-8-8-8z"></path>
            <circle cx="12" cy="10" r="2.9" fill="#09090b"></circle>
          </svg>
        </div>
      </div>
    `,
    className: "",
    iconSize: [pinSize * 2.6, pinSize * 2.6],
    iconAnchor: [pinSize * 1.3, pinSize * 2.2],
    tooltipAnchor: [0, -pinSize * 1.1],
  });

  return (
    <Marker position={[spot.lat, spot.lng]} icon={icon} eventHandlers={{ click: onClick }}>
      <Tooltip direction="top" offset={[0, -10]} opacity={0.95} className="atlas-map-tooltip" sticky>
        <span className="text-[11px] font-medium text-zinc-100">{spot.name}</span>
      </Tooltip>
    </Marker>
  );
}
