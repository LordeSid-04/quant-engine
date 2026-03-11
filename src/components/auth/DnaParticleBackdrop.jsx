import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const HELIX_STRAND_A = [0x7f91b8, 0x57e4ff, 0xbed2ff];
const HELIX_STRAND_B = [0x9ba3ff, 0xc58dff, 0xf5ecff];
const HELIX_RUNG = [0xbed2ff, 0xf5ecff, 0xc58dff];

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function samplePalette(palette, value) {
  const t = clamp01(value);
  if (palette.length <= 1) {
    return new THREE.Color(palette[0] ?? 0xffffff);
  }

  const scaled = t * (palette.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(palette.length - 1, leftIndex + 1);
  const localT = scaled - leftIndex;
  return new THREE.Color(palette[leftIndex]).lerp(new THREE.Color(palette[rightIndex]), localT);
}

function pushCluster(samples, point, palette, clusterCount, spread, sizeRange, alpha, kind, progress) {
  for (let index = 0; index < clusterCount; index += 1) {
    const color = samplePalette(palette, clamp01(progress + (Math.random() - 0.5) * 0.16));
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
    );

    samples.push({
      position: point.clone().add(jitter),
      color,
      scale: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
      alpha: alpha * (0.86 + Math.random() * 0.18),
      kind,
      seed: Math.random(),
    });
  }
}

function createHelixSamples(isMobile) {
  const strandSteps = isMobile ? 118 : 164;
  const turns = isMobile ? 4.4 : 5.2;
  const radius = isMobile ? 1.08 : 1.34;
  const depthRadius = radius * 0.78;
  const verticalSpan = isMobile ? 6.7 : 8.8;
  const clusterCount = isMobile ? 4 : 6;
  const rungParticleCount = isMobile ? 6 : 8;
  const rungEvery = 2;
  const samples = [];

  for (let step = 0; step < strandSteps; step += 1) {
    const progress = step / Math.max(1, strandSteps - 1);
    const angle = progress * turns * Math.PI * 2;
    const y = (progress - 0.5) * verticalSpan;
    const radiusPulse = 1 + Math.sin(progress * Math.PI * 6) * 0.045;

    const strandA = new THREE.Vector3(
      Math.cos(angle) * radius * radiusPulse,
      y,
      Math.sin(angle) * depthRadius,
    );
    const strandB = new THREE.Vector3(
      Math.cos(angle + Math.PI) * radius * (1 - (radiusPulse - 1) * 0.35),
      y,
      Math.sin(angle + Math.PI) * depthRadius,
    );

    samples.push({
      position: strandA.clone(),
      color: samplePalette(HELIX_STRAND_A, progress),
      scale: isMobile ? 1.85 : 2.15,
      alpha: 0.98,
      kind: 1.15,
      seed: Math.random(),
    });
    samples.push({
      position: strandB.clone(),
      color: samplePalette(HELIX_STRAND_B, progress),
      scale: isMobile ? 1.85 : 2.15,
      alpha: 0.98,
      kind: 1.15,
      seed: Math.random(),
    });

    pushCluster(samples, strandA, HELIX_STRAND_A, clusterCount, isMobile ? 0.125 : 0.155, [0.95, 1.85], 0.88, 1, progress);
    pushCluster(samples, strandB, HELIX_STRAND_B, clusterCount, isMobile ? 0.125 : 0.155, [0.95, 1.85], 0.88, 1, progress);

    if (step % rungEvery === 0) {
      for (let rungIndex = 0; rungIndex < rungParticleCount; rungIndex += 1) {
        const rungT = rungParticleCount === 1 ? 0.5 : rungIndex / Math.max(1, rungParticleCount - 1);
        const point = strandA
          .clone()
          .lerp(strandB, rungT)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * (isMobile ? 0.05 : 0.07),
              (Math.random() - 0.5) * (isMobile ? 0.04 : 0.05),
              (Math.random() - 0.5) * (isMobile ? 0.04 : 0.06),
            ),
          );

        samples.push({
          position: point,
          color: samplePalette(HELIX_RUNG, (progress * 0.45) + (rungT * 0.55)),
          scale: (isMobile ? 0.85 : 1.02) + Math.random() * 0.58,
          alpha: 0.82 + Math.random() * 0.1,
          kind: 0.76,
          seed: Math.random(),
        });
      }
    }
  }

  return samples;
}

export default function DnaParticleBackdrop() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x04060b, 8.5, 24);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 48);
    camera.position.set(0, isMobile ? 0.05 : 0.14, isMobile ? 9.6 : 11);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isMobile,
        powerPreference: "high-performance",
      });
    } catch {
      return undefined;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const helixGroup = new THREE.Group();
    helixGroup.position.set(isMobile ? 0.1 : 2.35, isMobile ? -0.18 : 0.02, 0);
    scene.add(helixGroup);

    const samples = createHelixSamples(isMobile);
    const sampleCount = samples.length;

    const positions = new Float32Array(sampleCount * 3);
    const colors = new Float32Array(sampleCount * 3);
    const scales = new Float32Array(sampleCount);
    const alphas = new Float32Array(sampleCount);
    const seeds = new Float32Array(sampleCount);
    const kinds = new Float32Array(sampleCount);

    for (let index = 0; index < sampleCount; index += 1) {
      const sample = samples[index];
      const offset = index * 3;

      positions[offset] = sample.position.x;
      positions[offset + 1] = sample.position.y;
      positions[offset + 2] = sample.position.z;

      colors[offset] = sample.color.r;
      colors[offset + 1] = sample.color.g;
      colors[offset + 2] = sample.color.b;

      scales[index] = sample.scale;
      alphas[index] = sample.alpha;
      seeds[index] = sample.seed;
      kinds[index] = sample.kind;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));

    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uInteraction: { value: 0 },
      uPointSize: { value: isMobile ? 6.6 : 7.3 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime;
        uniform vec2 uPointer;
        uniform float uInteraction;
        uniform float uPointSize;
        attribute vec3 aColor;
        attribute float aScale;
        attribute float aAlpha;
        attribute float aSeed;
        attribute float aKind;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec3 transformed = position;
          float seed = aSeed * 6.28318530718;
          float sway = sin((uTime * 1.12) + transformed.y * 1.08 + seed) * (0.035 + aKind * 0.012);
          float pulse = cos((uTime * 1.85) + transformed.y * 0.82 + seed * 1.3) * (0.022 + aKind * 0.014);
          float spiral = sin((uTime * 0.88) + transformed.y * 0.48 + seed * 0.7);

          transformed.x += spiral * (0.045 + aKind * 0.017) * (1.0 + uInteraction * 0.6);
          transformed.z += sway * (1.0 + uInteraction * 0.4);
          transformed += normalize(position + vec3(0.0001)) * pulse;
          transformed.x += uPointer.x * (0.18 + aKind * 0.045);
          transformed.y += uPointer.y * (0.12 + aKind * 0.03);

          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          float depthScale = 300.0 / max(60.0, -mvPosition.z * 72.0);
          gl_PointSize = uPointSize * aScale * depthScale * (1.0 + uInteraction * 0.12);

          vColor = aColor * (1.04 + pulse * 2.4 + uInteraction * 0.08);
          vAlpha = aAlpha * (0.82 + uInteraction * 0.26);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float dist = length(uv);
          float core = smoothstep(0.55, 0.0, dist);
          float inner = smoothstep(0.3, 0.0, dist);
          float halo = smoothstep(0.5, 0.12, dist) * 0.52;

          float alpha = (core * 0.78 + inner * 0.92 + halo * 0.42) * vAlpha;
          if (alpha < 0.02) discard;

          vec3 finalColor = vColor * (1.04 + inner * 0.36 + halo * 0.12);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    helixGroup.add(points);

    const dustCount = isMobile ? 220 : 360;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    const dustLow = new THREE.Color(0x7f91b8);
    const dustHigh = new THREE.Color(0xc58dff);

    for (let index = 0; index < dustCount; index += 1) {
      const offset = index * 3;
      dustPositions[offset] = (Math.random() - 0.5) * (isMobile ? 12 : 18);
      dustPositions[offset + 1] = (Math.random() - 0.5) * (isMobile ? 9 : 12);
      dustPositions[offset + 2] = (Math.random() - 0.5) * (isMobile ? 8 : 12);

      const color = dustLow.clone().lerp(dustHigh, Math.random());
      dustColors[offset] = color.r;
      dustColors[offset + 1] = color.g;
      dustColors[offset + 2] = color.b;
    }

    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));

    const dustMaterial = new THREE.PointsMaterial({
      size: isMobile ? 0.03 : 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.position.set(isMobile ? 0 : 1.2, -0.2, -2.8);
    scene.add(dust);

    let width = 1;
    let height = 1;
    let targetRotationX = isMobile ? 0.32 : 0.26;
    let targetRotationY = isMobile ? 0.12 : 0.2;
    let targetRotationZ = isMobile ? -0.64 : -0.72;
    let targetGroupX = isMobile ? 0.08 : 2.35;
    let targetGroupY = isMobile ? -0.18 : 0.02;
    let interactionBoost = reducedMotion ? 0.18 : 0.36;
    let activeInteraction = 0;
    let rafId = 0;

    const resize = () => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const onPointerMove = (event) => {
      const pointerX = (event.clientX / Math.max(window.innerWidth, 1)) - 0.5;
      const pointerY = (event.clientY / Math.max(window.innerHeight, 1)) - 0.5;

      uniforms.uPointer.value.set(pointerX * 0.6, pointerY * -0.45);
      targetRotationY = 0.18 + pointerX * 0.95;
      targetRotationX = (isMobile ? 0.32 : 0.26) + pointerY * 0.34;
      targetRotationZ = (isMobile ? -0.64 : -0.72) - pointerX * 0.18;
      targetGroupX = (isMobile ? 0.08 : 2.35) + pointerX * (isMobile ? 0.4 : 0.85);
      targetGroupY = (isMobile ? -0.18 : 0.02) - pointerY * 0.55;
      interactionBoost = 1;
    };

    const onPointerLeave = () => {
      uniforms.uPointer.value.set(0, 0);
      targetRotationX = isMobile ? 0.32 : 0.26;
      targetRotationY = isMobile ? 0.12 : 0.2;
      targetRotationZ = isMobile ? -0.64 : -0.72;
      targetGroupX = isMobile ? 0.08 : 2.35;
      targetGroupY = isMobile ? -0.18 : 0.02;
      interactionBoost = reducedMotion ? 0.14 : 0.28;
    };

    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      uniforms.uTime.value = elapsed;

      interactionBoost += ((reducedMotion ? 0.08 : 0.22) - interactionBoost) * 0.045;
      activeInteraction += (interactionBoost - activeInteraction) * 0.05;
      uniforms.uInteraction.value = activeInteraction;

      helixGroup.rotation.x += (targetRotationX - helixGroup.rotation.x) * 0.045;
      helixGroup.rotation.y += (targetRotationY - helixGroup.rotation.y) * 0.045;
      helixGroup.rotation.z += (targetRotationZ - helixGroup.rotation.z) * 0.04;
      helixGroup.rotation.y += reducedMotion ? 0.00055 : 0.00135;
      helixGroup.position.x += (targetGroupX - helixGroup.position.x) * 0.04;
      helixGroup.position.y += (targetGroupY - helixGroup.position.y) * 0.04;
      helixGroup.position.z = Math.sin(elapsed * 0.6) * 0.12;

      dust.rotation.y += reducedMotion ? 0.00018 : 0.00048;
      dust.rotation.x = Math.sin(elapsed * 0.25) * 0.04;
      dustMaterial.opacity = 0.26 + activeInteraction * 0.08;

      camera.position.x += (((uniforms.uPointer.value.x * 0.38)) - camera.position.x) * 0.03;
      camera.position.y += (((uniforms.uPointer.value.y * 0.24) + (isMobile ? 0.02 : 0.08)) - camera.position.y) * 0.03;
      camera.lookAt(isMobile ? 0.15 : 0.9, -0.05, 0);

      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);

      geometry.dispose();
      material.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute inset-y-0 left-0 w-[68%] bg-[radial-gradient(72%_76%_at_26%_50%,rgba(2,4,10,0.82),rgba(2,4,10,0.36)_60%,transparent_86%)] sm:w-[54%]" />
      <div className="absolute inset-0 bg-[radial-gradient(44%_52%_at_76%_42%,rgba(140,188,255,0.2),transparent_74%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,10,0.18)_0%,rgba(4,5,10,0.42)_56%,rgba(4,5,10,0.68)_100%)]" />
    </div>
  );
}
