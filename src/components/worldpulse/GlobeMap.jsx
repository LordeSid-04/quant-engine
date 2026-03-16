import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const WORLD_GEOJSON_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";
const GLOBE_RADIUS = 1.9;
const BASE_DOT_COLOR = new THREE.Color("#1ad1ff");
const LAND_DOT_COLOR = new THREE.Color("#fdfdfd");
const HOTSPOT_COLOR = new THREE.Color("#ff2d55");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function zoomToDistance(zoom) {
  const numeric = Number(zoom || 3);
  return clamp(8 - numeric * 0.95, 3.2, 7.4);
}

function buildDotSprite({ coreColor, midColor, outerColor }) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, coreColor);
  gradient.addColorStop(0.55, midColor);
  gradient.addColorStop(1, outerColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const DOT_SPRITE = buildDotSprite({
  coreColor: "rgba(255,255,255,1)",
  midColor: "rgba(255,255,255,0.92)",
  outerColor: "rgba(255,255,255,0)",
});

const GLOW_SPRITE = buildDotSprite({
  coreColor: "rgba(255,255,255,0.95)",
  midColor: "rgba(255,255,255,0.28)",
  outerColor: "rgba(255,255,255,0)",
});

function createPinTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "rgba(255,59,92,0.98)";
  ctx.beginPath();
  ctx.moveTo(64, 14);
  ctx.bezierCurveTo(35, 14, 20, 40, 20, 60);
  ctx.bezierCurveTo(20, 84, 48, 101, 64, 120);
  ctx.bezierCurveTo(80, 101, 108, 84, 108, 60);
  ctx.bezierCurveTo(108, 40, 93, 14, 64, 14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff4f7";
  ctx.beginPath();
  ctx.arc(64, 57, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function latLngToVector3(lat, lng, radius = GLOBE_RADIUS) {
  const phi = (90 - Number(lat || 0)) * (Math.PI / 180);
  const theta = (Number(lng || 0) + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function projectLngLat(lng, lat, width, height) {
  return [((lng + 180) / 360) * width, ((90 - lat) / 180) * height];
}

function drawPolygon(ctx, ring, width, height) {
  if (!Array.isArray(ring) || ring.length === 0) return;
  ctx.beginPath();
  ring.forEach((point, index) => {
    const [x, y] = projectLngLat(point[0], point[1], width, height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function rasterizeWorld(features) {
  const width = 1440;
  const height = 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#1ad1ff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f8fffe";

  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates) {
        drawPolygon(ctx, ring, width, height);
        ctx.fill();
      }
      continue;
    }

    if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          drawPolygon(ctx, ring, width, height);
          ctx.fill();
        }
      }
    }
  }

  return ctx.getImageData(0, 0, width, height);
}

function buildMatrixPoints(imageData) {
  if (!imageData) {
    return {
      geometry: new THREE.BufferGeometry(),
      glowGeometry: new THREE.BufferGeometry(),
    };
  }

  const { width, height, data } = imageData;
  const positions = [];
  const colors = [];
  const glowPositions = [];
  const glowColors = [];
  const latStep = 2;
  const lngStep = 2;

  for (let lat = 87; lat >= -87; lat -= latStep) {
    for (let lng = -180; lng < 180; lng += lngStep) {
      const x = Math.min(width - 1, Math.max(0, Math.floor(((lng + 180) / 360) * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const isLand = r > 220 && g > 220 && b > 220;

      const position = latLngToVector3(lat, lng, GLOBE_RADIUS);
      positions.push(position.x, position.y, position.z);

      const color = isLand ? LAND_DOT_COLOR : BASE_DOT_COLOR;
      colors.push(color.r, color.g, color.b);

      if (isLand) {
        glowPositions.push(position.x, position.y, position.z);
        glowColors.push(LAND_DOT_COLOR.r, LAND_DOT_COLOR.g, LAND_DOT_COLOR.b);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute("position", new THREE.Float32BufferAttribute(glowPositions, 3));
  glowGeometry.setAttribute("color", new THREE.Float32BufferAttribute(glowColors, 3));
  return { geometry, glowGeometry };
}

function createArcCurve(from, to, intensity = 0.5, isManual = false) {
  const start = from.clone().normalize().multiplyScalar(GLOBE_RADIUS + 0.05);
  const end = to.clone().normalize().multiplyScalar(GLOBE_RADIUS + 0.05);
  const arcLift = isManual ? 0.72 : 0.42 + clamp(Number(intensity || 0), 0.05, 1) * 0.38;
  const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS + arcLift);
  return new THREE.QuadraticBezierCurve3(start, mid, end);
}

function createFocusQuaternion(fromSpot, toSpot) {
  const focusVector = toSpot
    ? latLngToVector3(
        (Number(fromSpot.lat || 0) + Number(toSpot.lat || 0)) / 2,
        (Number(fromSpot.lng || 0) + Number(toSpot.lng || 0)) / 2,
        1,
      ).normalize()
    : latLngToVector3(fromSpot.lat, fromSpot.lng, 1).normalize();
  return new THREE.Quaternion().setFromUnitVectors(focusVector, new THREE.Vector3(0, 0, 1));
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((item) => disposeMaterial(item));
    return;
  }
  if (material.map) material.map.dispose();
  material.dispose();
}

export default function GlobeMap({
  hotspots = [],
  arcs = [],
  manualArc = null,
  onSelectCountry = () => {},
  mapKey = "default",
  initialZoom = 2.7,
  minZoom = 2.4,
  maxZoom = 6,
  markerVariant = "classic",
  instructionText = "Rotate to inspect global spillovers. Scroll to zoom. Click a red marker for country intelligence.",
}) {
  const mountRef = useRef(null);
  const tooltipRef = useRef(null);
  const onSelectCountryRef = useRef(onSelectCountry);
  const hoveredSpotRef = useRef(null);
  const [hoveredSpot, setHoveredSpot] = useState(null);

  useEffect(() => {
    onSelectCountryRef.current = onSelectCountry;
  }, [onSelectCountry]);

  const hotspotLookup = useMemo(() => new Map(hotspots.map((spot) => [spot.id, spot])), [hotspots]);
  const renderedArcs = useMemo(() => {
    const rows = [...arcs];
    if (manualArc?.from && manualArc?.to) {
      rows.push({
        ...manualArc,
        color: manualArc.color || "#ff4f7a",
        intensity: 0.95,
        __manual: true,
      });
    }
    return rows;
  }, [arcs, manualArc]);
  const focusedHotspotIds = useMemo(() => {
    if (!manualArc?.from || !manualArc?.to) return null;
    return new Set([String(manualArc.from), String(manualArc.to)]);
  }, [manualArc]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return () => {};

    const width = mount.clientWidth || 960;
    const height = mount.clientHeight || 540;
    let animationFrame = 0;
    let destroyed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#01030b");

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.25, zoomToDistance(initialZoom));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#01030b", 1);
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.76;
    controls.minDistance = zoomToDistance(maxZoom);
    controls.maxDistance = Math.max(controls.minDistance + 0.6, zoomToDistance(minZoom));
    controls.autoRotate = !manualArc;
    controls.autoRotateSpeed = 0.32;

    const stars = new THREE.Group();
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    for (let index = 0; index < 850; index += 1) {
      const radius = 16 + Math.random() * 16;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
    }
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: "#ebffff",
      size: 0.05,
      transparent: true,
      opacity: 0.96,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const starField = new THREE.Points(starGeometry, starMaterial);
    stars.add(starField);
    scene.add(stars);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const matrixMaterial = new THREE.PointsMaterial({
      size: 0.038,
      map: DOT_SPRITE,
      transparent: true,
      opacity: 1,
      alphaTest: 0.12,
      vertexColors: true,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const matrixGeometry = new THREE.BufferGeometry();
    const matrixPoints = new THREE.Points(matrixGeometry, matrixMaterial);
    globeGroup.add(matrixPoints);

    const glowMaterial = new THREE.PointsMaterial({
      size: 0.108,
      map: GLOW_SPRITE,
      transparent: true,
      opacity: 1,
      alphaTest: 0.02,
      vertexColors: true,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowGeometry = new THREE.BufferGeometry();
    const glowPoints = new THREE.Points(glowGeometry, glowMaterial);
    globeGroup.add(glowPoints);

    const matrixBasePositionsRef = { current: null };
    const glowBasePositionsRef = { current: null };

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.03, 64, 64),
      new THREE.MeshBasicMaterial({
        color: "#b6ecff",
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
      }),
    );
    globeGroup.add(atmosphere);

    const globeCore = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 0.988, 72, 72),
      new THREE.MeshPhongMaterial({
        color: "#0b2b67",
        emissive: "#081a46",
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.34,
        shininess: 18,
      }),
    );
    globeGroup.add(globeCore);

    const hotspotGroup = new THREE.Group();
    globeGroup.add(hotspotGroup);

    const arcGroup = new THREE.Group();
    globeGroup.add(arcGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const markerTargets = [];
    const pulseSprites = [];
    const pinTexture = createPinTexture();

    const rebuildHotspots = () => {
      markerTargets.splice(0, markerTargets.length);
      pulseSprites.splice(0, pulseSprites.length);
      hotspotGroup.clear();

      hotspots.forEach((spot) => {
        const shouldEmphasize = !focusedHotspotIds || focusedHotspotIds.has(String(spot.id));
        if (!shouldEmphasize) return;
        const heatFactor = clamp(Number(spot.heat || 0) / 100, 0.18, 1);
        const surfacePoint = latLngToVector3(spot.lat, spot.lng, GLOBE_RADIUS + 0.03);
        const pinPoint = latLngToVector3(spot.lat, spot.lng, GLOBE_RADIUS + 0.19);

        const stemGeometry = new THREE.BufferGeometry().setFromPoints([surfacePoint, pinPoint]);
        const stem = new THREE.Line(
          stemGeometry,
          new THREE.LineBasicMaterial({
            color: "#ff4f7a",
            transparent: true,
            opacity: markerVariant === "elevated" ? 0.82 : 0.55,
          }),
        );
        hotspotGroup.add(stem);

        const pinGlow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: GLOW_SPRITE,
            color: HOTSPOT_COLOR,
            transparent: true,
            opacity: 0.96,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          }),
        );
        const glowScale = 0.26 + heatFactor * 0.11;
        pinGlow.scale.setScalar(glowScale);
        pinGlow.position.copy(pinPoint);
        pinGlow.userData = { baseScale: glowScale };
        hotspotGroup.add(pinGlow);
        pulseSprites.push(pinGlow);

        const pinCore = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: pinTexture,
            color: "#ffffff",
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false,
          }),
        );
        const scale = 0.16 + heatFactor * 0.055;
        pinCore.scale.set(scale * 0.78, scale, 1);
        pinCore.position.copy(pinPoint);
        pinCore.userData = {
          type: "hotspot",
          spot,
          hoverAnchor: pinCore,
        };
        hotspotGroup.add(pinCore);
        markerTargets.push(pinCore);
      });
    };

    const rebuildArcs = () => {
      arcGroup.clear();
      renderedArcs.forEach((arc, index) => {
        const fromSpot = hotspotLookup.get(arc.from);
        const toSpot = hotspotLookup.get(arc.to);
        if (!fromSpot || !toSpot) return;

        const from = latLngToVector3(fromSpot.lat, fromSpot.lng, GLOBE_RADIUS + 0.04);
        const to = latLngToVector3(toSpot.lat, toSpot.lng, GLOBE_RADIUS + 0.04);
        const curve = createArcCurve(from, to, Number(arc.intensity || 0.5), Boolean(arc.__manual));
        const tubeRadius = arc.__manual ? 0.022 : 0.012;
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 84, tubeRadius, 10, false),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(arc.color || "#ff4f7a"),
            transparent: true,
            opacity: arc.__manual ? 0.96 : 0.72,
          }),
        );
        arcGroup.add(tube);

        const particle = new THREE.Mesh(
          new THREE.SphereGeometry(arc.__manual ? 0.052 : 0.034, 16, 16),
          new THREE.MeshBasicMaterial({
            color: arc.__manual ? "#ffffff" : "#fff1f6",
            transparent: true,
            opacity: 0.98,
          }),
        );
        particle.userData = {
          curve,
          progress: (index % 6) / 6,
          speed: arc.__manual ? 0.0085 : 0.004 + (index % 3) * 0.0008,
        };
        arcGroup.add(particle);
      });
    };

    const handlePointerMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(markerTargets, false);
      const hovered = intersects[0]?.object || null;
      const nextSpot = hovered?.userData?.spot || null;
      hoveredSpotRef.current = nextSpot;
      setHoveredSpot(nextSpot);
      renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    };

    const handlePointerLeave = () => {
      hoveredSpotRef.current = null;
      setHoveredSpot(null);
      renderer.domElement.style.cursor = "grab";
    };

    const handlePointerClick = () => {
      if (!hoveredSpotRef.current) return;
      onSelectCountryRef.current(hoveredSpotRef.current);
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("click", handlePointerClick);

    async function loadMatrix() {
      try {
        const response = await fetch(WORLD_GEOJSON_URL);
        const geojson = await response.json();
        if (destroyed) return;
        const imageData = rasterizeWorld(geojson.features || []);
        const { geometry, glowGeometry: landGlowGeometry } = buildMatrixPoints(imageData);
        matrixPoints.geometry.dispose();
        glowPoints.geometry.dispose();
        matrixPoints.geometry = geometry;
        glowPoints.geometry = landGlowGeometry;
        matrixBasePositionsRef.current = geometry.getAttribute("position")?.array?.slice() || null;
        glowBasePositionsRef.current = landGlowGeometry.getAttribute("position")?.array?.slice() || null;
      } catch {
        // Leave the globe empty if the dataset fails to load.
      }
    }

    loadMatrix();
    rebuildHotspots();
    rebuildArcs();

    let targetQuaternion = null;
    if (manualArc?.from) {
      const fromSpot = hotspotLookup.get(manualArc.from);
      const toSpot = manualArc?.to ? hotspotLookup.get(manualArc.to) : null;
      if (fromSpot) {
        targetQuaternion = createFocusQuaternion(fromSpot, toSpot);
      }
    }

    const resize = () => {
      const nextWidth = mount.clientWidth || 960;
      const nextHeight = mount.clientHeight || 540;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener("resize", resize);

    controls.addEventListener("start", () => {
      controls.autoRotate = false;
    });

    const hoveredWorldPosition = new THREE.Vector3();
    const hoveredProjectedPosition = new THREE.Vector3();
    const clock = new THREE.Clock();
    const animate = () => {
      if (destroyed) return;
      const elapsed = clock.getElapsedTime();

      const matrixPositions = matrixPoints.geometry.getAttribute("position");
      const matrixBasePositions = matrixBasePositionsRef.current;
      if (matrixPositions && matrixBasePositions) {
        for (let index = 0; index < matrixPositions.count; index += 1) {
          const offset = index * 3;
          const baseX = matrixBasePositions[offset];
          const baseY = matrixBasePositions[offset + 1];
          const baseZ = matrixBasePositions[offset + 2];
          const normal = Math.sqrt(baseX * baseX + baseY * baseY + baseZ * baseZ) || 1;
          const wave =
            Math.sin(elapsed * 1.15 + baseY * 3.8 + baseX * 2.4 + baseZ * 1.8) * 0.009 +
            Math.sin(elapsed * 0.68 - baseX * 2.2 + baseZ * 1.4) * 0.005;
          const radius = 1 + wave;
          matrixPositions.array[offset] = (baseX / normal) * GLOBE_RADIUS * radius;
          matrixPositions.array[offset + 1] = (baseY / normal) * GLOBE_RADIUS * radius;
          matrixPositions.array[offset + 2] = (baseZ / normal) * GLOBE_RADIUS * radius;
        }
        matrixPositions.needsUpdate = true;
      }

      const glowPositions = glowPoints.geometry.getAttribute("position");
      const glowBasePositions = glowBasePositionsRef.current;
      if (glowPositions && glowBasePositions) {
        for (let index = 0; index < glowPositions.count; index += 1) {
          const offset = index * 3;
          const baseX = glowBasePositions[offset];
          const baseY = glowBasePositions[offset + 1];
          const baseZ = glowBasePositions[offset + 2];
          const normal = Math.sqrt(baseX * baseX + baseY * baseY + baseZ * baseZ) || 1;
          const wave =
            Math.sin(elapsed * 1.15 + baseY * 3.8 + baseX * 2.4 + baseZ * 1.8) * 0.011 +
            Math.sin(elapsed * 0.68 - baseX * 2.2 + baseZ * 1.4) * 0.006;
          const radius = 1 + wave;
          glowPositions.array[offset] = (baseX / normal) * GLOBE_RADIUS * radius;
          glowPositions.array[offset + 1] = (baseY / normal) * GLOBE_RADIUS * radius;
          glowPositions.array[offset + 2] = (baseZ / normal) * GLOBE_RADIUS * radius;
        }
        glowPositions.needsUpdate = true;
      }

      pulseSprites.forEach((pulse, index) => {
        const base = Number(pulse.userData.baseScale || 0.28);
        const wobble = 1 + Math.sin(elapsed * 2.3 + index * 0.34) * 0.22;
        pulse.scale.set(base * wobble, base * wobble, 1);
      });

      if (targetQuaternion) {
        globeGroup.quaternion.slerp(targetQuaternion, 0.045);
      }

      arcGroup.children.forEach((child) => {
        if (!child.userData?.curve) return;
        child.userData.progress = (child.userData.progress + child.userData.speed) % 1;
        child.position.copy(child.userData.curve.getPointAt(child.userData.progress));
      });

      if (tooltipRef.current && hoveredSpot) {
        const hoveredSprite = markerTargets.find((item) => item.userData?.spot?.id === hoveredSpot.id);
        if (hoveredSprite) {
          hoveredSprite.getWorldPosition(hoveredWorldPosition);
          hoveredProjectedPosition.copy(hoveredWorldPosition).project(camera);
          const x = (hoveredProjectedPosition.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
          const y = (-hoveredProjectedPosition.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
          tooltipRef.current.style.opacity = hoveredProjectedPosition.z < 1 ? "1" : "0";
          tooltipRef.current.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 10}px)`;
        }
      } else if (tooltipRef.current) {
        tooltipRef.current.style.opacity = "0";
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("click", handlePointerClick);
      controls.dispose();

      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) disposeMaterial(object.material);
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [focusedHotspotIds, hotspotLookup, hotspots, initialZoom, manualArc, mapKey, markerVariant, maxZoom, minZoom, renderedArcs]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#01030b]">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_48%,rgba(26,209,255,0.18),transparent_40%),radial-gradient(circle_at_50%_58%,rgba(255,45,85,0.08),transparent_62%),linear-gradient(180deg,#01030b_0%,#02040f_100%)]" />
      <div ref={mountRef} className="relative z-10 h-full w-full" />

      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-[1300] rounded-lg border border-white/20 bg-black/78 px-2.5 py-1.5 text-[11px] text-zinc-100 shadow-[0_12px_28px_rgba(0,0,0,0.5)] transition-opacity duration-100"
      >
        <div className="font-semibold">{hoveredSpot?.name || ""}</div>
        {hoveredSpot ? (
          <div className="mt-0.5 text-[10px] text-zinc-300">
            Heat {hoveredSpot.heat}/100 | Confidence {hoveredSpot.confidence}%
          </div>
        ) : null}
      </div>

      {instructionText ? (
        <div className="pointer-events-none absolute bottom-5 left-4 z-[1200]">
          <div className="select-none rounded-full border border-white/18 bg-black/55 px-4 py-2.5 text-[13px] font-medium text-zinc-100 backdrop-blur-sm">
            {instructionText}
          </div>
        </div>
      ) : null}
    </div>
  );
}
