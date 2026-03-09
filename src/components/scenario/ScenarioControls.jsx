import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Play, RotateCcw } from "lucide-react";

const DRIVERS = ["Interest Rates", "Oil Price", "Currency", "Trade Policy", "Technology", "Geopolitical"];
const EVENTS = ["Rate Hike +100bp", "Oil Spike to $120", "USD Surge +15%", "Tariff Escalation", "AI Capex Boom", "Regional Conflict"];
const REGIONS = ["United States", "Europe", "China", "Middle East", "Emerging Markets", "Japan"];
const HORIZONS = ["3 Months", "6 Months", "12 Months", "24 Months"];

export default function ScenarioControls({ config, setConfig, onRun, onReset, isRunning }) {
  return (
    <div className="atlas-glass-strong rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white tracking-tight">Scenario Configuration</h2>
        <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Macro Driver</label>
          <Select value={config.driver} onValueChange={(v) => setConfig({ ...config, driver: v })}>
            <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {DRIVERS.map(d => <SelectItem key={d} value={d} className="text-slate-200 focus:bg-white/10">{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Trigger Event</label>
          <Select value={config.event} onValueChange={(v) => setConfig({ ...config, event: v })}>
            <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {EVENTS.map(e => <SelectItem key={e} value={e} className="text-slate-200 focus:bg-white/10">{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Origin Region</label>
          <Select value={config.region} onValueChange={(v) => setConfig({ ...config, region: v })}>
            <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {REGIONS.map(r => <SelectItem key={r} value={r} className="text-slate-200 focus:bg-white/10">{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Severity: {config.severity}%</label>
          <Slider
            value={[config.severity]}
            onValueChange={([v]) => setConfig({ ...config, severity: v })}
            min={10}
            max={100}
            step={5}
            className="mt-2"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Time Horizon</label>
          <Select value={config.horizon} onValueChange={(v) => setConfig({ ...config, horizon: v })}>
            <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {HORIZONS.map(h => <SelectItem key={h} value={h} className="text-slate-200 focus:bg-white/10">{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={onRun}
        disabled={isRunning}
        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold gap-2 h-11 shadow-lg shadow-cyan-500/20"
      >
        <Play className="w-4 h-4" />
        {isRunning ? "Simulating..." : "Run Scenario"}
      </Button>
    </div>
  );
}