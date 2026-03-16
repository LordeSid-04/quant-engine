import React, { useState } from "react";
import { ArrowRight, LogIn, UserPlus } from "lucide-react";
import DnaParticleBackdrop from "@/components/auth/DnaParticleBackdrop";
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

function authActionErrorMessage(error) {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) {
    return "Authentication failed.";
  }
  if (rawMessage.toLowerCase().includes("timed out")) {
    return "Authentication is taking longer than expected. Please try again in a moment.";
  }
  return rawMessage;
}

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
      setErrorMessage(authActionErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[#06070b] text-zinc-50">
      <DnaParticleBackdrop />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(81,129,255,0.18),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(95,211,190,0.14),transparent_28%),linear-gradient(180deg,#07080d_0%,#05060a_52%,#030407_100%)]" />
      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1440px] flex-col justify-center px-5 py-5 sm:px-8 sm:py-6 lg:grid lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:px-10 lg:py-8">
        <section className="flex h-full items-center">
          <div className="mx-auto flex w-full max-w-[620px] flex-col justify-center gap-7 py-14">
            <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-white/14 bg-[#11151d]/92 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
              <AtlasMark className="h-7 w-7 shrink-0 text-zinc-50 drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]" />
              <div>
                <div className="text-[1.35rem] font-semibold tracking-[0.34em] text-zinc-50">ATLAS</div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-300">Macro Intelligence System</div>
              </div>
            </div>

            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold leading-[0.95] text-zinc-50 sm:text-5xl lg:text-[4.4rem]">
                Sign in to the Atlas research workspace.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                Use your Atlas account to access World Pulse, Scenario Lab, and the Memory Vault.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FeatureCard title="News Navigator Memory" body="Prompt runs create durable records that can be reopened in Memory Vault." />
              <FeatureCard title="Secure Sessions" body="Authentication stays fast locally and carries seamlessly across the workspace." />
              <FeatureCard title="Research Continuity" body="Saved sessions carry prompt context, model output, and linked sources into Memory Vault." />
            </div>
          </div>
        </section>

        <section className="relative flex h-full items-center justify-center">
          <div className="w-full max-w-[520px] rounded-[32px] border border-white/12 bg-black/45 p-4 shadow-[0_35px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-6 lg:p-8">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              <ModeButton active={mode === "login"} onClick={() => setMode("login")} icon={LogIn} label="Log In" />
              <ModeButton active={mode === "signup"} onClick={() => setMode("signup")} icon={UserPlus} label="Sign Up" />
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-5 sm:px-6 sm:py-6">
              <div className="mb-5">
                <h2 className="text-2xl font-semibold text-zinc-50">{mode === "login" ? "Welcome back" : "Create your Atlas account"}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {mode === "login"
                    ? "Sign in with your email and password to continue."
                    : "Create an account that is ready to use immediately in this workspace."}
                </p>
              </div>

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

              {(errorMessage || authError) ? (
                <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {errorMessage || authError}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
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
      className="mt-2 h-12 rounded-2xl border-white/10 bg-black/35 px-4 text-base text-zinc-50 shadow-[inset_0_0_0_1000px_rgba(10,10,14,0.38)] placeholder:text-zinc-500 focus-visible:ring-white/40 autofill:border-white/10 autofill:[-webkit-text-fill-color:#f8fafc] autofill:shadow-[inset_0_0_0_1000px_rgba(10,10,14,0.38)]"
    />
  );
}

function FeatureCard({ title, body }) {
  const titleClassName =
    title === "News Navigator Memory"
      ? "text-rose-300"
      : title === "Supabase Sessions"
        ? "text-cyan-300"
        : "text-amber-300";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className={`text-sm font-semibold uppercase tracking-[0.18em] ${titleClassName}`}>{title}</div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
    </div>
  );
}
