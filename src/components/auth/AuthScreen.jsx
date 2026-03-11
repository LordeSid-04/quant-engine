import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowRight, LogIn, UserPlus } from "lucide-react";

import AtlasMark from "@/components/brand/AtlasMark";
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
const INFO_CHIPS = ["Signal Desk", "Scenario Lab", "Memory Vault"];

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
    <div className="relative min-h-screen overflow-hidden bg-[#03050b] text-zinc-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(87,228,255,0.16),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(197,141,255,0.16),transparent_36%),radial-gradient(circle_at_50%_74%,rgba(155,163,255,0.09),transparent_48%),linear-gradient(180deg,#04060d_0%,#02040a_52%,#020309_100%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />

      <MoleculeBackdrop />

      <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-3 sm:left-6 sm:top-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/45 shadow-[0_12px_34px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <AtlasMark className="h-7 w-7" />
        </div>
        <AtlasParticleWordmark text="ATLAS" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-[10vh] sm:px-6">
        <div className="w-full max-w-[520px]">
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

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-center backdrop-blur-xl">
            <p className="text-sm text-zinc-200">Track macro themes, understand risk, and act with confidence.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {INFO_CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-cyan-100"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
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
    <section className="w-full rounded-[30px] border border-white/12 bg-black/45 p-4 shadow-[0_36px_120px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-6">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">Atlas Access</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Welcome to Atlas</h1>
        <p className="mt-1 text-sm text-zinc-300">Use your account to continue to live macro intelligence and risk tools.</p>
      </div>

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

    const width = 220;
    const height = 56;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
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
    mtx.font = '700 34px "Segoe UI", sans-serif';
    mtx.fillStyle = "#ffffff";
    mtx.fillText(text, width * 0.5, height * 0.53);

    const image = mtx.getImageData(0, 0, width, height).data;
    const targets = [];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const alpha = image[(y * width + x) * 4 + 3];
        if (alpha > 110) {
          targets.push({ x, y });
        }
      }
    }

    if (!targets.length) return undefined;

    const particleCount = Math.min(460, Math.max(220, targets.length));
    const particles = Array.from({ length: particleCount }, (_, index) => ({
      x: width * 0.5 + (Math.random() - 0.5) * 50,
      y: height * 0.5 + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0,
      size: 0.9 + Math.random() * 1.4,
      color: palette[index % palette.length],
      seed: Math.random() * Math.PI * 2,
    }));

    let rafId = 0;
    const animate = (time) => {
      const seconds = time * 0.001;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        const target = targets[i % targets.length];
        const jitter = 0.9;
        const targetX = target.x + Math.cos(seconds * 1.2 + particle.seed) * jitter;
        const targetY = target.y + Math.sin(seconds * 1.35 + particle.seed) * jitter;

        particle.vx += (targetX - particle.x) * 0.055;
        particle.vy += (targetY - particle.y) * 0.055;
        particle.vx *= 0.78;
        particle.vy *= 0.78;
        particle.x += particle.vx;
        particle.y += particle.vy;

        context.fillStyle = particle.color;
        context.globalAlpha = 0.82;
        context.shadowBlur = 6;
        context.shadowColor = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [palette, text]);

  return (
    <div className="relative h-[56px] w-[220px] overflow-hidden rounded-lg border border-white/10 bg-black/25 px-1 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[34px] font-bold tracking-[0.24em] text-white/18">
        {text}
      </div>
      <canvas ref={canvasRef} className="relative z-[2] h-[56px] w-[220px]" aria-hidden />
    </div>
  );
}

function MoleculeBackdrop() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    camera.position.set(0, 0, 6.6);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xbfd3ff, 0.52);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x57e4ff, 0.72);
    keyLight.position.set(3.2, 2.7, 4.1);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc58dff, 0.58);
    fillLight.position.set(-2.6, -1.8, 3.8);
    scene.add(fillLight);

    const molecule = new THREE.Group();
    scene.add(molecule);

    const coreGeometry = new THREE.IcosahedronGeometry(1.32, 1);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ba3ff,
      emissive: 0x10182e,
      metalness: 0.18,
      roughness: 0.42,
      flatShading: true,
      transparent: true,
      opacity: 0.94,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    molecule.add(coreMesh);

    const spikeGeometry = new THREE.ConeGeometry(0.054, 0.72, 8, 1);
    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: 0x57e4ff,
      emissive: 0x1a587b,
      metalness: 0.16,
      roughness: 0.5,
      flatShading: true,
    });

    const gradientStart = new THREE.Color(0x57e4ff);
    const gradientEnd = new THREE.Color(0xc58dff);
    const up = new THREE.Vector3(0, 1, 0);
    const spikeCount = 70;

    for (let index = 0; index < spikeCount; index += 1) {
      const t = index / Math.max(1, spikeCount - 1);
      const y = 1 - t * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = index * 2.399963;
      const direction = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).normalize();

      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial.clone());
      spike.position.copy(direction.clone().multiplyScalar(1.56));
      spike.quaternion.setFromUnitVectors(up, direction);
      const spikeScale = 1 + (index % 5) * 0.1;
      spike.scale.set(1, spikeScale, 1);
      spike.material.color.copy(gradientStart.clone().lerp(gradientEnd, t));
      molecule.add(spike);
    }

    const orbitGeometry = new THREE.BufferGeometry();
    const orbitCount = 120;
    const orbitPositions = new Float32Array(orbitCount * 3);
    for (let i = 0; i < orbitCount; i += 1) {
      const angle = (i / orbitCount) * Math.PI * 2;
      const ring = 1.9 + 0.35 * Math.sin(i * 1.27);
      orbitPositions[i * 3] = Math.cos(angle) * ring;
      orbitPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.7;
      orbitPositions[i * 3 + 2] = Math.sin(angle) * ring;
    }
    orbitGeometry.setAttribute("position", new THREE.BufferAttribute(orbitPositions, 3));
    const orbitMaterial = new THREE.PointsMaterial({
      color: 0xadf2ff,
      size: 0.03,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const orbitPoints = new THREE.Points(orbitGeometry, orbitMaterial);
    molecule.add(orbitPoints);

    let width = 1;
    let height = 1;
    let targetRotX = -0.12;
    let targetRotY = 0.18;
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
      targetRotY = nx * 0.52;
      targetRotX = ny * 0.32;
    };

    const animate = () => {
      molecule.rotation.y += (targetRotY - molecule.rotation.y) * 0.028;
      molecule.rotation.x += (targetRotX - molecule.rotation.x) * 0.028;
      molecule.rotation.y += 0.0022;
      orbitPoints.rotation.y -= 0.0012;
      orbitPoints.rotation.x += 0.0006;

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
      orbitGeometry.dispose();
      orbitMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      spikeGeometry.dispose();
      molecule.children.forEach((child) => {
        if (child.isMesh && child.material) {
          child.material.dispose?.();
        }
      });
      renderer.dispose();
      host.innerHTML = "";
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      <div
        ref={hostRef}
        className="absolute left-1/2 top-[43%] h-[52vmin] w-[52vmin] min-h-[260px] min-w-[260px] -translate-x-1/2 -translate-y-1/2 opacity-85 sm:h-[500px] sm:w-[500px]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(146,148,255,0.2),transparent_44%)]" />
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
