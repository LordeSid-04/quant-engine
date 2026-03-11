import React, { useEffect, useMemo, useRef, useState } from "react";
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

const FEATURE_BADGES = [
  { id: "signal", label: "Signal Desk", mode: "pulse", phase: 0 },
  { id: "scenario", label: "Scenario Lab", mode: "flask", phase: 0.33 },
  { id: "memory", label: "Memory Vault", mode: "vault", phase: 0.66 },
];

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(87,228,255,0.16),transparent_34%),radial-gradient(circle_at_76%_8%,rgba(197,141,255,0.18),transparent_34%),radial-gradient(circle_at_50%_72%,rgba(155,163,255,0.1),transparent_46%),linear-gradient(180deg,#04060d_0%,#02040a_52%,#020309_100%)]" />
      <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:34px_34px]" />

      <AtlasParticleWord />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-end px-4 pb-[7vh] sm:pb-[9vh]">
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

        <div className="mt-5 flex w-full max-w-[980px] flex-wrap items-center justify-center gap-3 sm:mt-6">
          {FEATURE_BADGES.map((feature) => (
            <FeatureParticleBadge key={feature.id} label={feature.label} mode={feature.mode} phaseShift={feature.phase} />
          ))}
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
    <section className="w-full max-w-[460px] rounded-[30px] border border-white/12 bg-black/45 p-4 shadow-[0_36px_120px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-6">
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

function AtlasParticleWord() {
  const canvasRef = useRef(null);
  const particlePalette = useMemo(() => PARTICLE_GRADIENT, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let rafId = 0;
    let particles = [];
    let targetPoints = [];

    const buildTargets = () => {
      const parent = canvas.parentElement;
      const width = parent ? parent.clientWidth : window.innerWidth;
      const height = parent ? parent.clientHeight : Math.floor(window.innerHeight * 0.46);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const mask = document.createElement("canvas");
      mask.width = width;
      mask.height = height;
      const mtx = mask.getContext("2d");
      if (!mtx) return;
      mtx.clearRect(0, 0, width, height);
      mtx.textAlign = "center";
      mtx.textBaseline = "middle";
      mtx.font = `700 ${Math.max(64, Math.min(width * 0.17, 164))}px "Segoe UI", sans-serif`;
      mtx.fillStyle = "#fff";
      mtx.fillText("ATLAS", width * 0.5, height * 0.56);

      const image = mtx.getImageData(0, 0, width, height).data;
      const step = width > 900 ? 5 : 4;
      const nextTargets = [];
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const alpha = image[(y * width + x) * 4 + 3];
          if (alpha > 140) nextTargets.push({ x, y });
        }
      }
      targetPoints = nextTargets;

      const particleCount = Math.min(2200, Math.max(900, Math.floor(nextTargets.length * 1.25)));
      particles = Array.from({ length: particleCount }, (_, index) => {
        const px = Math.random() * width;
        const py = Math.random() * height;
        return {
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          size: 0.8 + Math.random() * 1.5,
          color: particlePalette[index % particlePalette.length],
          drift: Math.random() * Math.PI * 2,
          orbit: 8 + Math.random() * 26,
        };
      });
    };

    const animate = (time) => {
      const parent = canvas.parentElement;
      const width = parent ? parent.clientWidth : window.innerWidth;
      const height = parent ? parent.clientHeight : Math.floor(window.innerHeight * 0.46);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      const seconds = time * 0.001;
      const cycle = ((seconds / 4.8) % 1 + 1) % 1;
      const formStrength = Math.sin(cycle * Math.PI) ** 2;
      const heartbeat = 1 + 0.08 * Math.max(0, Math.sin(seconds * 4.4)) ** 2;
      const pulseGlow = 0.35 + formStrength * 0.5;

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        const point = targetPoints[i % targetPoints.length];
        const wobbleX = Math.cos(seconds * 1.9 + particle.drift) * particle.orbit * (1 - formStrength);
        const wobbleY = Math.sin(seconds * 2.1 + particle.drift) * particle.orbit * (1 - formStrength);

        const targetX = point ? width * 0.5 + (point.x - width * 0.5) * heartbeat + wobbleX : width * 0.5 + wobbleX;
        const targetY = point ? height * 0.54 + (point.y - height * 0.54) * heartbeat + wobbleY : height * 0.54 + wobbleY;

        const pull = 0.015 + 0.07 * formStrength;
        particle.vx += (targetX - particle.x) * pull;
        particle.vy += (targetY - particle.y) * pull;
        particle.vx *= 0.89;
        particle.vy *= 0.89;
        particle.x += particle.vx;
        particle.y += particle.vy;

        context.fillStyle = particle.color;
        context.globalAlpha = 0.28 + formStrength * 0.62;
        context.shadowBlur = 8 + 20 * pulseGlow;
        context.shadowColor = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size + formStrength * 0.8, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      rafId = window.requestAnimationFrame(animate);
    };

    buildTargets();
    rafId = window.requestAnimationFrame(animate);
    const onResize = () => buildTargets();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [particlePalette]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[44vh] sm:h-[48vh]">
      <canvas ref={canvasRef} className="h-full w-full opacity-95" aria-hidden />
    </div>
  );
}

function FeatureParticleBadge({ label, mode, phaseShift }) {
  const canvasRef = useRef(null);
  const palette = useMemo(() => PARTICLE_GRADIENT, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let rafId = 0;
    let particles = [];
    let targets = [];

    const drawFeatureMask = (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "#fff";
      ctx.fillStyle = "#fff";

      if (mode === "pulse") {
        const cx = 24;
        const cy = 24;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(38, 26);
        ctx.lineTo(45, 20);
        ctx.lineTo(51, 30);
        ctx.lineTo(57, 22);
        ctx.lineTo(64, 26);
        ctx.stroke();
      } else if (mode === "flask") {
        ctx.beginPath();
        ctx.moveTo(16, 13);
        ctx.lineTo(30, 13);
        ctx.lineTo(30, 18);
        ctx.lineTo(26, 24);
        ctx.lineTo(36, 39);
        ctx.quadraticCurveTo(39, 44, 34, 46);
        ctx.lineTo(12, 46);
        ctx.quadraticCurveTo(7, 44, 10, 39);
        ctx.lineTo(20, 24);
        ctx.lineTo(16, 18);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(12, 38);
        ctx.quadraticCurveTo(22, 34, 34, 39);
        ctx.stroke();
      } else {
        ctx.strokeRect(10, 16, 30, 24);
        ctx.beginPath();
        ctx.moveTo(20, 16);
        ctx.lineTo(20, 12);
        ctx.quadraticCurveTo(25, 7, 30, 12);
        ctx.lineTo(30, 16);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(25, 28, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = '600 15px "Segoe UI", sans-serif';
      ctx.textBaseline = "middle";
      ctx.fillText(label, 76, 26);
    };

    const build = () => {
      const width = 260;
      const height = 52;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const mask = document.createElement("canvas");
      mask.width = width;
      mask.height = height;
      const mtx = mask.getContext("2d");
      if (!mtx) return;
      drawFeatureMask(mtx, width, height);
      const image = mtx.getImageData(0, 0, width, height).data;
      const nextTargets = [];
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const alpha = image[(y * width + x) * 4 + 3];
          if (alpha > 120) nextTargets.push({ x, y });
        }
      }
      targets = nextTargets;

      particles = Array.from({ length: Math.min(420, targets.length + 130) }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: 0.65 + Math.random() * 1.1,
        color: palette[index % palette.length],
        seed: Math.random() * Math.PI * 2,
      }));
    };

    const animate = (time) => {
      const width = 260;
      const height = 52;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const seconds = time * 0.001;
      const cycle = ((seconds / 5.2 + phaseShift) % 1 + 1) % 1;
      const assemble = Math.sin(cycle * Math.PI) ** 2;

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        const point = targets[i % targets.length];
        const drift = 9 * (1 - assemble);
        const targetX = point ? point.x + Math.cos(seconds + particle.seed) * drift : width * 0.5;
        const targetY = point ? point.y + Math.sin(seconds * 1.2 + particle.seed) * drift : height * 0.5;

        particle.vx += (targetX - particle.x) * (0.03 + 0.03 * assemble);
        particle.vy += (targetY - particle.y) * (0.03 + 0.03 * assemble);
        particle.vx *= 0.84;
        particle.vy *= 0.84;
        particle.x += particle.vx;
        particle.y += particle.vy;

        context.fillStyle = particle.color;
        context.globalAlpha = 0.28 + assemble * 0.62;
        context.shadowBlur = 10 + 10 * assemble;
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

    build();
    rafId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [label, mode, palette, phaseShift]);

  return (
    <div className="group relative overflow-hidden rounded-[16px] border border-white/10 bg-black/35 px-2 py-1 backdrop-blur-xl">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(87,228,255,0.05),rgba(197,141,255,0.08),rgba(240,182,255,0.05))] opacity-90" />
      <canvas ref={canvasRef} className="relative z-[2] h-[52px] w-[260px]" aria-hidden />
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
