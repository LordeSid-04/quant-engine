import React from "react";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { HOTSPOTS, ARCS } from "./MacroMapData";
import HotspotMarker from "./HotspotMarker";
import MapArcLayer from "./MapArcLayer";

export default function GlobeMap({ onSelectRegion }) {
  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[25, 15]}
        zoom={2}
        minZoom={1.8}
        maxZoom={6}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={true}
        worldCopyJump={false}
        maxBounds={[[-85, -179.9], [85, 179.9]]}
        maxBoundsViscosity={1}
        style={{ background: "#0d1529" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={6}
          noWrap={true}
        />
        <MapArcLayer arcs={ARCS} hotspots={HOTSPOTS} />
        {HOTSPOTS.map((spot) => (
          <HotspotMarker
            key={spot.id}
            spot={spot}
            onClick={() => onSelectRegion(spot)}
          />
        ))}
        <ZoomControl position="bottomright" />
      </MapContainer>

      {/* Hint */}
      <div className="absolute bottom-10 left-4 z-[1000] text-[11px] text-slate-500 pointer-events-none select-none">
        Scroll to zoom · Click hotspots for briefing
      </div>
    </div>
  );
}