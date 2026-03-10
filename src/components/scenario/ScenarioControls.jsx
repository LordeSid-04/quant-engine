import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Play, RotateCcw } from "lucide-react";

const triggerStyle =
  "h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 hover:border-white/25 hover:bg-black/45 focus:ring-0";
const fieldShell =
  "rounded-xl border border-white/14 bg-gradient-to-r from-white/[0.07] to-white/[0.02] p-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.38)] backdrop-blur-xl";

export default function ScenarioControls({
  config,
  setConfig,
  scenarioPrompt,
  setScenarioPrompt,
  onRun,
  onReset,
  isRunning,
  options,
}) {
  const drivers = options?.drivers ?? [];
  const events = options?.events ?? [];
  const regions = options?.regions ?? [];
  const horizons = options?.horizons ?? [];

  return (
    <div className="space-y-5 rounded-2xl p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Scenario Configuration</h2>
        <button
          onClick={onReset}
          className="atlas-focus-ring flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-zinc-500 transition-colors hover:text-zinc-100"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="space-y-4">
        <div className={fieldShell}>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Scenario Prompt</label>
          <textarea
            value={scenarioPrompt}
            onChange={(event) => setScenarioPrompt(event.target.value)}
            placeholder="Example: Simulate a severe oil shock in Saudi Arabia over 6 months."
            className="atlas-focus-ring min-h-[88px] w-full resize-y rounded-lg border border-white/15 bg-black/35 p-2.5 text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-500"
          />
          <div className="mt-1 text-[10px] text-zinc-500">
            Prompt parser deterministically maps this to driver, event, economy, severity, and horizon.
          </div>
        </div>

        <div className={fieldShell}>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Macro Driver</label>
          <Select value={config.driver} onValueChange={(v) => setConfig({ ...config, driver: v })}>
            <SelectTrigger className={triggerStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border border-white/14 bg-[#080d17]/95 text-zinc-100 shadow-[0_20px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              {drivers.map((d) => (
                <SelectItem key={d} value={d} className="rounded-md text-zinc-200 focus:bg-white/[0.12] focus:text-zinc-50">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={fieldShell}>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Trigger Event</label>
          <Select value={config.event} onValueChange={(v) => setConfig({ ...config, event: v })}>
            <SelectTrigger className={triggerStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border border-white/14 bg-[#080d17]/95 text-zinc-100 shadow-[0_20px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              {events.map((e) => (
                <SelectItem key={e} value={e} className="rounded-md text-zinc-200 focus:bg-white/[0.12] focus:text-zinc-50">
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={fieldShell}>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            Origin Economy (Top 50)
          </label>
          <Select value={config.region} onValueChange={(v) => setConfig({ ...config, region: v })}>
            <SelectTrigger className={triggerStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[320px] border border-white/14 bg-[#080d17]/95 text-zinc-100 shadow-[0_20px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              {regions.map((r) => (
                <SelectItem key={r} value={r} className="rounded-md text-zinc-200 focus:bg-white/[0.12] focus:text-zinc-50">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={fieldShell}>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Severity: {config.severity}%</label>
          <Slider
            value={[config.severity]}
            onValueChange={([v]) => setConfig({ ...config, severity: v })}
            min={10}
            max={100}
            step={5}
            className="mt-2"
          />
        </div>

        <div className={fieldShell}>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Time Horizon</label>
          <Select value={config.horizon} onValueChange={(v) => setConfig({ ...config, horizon: v })}>
            <SelectTrigger className={triggerStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border border-white/14 bg-[#080d17]/95 text-zinc-100 shadow-[0_20px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              {horizons.map((h) => (
                <SelectItem key={h} value={h} className="rounded-md text-zinc-200 focus:bg-white/[0.12] focus:text-zinc-50">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={onRun}
        disabled={isRunning}
        className="h-11 w-full gap-2 rounded-xl border border-white/24 bg-gradient-to-r from-white/[0.14] to-white/[0.08] text-zinc-100 shadow-[0_14px_34px_rgba(0,0,0,0.38)] transition duration-300 hover:border-white/34 hover:from-white/[0.2] hover:to-white/[0.1]"
      >
        <Play className="h-4 w-4" />
        {isRunning ? "Simulating..." : "Run Scenario"}
      </Button>
    </div>
  );
}
