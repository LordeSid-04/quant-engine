import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowRight, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";

const LOGIN_DEFAULTS = {
  email: "",
  password: "",
};

const SIGNUP_DEFAULTS = {
  full_name: "",
  email: "",
  password: "",
};

const PARTICLE_GRADIENT = ["#57e4ff", "#78d4ff", "#9ba3ff", "#c58dff", "#f0b6ff", "#adf2ff"];

export default function AuthScreen() {
  const { login, signup, authError } = useAuth();
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState(LOGIN_DEFAULTS);
  const [signupForm, setSignupForm] = useState(SIGNUP_DEFAULTS);
  const [errorMessage, setErrorMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const runAction = async (action, work) => {
    setBusyAction(action);
    setErrorMessage("");
    try {
      await work();
    } catch (error) {
      setErrorMessage(error?.message || "Authentication failed.");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="atlas-app-shell relative min-h-screen overflow-hidden text-zinc-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-26%] left-[-18%] h-[620px] w-[620px] rounded-full bg-white/[0.03] blur-[155px] drift-slow" />
        <div
          className="absolute bottom-[-24%] right-[-16%] h-[560px] w-[560px] rounded-full bg-white/[0.025] blur-[135px] drift-slow"
          style={{ animationDelay: "-7s" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.025),transparent_48%)]" />
      </div>

      <HemisphereParticleBackdrop />

      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
        <AtlasParticleWordmark text="ATLAS" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-[12vh] sm:px-6">
        <div className="w-full max-w-[420px]">
          <AuthPanel
            mode={mode}
            setMode={setMode}
            loginForm={loginForm}
            setLoginForm={setLoginForm}
            signupForm={signupForm}
            setSignupForm={setSignupForm}
            busyAction={busyAction}
            runAction={runAction}
            login={login}
            signup={signup}
            errorMessage={errorMessage || authError}
          />
        </div>
      </div>
    </div>
  );
}

function AuthPanel({
  mode,
  setMode,
  loginForm,
  setLoginForm,
  signupForm,
  setSignupForm,
  busyAction,
  runAction,
  login,
  signup,
  errorMessage,
}) {
  return (
    <section className="w-full">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
        <ModeButton active={mode === "login"} onClick={() => setMode("login")} icon={LogIn} label="Log In" />
        <ModeButton active={mode === "signup"} onClick={() => setMode("signup")} icon={UserPlus} label="Sign Up" />
      </div>

      <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        {mode === "login" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              runAction("login", () => login(loginForm));
            }}
          >
            <FieldLabel label="Email" />
            <StyledInput
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@atlasintel.com"
              autoComplete="email"
            />
            <FieldLabel label="Password" />
            <StyledInput
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-2xl bg-zinc-50 text-[15px] font-semibold text-zinc-950 hover:bg-white"
              disabled={busyAction !== ""}
            >
              {busyAction === "login" ? "Signing In..." : "Log In"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              runAction("signup", () => signup(signupForm));
            }}
          >
            <FieldLabel label="Full name" />
            <StyledInput
              type="text"
              value={signupForm.full_name}
              onChange={(event) => setSignupForm((current) => ({ ...current, full_name: event.target.value }))}
              placeholder="Atlas Analyst"
              autoComplete="name"
            />
            <FieldLabel label="Email" />
            <StyledInput
              type="email"
              value={signupForm.email}
              onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@atlasintel.com"
              autoComplete="email"
            />
            <FieldLabel label="Password" />
            <StyledInput
              type="password"
              value={signupForm.password}
              onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-2xl bg-zinc-50 text-[15px] font-semibold text-zinc-950 hover:bg-white"
              disabled={busyAction !== ""}
            >
              {busyAction === "signup" ? "Creating Account..." : "Create Account"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AtlasParticleWordmark({ text = "ATLAS" }) {
  const canvasRef = useRef(null);
  const palette = useMemo(() => PARTICLE_GRADIENT, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;

    const width = 252;
    const height = 64;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.4);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = height;
    const mtx = mask.getContext("2d");
    if (!mtx) return undefined;
    mtx.clearRect(0, 0, width, height);
    mtx.textAlign = "center";
    mtx.textBaseline = "middle";
    mtx.font = '700 38px "Segoe UI", sans-serif';
    mtx.fillStyle = "#ffffff";
    mtx.fillText(text, width * 0.5, height * 0.54);

    const image = mtx.getImageData(0, 0, width, height).data;
    const targets = [];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const alpha = image[(y * width + x) * 4 + 3];
        if (alpha > 120) {
          targets.push({ x, y });
        }
      }
    }
    if (!targets.length) return undefined;

    const particleCount = Math.min(760, Math.max(460, targets.length));
    const particles = Array.from({ length: particleCount }, (_, index) => ({
      x: width * 0.5 + (Math.random() - 0.5) * 120,
      y: height * 0.5 + (Math.random() - 0.5) * 68,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: 1 + Math.random() * 1.6,
      color: palette[index % palette.length],
      seed: Math.random() * Math.PI * 2,
    }));

    const pointer = { x: -9999, y: -9999, active: false };
    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    let rafId = 0;
    const animate = (time) => {
      const seconds = time * 0.001;
      const cycle = (Math.sin(seconds * 0.95) + 1) * 0.5;
      const gatherStrength = 0.42 + cycle * 0.58;

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const target = targets[index % targets.length];

        const spreadX = Math.cos(seconds * 1.18 + particle.seed) * 12 * (1 - gatherStrength);
        const spreadY = Math.sin(seconds * 1.32 + particle.seed) * 9 * (1 - gatherStrength);
        const targetX = target.x + spreadX;
        const targetY = target.y + spreadY;

        particle.vx += (targetX - particle.x) * (0.036 + gatherStrength * 0.05);
        particle.vy += (targetY - particle.y) * (0.036 + gatherStrength * 0.05);

        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq > 0.0001 && distanceSq < 2400) {
            const strength = (1 - distanceSq / 2400) * 0.8;
            particle.vx += (dx / Math.sqrt(distanceSq)) * strength;
            particle.vy += (dy / Math.sqrt(distanceSq)) * strength;
          }
        }

        particle.vx *= 0.8;
        particle.vy *= 0.8;
        particle.x += particle.vx;
        particle.y += particle.vy;

        context.fillStyle = particle.color;
        context.globalAlpha = 0.8;
        context.shadowBlur = 8;
        context.shadowColor = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, [palette, text]);

  return <canvas ref={canvasRef} className="h-[64px] w-[252px]" aria-hidden />;
}

function HemisphereParticleBackdrop() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    camera.position.set(0, 0.2, 8.8);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xdde5ff, 0.66);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x57e4ff, 0.64);
    keyLight.position.set(3.8, 3.2, 4.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc58dff, 0.56);
    rimLight.position.set(-4.2, 2.4, 3.1);
    scene.add(rimLight);

    const sphereGroup = new THREE.Group();
    sphereGroup.position.y = -2.35;
    scene.add(sphereGroup);

    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 1700 : 2600;
    const radius = 2.85;

    const basePositions = new Float32Array(particleCount * 3);
    const drawPositions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount);

    const c0 = new THREE.Color(0x57e4ff);
    const c1 = new THREE.Color(0x9ba3ff);
    const c2 = new THREE.Color(0xc58dff);

    for (let index = 0; index < particleCount; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      const yNorm = Math.pow(Math.random(), 0.65);
      const radial = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const distance = radius + (Math.random() - 0.5) * 0.08;

      const x = Math.cos(theta) * radial * distance;
      const y = yNorm * distance;
      const z = Math.sin(theta) * radial * distance;

      basePositions[index * 3] = x;
      basePositions[index * 3 + 1] = y;
      basePositions[index * 3 + 2] = z;

      drawPositions[index * 3] = x;
      drawPositions[index * 3 + 1] = y;
      drawPositions[index * 3 + 2] = z;

      const blendA = c0.clone().lerp(c1, yNorm);
      const blendB = c1.clone().lerp(c2, (Math.sin(theta) + 1) * 0.5);
      blendA.lerp(blendB, 0.5);
      colors[index * 3] = blendA.r;
      colors[index * 3 + 1] = blendA.g;
      colors[index * 3 + 2] = blendA.b;

      seeds[index] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(drawPositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: isMobile ? 0.042 : 0.036,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const particleCloud = new THREE.Points(geometry, material);
    sphereGroup.add(particleCloud);

    const equatorGeometry = new THREE.RingGeometry(radius * 0.98, radius * 1.02, 120);
    const equatorMaterial = new THREE.MeshBasicMaterial({
      color: 0xa6ccff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const equator = new THREE.Mesh(equatorGeometry, equatorMaterial);
    equator.rotation.x = Math.PI / 2;
    equator.position.y = 0;
    sphereGroup.add(equator);

    let width = 1;
    let height = 1;
    let targetRotY = 0;
    let targetRotX = -0.1;
    let rafId = 0;

    const resize = () => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const onPointerMove = (event) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      targetRotY = nx * 0.75;
      targetRotX = -0.12 + ny * 0.34;
    };

    const animate = (time) => {
      const t = time * 0.001;
      const positionAttr = geometry.getAttribute("position");

      for (let index = 0; index < particleCount; index += 1) {
        const baseX = basePositions[index * 3];
        const baseY = basePositions[index * 3 + 1];
        const baseZ = basePositions[index * 3 + 2];
        const wave = Math.sin(t * 1.55 + seeds[index] * 5.2) * 0.05;

        drawPositions[index * 3] = baseX * (1 + wave * 0.48);
        drawPositions[index * 3 + 1] = baseY + wave * 0.17;
        drawPositions[index * 3 + 2] = baseZ * (1 + wave * 0.48);
      }
      positionAttr.needsUpdate = true;

      sphereGroup.rotation.y += (targetRotY - sphereGroup.rotation.y) * 0.03;
      sphereGroup.rotation.x += (targetRotX - sphereGroup.rotation.x) * 0.03;
      sphereGroup.rotation.y += 0.0019;
      equator.rotation.z += 0.0014;

      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      geometry.dispose();
      material.dispose();
      equatorGeometry.dispose();
      equatorMaterial.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[72vh]">
      <div ref={hostRef} className="absolute inset-x-0 bottom-[-14vh] h-[86vh]" />
      <div className="absolute inset-x-0 bottom-0 h-[60vh] bg-[radial-gradient(60%_72%_at_50%_100%,rgba(146,148,255,0.22),transparent_76%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[24vh] bg-[linear-gradient(180deg,transparent_0%,rgba(3,3,3,0.28)_72%,rgba(3,3,3,0.45)_100%)]" />
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-sm font-semibold transition ${
        active ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function FieldLabel({ label }) {
  return <label className="block text-sm font-medium text-zinc-300">{label}</label>;
}

function StyledInput(props) {
  return (
    <Input
      {...props}
      className="mt-2 h-12 rounded-2xl border-white/10 bg-black/35 px-4 text-base text-zinc-50 placeholder:text-zinc-500 focus-visible:ring-white/40"
    />
  );
}
