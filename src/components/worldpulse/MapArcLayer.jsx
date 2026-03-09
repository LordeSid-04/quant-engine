import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";

export default function MapArcLayer({ arcs, hotspots }) {
  const map = useMap();
  const svgRef = useRef(null);

  const getHotspot = (id) => hotspots.find((h) => h.id === id);

  const drawArcs = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const size = map.getSize();
    svg.setAttribute("width", size.x);
    svg.setAttribute("height", size.y);
    svg.innerHTML = "";

    // defs for glow filter
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <filter id="arc-glow">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    svg.appendChild(defs);

    arcs.forEach((arc, i) => {
      const from = getHotspot(arc.from);
      const to = getHotspot(arc.to);
      if (!from || !to) return;

      const p1 = map.latLngToContainerPoint([from.lat, from.lng]);
      const p2 = map.latLngToContainerPoint([to.lat, to.lng]);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - dist * 0.25;

      const pathD = `M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`;
      const pathId = `arc-path-${i}-${Date.now()}`;

      // Glow shadow
      const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      shadow.setAttribute("d", pathD);
      shadow.setAttribute("fill", "none");
      shadow.setAttribute("stroke", arc.color);
      shadow.setAttribute("stroke-width", "3");
      shadow.setAttribute("opacity", "0.07");
      shadow.setAttribute("filter", "url(#arc-glow)");
      svg.appendChild(shadow);

      // Main dashed arc
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("id", pathId);
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", arc.color);
      path.setAttribute("stroke-width", "1.2");
      path.setAttribute("opacity", "0.45");
      path.setAttribute("stroke-dasharray", "6 5");
      path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      // Animated particle dot
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "3.5");
      circle.setAttribute("fill", arc.color);
      circle.setAttribute("opacity", "0.9");
      circle.setAttribute("filter", "url(#arc-glow)");

      const animateMotion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
      animateMotion.setAttribute("dur", `${2.5 + i * 0.5}s`);
      animateMotion.setAttribute("repeatCount", "indefinite");
      animateMotion.setAttribute("begin", `${i * 0.4}s`);

      const mpath = document.createElementNS("http://www.w3.org/2000/svg", "mpath");
      mpath.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${pathId}`);
      animateMotion.appendChild(mpath);
      circle.appendChild(animateMotion);
      svg.appendChild(circle);

      // Arrowhead at end point
      const angle = Math.atan2(p2.y - midY, p2.x - midX);
      const arrowSize = 6;
      const ax = p2.x - arrowSize * Math.cos(angle - 0.4);
      const ay = p2.y - arrowSize * Math.sin(angle - 0.4);
      const bx = p2.x - arrowSize * Math.cos(angle + 0.4);
      const by = p2.y - arrowSize * Math.sin(angle + 0.4);

      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      arrow.setAttribute("points", `${p2.x},${p2.y} ${ax},${ay} ${bx},${by}`);
      arrow.setAttribute("fill", arc.color);
      arrow.setAttribute("opacity", "0.55");
      svg.appendChild(arrow);
    });
  };

  useEffect(() => {
    const container = map.getContainer();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;z-index:450;overflow:visible;";
    container.appendChild(svg);
    svgRef.current = svg;

    drawArcs();
    map.on("move zoom moveend zoomend resize", drawArcs);

    return () => {
      map.off("move zoom moveend zoomend resize", drawArcs);
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    };
  }, [map]);

  useMapEvents({
    move: drawArcs,
    zoom: drawArcs,
    moveend: drawArcs,
    zoomend: drawArcs,
  });

  return null;
}