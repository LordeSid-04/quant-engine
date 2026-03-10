import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Network } from "lucide-react";

const NODE_DESCRIPTIONS = {
  origin: {
    title: "Origin Shock",
    detail: "Initial shock impulse injected from the selected macro event and origin region.",
    tags: ["Shock source", "Live scenario"],
  },
  rates: {
    title: "Rates",
    detail: "Yield and policy-path repricing transmit into duration-sensitive assets.",
    tags: ["Policy sensitivity", "Duration risk"],
  },
  commodities: {
    title: "Commodities",
    detail: "Energy and materials pressure feed inflation and margin stress.",
    tags: ["Pass-through", "Supply pressure"],
  },
  fx: {
    title: "FX",
    detail: "Currency volatility reflects cross-region funding and carry repricing.",
    tags: ["Cross-border", "Funding spillover"],
  },
  credit: {
    title: "Credit",
    detail: "Spread widening and refinancing stress amplify downside convexity.",
    tags: ["Liquidity stress", "Spread risk"],
  },
  equities: {
    title: "Equities",
    detail: "Valuation reset and earnings pressure impact cyclical and growth exposures.",
    tags: ["Risk sentiment", "Valuation reset"],
  },
  volatility: {
    title: "Volatility",
    detail: "Implied and realized volatility rise as uncertainty broadens.",
    tags: ["Tail-risk signal", "Cross-asset"],
  },
  em: {
    title: "EM Spillover",
    detail: "Emerging-market assets absorb external shock via rates, FX, and funding.",
    tags: ["External vulnerability", "Cross-region"],
  },
};

const NODE_CORE_COLOR = "#46c8ff";
const NODE_RING_COLOR = "#8891a3";
const NODE_CENTER_COLOR = "#d81b60";
const IMPACT_COLORS = {
  critical: "#3de7ff",
  high: "#46c8ff",
  medium: "#6f8cff",
  low: "#8292ba",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function removeChannelWord(value) {
  return String(value || "")
    .replace(/\bchannel\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function networkCurvePoint(t) {
  const major = 18.4;
  const minor = 7.2;
  const x = Math.cos(t) * major;
  const y = Math.sin(t * 2.25) * minor * 0.72;
  const z = Math.sin(t) * major * 0.67;
  const point = new THREE.Vector3(x, y, z);
  point.applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.63);
  point.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.24);
  return point;
}

function fallbackGraph() {
  return {
    nodes: [
      { id: "origin", label: "Origin Shock", intensity: 0.95, activation_step: 0 },
      { id: "rates", label: "Rates", intensity: 0.82, activation_step: 1 },
      { id: "fx", label: "FX", intensity: 0.76, activation_step: 2 },
      { id: "commodities", label: "Commodities", intensity: 0.72, activation_step: 3 },
      { id: "equities", label: "Equities", intensity: 0.68, activation_step: 4 },
      { id: "credit", label: "Credit", intensity: 0.7, activation_step: 5 },
      { id: "em", label: "EM Spillover", intensity: 0.64, activation_step: 6 },
      { id: "volatility", label: "Volatility", intensity: 0.78, activation_step: 7 },
    ],
  };
}

function deriveFeatureNodes(result) {
  const base = result?.graph?.nodes?.length ? result.graph : fallbackGraph();
  const sortedNodes = [...base.nodes].sort((a, b) => (a.activation_step ?? 99) - (b.activation_step ?? 99));
  const total = Math.max(1, sortedNodes.length);

  return sortedNodes.map((node, index) => {
    const t = (index / total) * Math.PI * 2.0 + 0.32;
    const anchor = networkCurvePoint(t);
    const orbitScale = 1.6 + clamp(Number(node.intensity ?? 0.5), 0.15, 1) * 1.1;
    const offset = new THREE.Vector3(
      Math.cos(t * 1.85) * orbitScale,
      Math.sin(t * 1.42) * orbitScale * 0.6,
      Math.cos(t * 2.1) * orbitScale * 0.74,
    );
    return {
      ...node,
      id: String(node.id || `node-${index}`),
      label: removeChannelWord(node.label || node.id || `Node ${index + 1}`),
      intensity: clamp(Number(node.intensity ?? 0.55), 0.15, 1),
      position: anchor.add(offset),
    };
  });
}

function classifyImpactNode(assetName) {
  const needle = String(assetName || "").toLowerCase();
  if (/(rate|yield|treasury|bond|duration)/.test(needle)) return "rates";
  if (/(oil|energy|commodity|metal|gas)/.test(needle)) return "commodities";
  if (/(fx|currency|usd|dollar|yen|euro)/.test(needle)) return "fx";
  if (/(credit|spread|corp|loan|high yield)/.test(needle)) return "credit";
  if (/(equit|stock|index|earnings)/.test(needle)) return "equities";
  if (/(emerging|latam|asia ex|frontier|em )/.test(needle)) return "em";
  if (/(vix|volatil|gamma|option)/.test(needle)) return "volatility";
  return "origin";
}

function deriveImpactBuckets(result, nodes) {
  const buckets = new Map(nodes.map((node) => [node.id, []]));
  const impacts = Array.isArray(result?.impacts) ? result.impacts.slice(0, 18) : [];
  impacts.forEach((impact, index) => {
    const nodeId = classifyImpactNode(impact.asset);
    const fallbackNodeId = nodes[index % Math.max(1, nodes.length)]?.id;
    const targetId = buckets.has(nodeId) ? nodeId : fallbackNodeId;
    if (!targetId || !buckets.has(targetId)) return;
    buckets.get(targetId).push({
      ...impact,
      _metricId: `impact-${index}`,
    });
  });
  buckets.forEach((rows) => {
    rows.sort((a, b) => {
      const rankDelta = severityRank(b.severity) - severityRank(a.severity);
      if (rankDelta !== 0) return rankDelta;
      return Math.abs(Number(b.impact || 0)) - Math.abs(Number(a.impact || 0));
    });
  });
  return buckets;
}

function toImpactTag(intensity) {
  const value = Number(intensity || 0);
  if (value >= 0.82) return "Critical";
  if (value >= 0.64) return "High Likelihood";
  if (value >= 0.42) return "Elevated";
  return "Monitoring";
}

function toSyntheticSeverity(intensity) {
  const value = Number(intensity || 0);
  if (value >= 0.82) return "critical";
  if (value >= 0.64) return "high";
  if (value >= 0.42) return "medium";
  return "low";
}

function severityRank(value) {
  switch (String(value || "").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function formatImpactValue(impact, unit) {
  const numeric = Number(impact || 0);
  const signed = `${numeric > 0 ? "+" : ""}${numeric.toFixed(unit === "bp" ? 1 : 2)}`;
  return `${signed}${unit === "bp" ? "bp" : "%"}`;
}

export default function PropagationGraph({ isRunning, result, runId = 0 }) {
  const mountRef = useRef(null);
  const lockedNodeIdRef = useRef("");
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const graphNodes = useMemo(() => deriveFeatureNodes(result), [result]);
  const impactBuckets = useMemo(() => deriveImpactBuckets(result, graphNodes), [result, graphNodes]);
  const nodeCount = graphNodes.length;
  const impactCount = useMemo(() => {
    return Array.from(impactBuckets.values()).reduce((total, rows) => total + rows.length, 0);
  }, [impactBuckets]);
  const topImpact = useMemo(() => {
    if (!Array.isArray(result?.impacts) || !result.impacts.length) return null;
    return [...result.impacts].sort((a, b) => Math.abs(Number(b.impact || 0)) - Math.abs(Number(a.impact || 0)))[0];
  }, [result]);

  useEffect(() => {
    lockedNodeIdRef.current = "";
    setHoveredNode(null);
  }, [runId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return () => {};

    const width = mount.clientWidth || 900;
    const height = mount.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010206);
    scene.fog = new THREE.FogExp2(0x02040b, 0.022);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 320);
    camera.position.set(0, 0, 62);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x010206, 1);
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.88;
    controls.panSpeed = 0.5;
    controls.minDistance = 24;
    controls.maxDistance = 145;
    controls.autoRotate = isRunning && !result;
    controls.autoRotateSpeed = 0.34;

    const ambient = new THREE.AmbientLight(0xbbd7ff, 0.46);
    const coolLight = new THREE.PointLight(0x5fd8ff, 0.62, 170, 1.45);
    coolLight.position.set(26, 20, 36);
    const warmLight = new THREE.PointLight(0xff9f66, 0.72, 170, 1.48);
    warmLight.position.set(-28, -18, -34);
    scene.add(ambient, coolLight, warmLight);

    const createParticleCloud = ({ count, size, opacity, jitterScale, colorA, colorB, phaseOffset = 0 }) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const toneA = new THREE.Color(colorA);
      const toneB = new THREE.Color(colorB);

      for (let i = 0; i < count; i += 1) {
        const t = (i / count) * Math.PI * 9.2 + phaseOffset + (Math.random() - 0.5) * 0.36;
        const base = networkCurvePoint(t);
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * jitterScale,
          (Math.random() - 0.5) * jitterScale * 0.9,
          (Math.random() - 0.5) * jitterScale,
        );
        const radial = new THREE.Vector3(
          Math.cos(t * 2.1) * 1.25,
          Math.sin(t * 1.8) * 0.9,
          Math.sin(t * 2.4) * 1.1,
        );
        base.add(jitter).add(radial);

        positions[i * 3] = base.x;
        positions[i * 3 + 1] = base.y;
        positions[i * 3 + 2] = base.z;

        const blend = clamp(0.2 + Math.random() * 0.8, 0, 1);
        const tone = toneA.clone().lerp(toneB, blend);
        colors[i * 3] = tone.r;
        colors[i * 3 + 1] = tone.g;
        colors[i * 3 + 2] = tone.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size,
        transparent: true,
        opacity,
        sizeAttenuation: true,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      return new THREE.Points(geometry, material);
    };

    const primaryCloud = createParticleCloud({
      count: 3700,
      size: 0.23,
      opacity: 0.93,
      jitterScale: 5.9,
      colorA: "#38d8ff",
      colorB: "#9d7dff",
      phaseOffset: 0,
    });
    const secondaryCloud = createParticleCloud({
      count: 2100,
      size: 0.17,
      opacity: 0.68,
      jitterScale: 8.1,
      colorA: "#2fc9ff",
      colorB: "#c896ff",
      phaseOffset: Math.PI * 0.45,
    });

    const dustCount = 1300;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const spread = 58;
      dustPositions[i * 3] = (Math.random() - 0.5) * spread;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      const tint = new THREE.Color("#1e5d7d").lerp(new THREE.Color("#6f4f9e"), Math.random());
      dustColors[i * 3] = tint.r;
      dustColors[i * 3 + 1] = tint.g;
      dustColors[i * 3 + 2] = tint.b;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute("color", new THREE.Float32BufferAttribute(dustColors, 3));
    const dustMaterial = new THREE.PointsMaterial({
      size: 0.1,
      transparent: true,
      opacity: 0.36,
      sizeAttenuation: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dustCloud = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(primaryCloud, secondaryCloud, dustCloud);

    const featureGroup = new THREE.Group();
    scene.add(featureGroup);
    const interactiveMeshes = [];
    const rings = [];

    graphNodes.forEach((node) => {
      const nodeMeta = NODE_DESCRIPTIONS[node.id] || {
        title: node.label,
        detail: "Transmission node in the active propagation structure.",
        tags: ["Network node"],
      };
      const nodeLabel = removeChannelWord(nodeMeta.title || node.label);
      const nodeImpacts = impactBuckets.get(node.id) || [];
      const displayImpacts = nodeImpacts.length
        ? nodeImpacts.slice(0, 3)
        : [
            {
              _metricId: `synthetic-${node.id}`,
              asset: nodeLabel,
              impact: Number((node.intensity * 100).toFixed(1)),
              unit: "%",
              severity: toSyntheticSeverity(node.intensity),
            },
          ];
      const dominantSeverity = String(displayImpacts[0]?.severity || toSyntheticSeverity(node.intensity)).toLowerCase();
      const dominantColor = new THREE.Color(IMPACT_COLORS[dominantSeverity] || NODE_CORE_COLOR);
      const isOriginNode = node.id === "origin";

      const radius = 0.2 + node.intensity * 0.05;
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 14, 14),
        new THREE.MeshStandardMaterial({
          color: dominantColor,
          emissive: dominantColor.clone().multiplyScalar(0.95),
          emissiveIntensity: 1.18,
          roughness: 0.24,
          metalness: 0.1,
          transparent: true,
          opacity: 0.96,
        }),
      );
      shell.position.copy(node.position);
      shell.userData = {
        type: "node",
        id: node.id,
        label: nodeLabel,
        detail: nodeMeta.detail,
        tags: nodeMeta.tags || [],
        impacts: displayImpacts,
        intensity: node.intensity,
      };
      featureGroup.add(shell);
      interactiveMeshes.push(shell);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.9, 12, 12),
        new THREE.MeshBasicMaterial({
          color: dominantColor,
          transparent: true,
          opacity: 0.23,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      halo.position.copy(node.position);
      halo.userData = { type: "node-halo", hostId: node.id };
      featureGroup.add(halo);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 0.33, 0.026, 10, 58),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(NODE_RING_COLOR),
          transparent: true,
          opacity: 0.78,
        }),
      );
      ring.position.copy(node.position);
      ring.userData = { type: "node-ring", hostId: node.id };
      featureGroup.add(ring);
      rings.push(ring);

      const centerDot = new THREE.Mesh(
        new THREE.SphereGeometry(isOriginNode ? 0.16 : 0.14, 14, 14),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(NODE_CENTER_COLOR) }),
      );
      centerDot.position.copy(node.position);
      centerDot.userData = { type: "node-dot", hostId: node.id };
      featureGroup.add(centerDot);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-10, -10);
    let hoveredMesh = null;
    let frameId = 0;
    let box = renderer.domElement.getBoundingClientRect();

    const updateTooltipFromMesh = (mesh) => {
      if (!mesh) return;
      const projected = mesh.position.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * box.width;
      const y = (-projected.y * 0.5 + 0.5) * box.height;
      setTooltipPosition({ x, y });

      const impacts = Array.isArray(mesh.userData.impacts) ? mesh.userData.impacts : [];
      const lines = impacts
        .slice(0, 3)
        .map((item) => `${removeChannelWord(item.asset || mesh.userData.label)}: ${formatImpactValue(item.impact, item.unit)}`);
      setHoveredNode({
        kind: "node",
        id: mesh.userData.id,
        label: removeChannelWord(mesh.userData.label),
        detail: mesh.userData.detail || "Propagation node",
        impactTag: toImpactTag(mesh.userData.intensity),
        impactMetrics: lines,
        tags: (mesh.userData.tags || []).slice(0, 3),
      });
    };

    const resolvePointer = (clientX, clientY) => {
      box = renderer.domElement.getBoundingClientRect();
      const x = ((clientX - box.left) / box.width) * 2 - 1;
      const y = -((clientY - box.top) / box.height) * 2 + 1;
      pointer.set(x, y);
    };

    const onPointerMove = (event) => {
      resolvePointer(event.clientX, event.clientY);
    };

    const onPointerLeave = () => {
      pointer.set(-10, -10);
      if (!lockedNodeIdRef.current) {
        hoveredMesh = null;
        setHoveredNode(null);
      }
    };

    const onPointerDown = () => {
      if (!hoveredMesh) {
        lockedNodeIdRef.current = "";
        return;
      }
      const nodeId = hoveredMesh.userData.id;
      lockedNodeIdRef.current = lockedNodeIdRef.current === nodeId ? "" : nodeId;
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const onResize = () => {
      const nextWidth = mount.clientWidth || 900;
      const nextHeight = mount.clientHeight || 520;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      box = renderer.domElement.getBoundingClientRect();
    };
    window.addEventListener("resize", onResize);

    const animate = (time) => {
      frameId = requestAnimationFrame(animate);

      primaryCloud.rotation.y += 0.00076;
      primaryCloud.rotation.x += 0.00018;
      secondaryCloud.rotation.y -= 0.00042;
      secondaryCloud.rotation.z += 0.00014;
      dustCloud.rotation.y += 0.00008;

      featureGroup.children.forEach((child, index) => {
        if (!(child instanceof THREE.Mesh)) return;
        const type = child.userData.type;
        if (type === "node") {
          const pulse = 1 + Math.sin(time * 0.0022 + index * 0.7) * 0.09;
          child.scale.setScalar(pulse);
          return;
        }
        if (type === "node-halo") {
          const pulse = 1 + Math.sin(time * 0.0034 + index * 1.15) * 0.11;
          child.scale.setScalar(pulse);
          return;
        }
        if (type === "node-ring") {
          child.rotation.x += 0.0074;
          child.rotation.y += 0.0051;
          const wave = 1 + Math.sin(time * 0.003 + index * 0.9) * 0.06;
          child.scale.setScalar(wave);
        }
      });

      rings.forEach((ring, index) => {
        ring.rotation.z += 0.0042 + index * 0.00006;
      });

      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(interactiveMeshes, false);
      const pointed = intersections[0]?.object || null;

      if (lockedNodeIdRef.current) {
        const lockedMesh = interactiveMeshes.find((mesh) => mesh.userData.id === lockedNodeIdRef.current) || null;
        hoveredMesh = lockedMesh;
        if (hoveredMesh) updateTooltipFromMesh(hoveredMesh);
      } else if (pointed) {
        hoveredMesh = pointed;
        updateTooltipFromMesh(hoveredMesh);
      } else if (hoveredMesh) {
        hoveredMesh = null;
        setHoveredNode(null);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      controls.dispose();

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [graphNodes, impactBuckets, isRunning, result, runId]);

  return (
    <div className="atlas-surface-strong flex h-full flex-col overflow-hidden rounded-2xl border border-white/12 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <div className="border-b border-white/10 bg-gradient-to-r from-white/[0.06] to-transparent px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Network className={`h-4 w-4 ${isRunning ? "animate-pulse text-zinc-100" : "text-zinc-500"}`} />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-100">3D Causal Propagation Network</h2>
          </div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            nodes {nodeCount} | linked moves {Math.max(impactCount, nodeCount)}
          </div>
        </div>
      </div>

      <div className="relative flex-1 p-4 sm:p-5">
        <div ref={mountRef} className="h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black" />

        {hoveredNode ? (
          <div
            className="pointer-events-none absolute z-20 w-[min(360px,74vw)] rounded-xl border border-cyan-200/30 bg-[#061020]/88 p-3 shadow-[0_20px_44px_rgba(0,0,0,0.5)] backdrop-blur-sm"
            style={{
              left: `${clamp(tooltipPosition.x + 26, 12, (mountRef.current?.clientWidth || 900) - 360)}px`,
              top: `${clamp(tooltipPosition.y - 28, 12, (mountRef.current?.clientHeight || 520) - 200)}px`,
            }}
          >
            <div className="text-sm font-semibold text-zinc-100">{hoveredNode.label}</div>
            <div className="mt-1 text-[11px] text-zinc-300">{hoveredNode.detail}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-cyan-300/35 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-cyan-200">
                {hoveredNode.impactTag}
              </span>
              {(hoveredNode.tags || []).slice(0, 2).map((tag) => (
                <span key={tag} className="rounded-full border border-white/18 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-300">
                  {tag}
                </span>
              ))}
            </div>
            {hoveredNode.impactMetrics?.length ? (
              <div className="mt-2 border-t border-white/10 pt-2 text-[11px] text-zinc-300">
                {hoveredNode.impactMetrics.slice(0, 3).map((line) => (
                  <div key={line} className="truncate">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-5 left-5 flex flex-wrap items-center gap-3 rounded-full border border-white/14 bg-black/48 px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-zinc-300 backdrop-blur-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#46c8ff] shadow-[0_0_12px_rgba(70,200,255,0.85)]" />
            Transmission
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#d81b60] shadow-[0_0_12px_rgba(216,27,96,0.85)]" />
            Core Pulse
          </span>
          {topImpact ? <span>Top Move {topImpact.asset}: {formatImpactValue(topImpact.impact, topImpact.unit)}</span> : null}
        </div>

        {!isRunning && !result ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="text-center">
              <div className="text-sm font-medium tracking-wide text-zinc-300">Configure and run a scenario</div>
              <div className="mt-1 text-[11px] text-zinc-500">drag to orbit | scroll to zoom | click nodes to pin details</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
