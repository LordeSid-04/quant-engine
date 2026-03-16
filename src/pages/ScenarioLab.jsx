import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import ScenarioControls from "../components/scenario/ScenarioControls";
import PropagationGraph from "../components/scenario/PropagationGraph";
import SimulationLog from "../components/scenario/SimulationLog";
import ScenarioThemeGraphBoard from "../components/scenario/ScenarioThemeGraphBoard";
import { SectionHeading, SurfaceCard } from "@/components/premium/SurfaceCard";
import {
  describeApiError,
  fetchDailyBriefing,
  fetchScenarioOptions,
  getCachedDailyBriefing,
  getCachedScenarioOptions,
  runScenarioStream,
} from "@/api/atlasClient";

const DEFAULT_CONFIG = {
  driver: "Interest Rates",
  event: "Rate Hike +100bp",
  region: "United States",
  severity: 70,
  horizon: "12 Months",
};

const REGION_MAP = {
  us: "United States",
  europe: "Germany",
  china: "China",
  middleeast: "Saudi Arabia",
  em: "India",
  japan: "Japan",
};

const LEGACY_REGION_ALIAS = {
  Europe: "Germany",
  "Middle East": "Saudi Arabia",
  "Emerging Markets": "India",
};

function normalizeRegionSelection(region, regionOptions = []) {
  const raw = String(region || "").trim();
  if (!raw) return "";
  const mapped = LEGACY_REGION_ALIAS[raw] || raw;
  if (regionOptions.includes(mapped)) return mapped;
  const caseInsensitive = regionOptions.find((option) => option.toLowerCase() === mapped.toLowerCase());
  return caseInsensitive || mapped;
}

const reveal = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.18 },
  transition: { duration: 0.45, ease: "easeOut" },
};

export default function ScenarioLab({ embedded = false }) {
  const location = useLocation();
  const cachedOptions = getCachedScenarioOptions();
  const cachedDailyBrief = getCachedDailyBriefing();
  const { data: options, isLoading: isLoadingOptions, isError: optionsError, error: optionsLoadError } = useQuery({
    queryKey: ["scenario-options"],
    queryFn: fetchScenarioOptions,
    initialData: cachedOptions || undefined,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [runError, setRunError] = useState("");
  const [graphRunId, setGraphRunId] = useState(0);
  const [regionFromUrl, setRegionFromUrl] = useState("");
  const [developmentIdFromUrl, setDevelopmentIdFromUrl] = useState("");
  const [presetDevelopment, setPresetDevelopment] = useState(null);
  const [scenarioPrompt, setScenarioPrompt] = useState("");

  const { data: dailyBrief } = useQuery({
    queryKey: ["briefing-daily-for-scenario"],
    queryFn: () => fetchDailyBriefing({ windowHours: 72, limit: 8 }),
    initialData: cachedDailyBrief || undefined,
    staleTime: 30 * 1000,
    refetchInterval: 30000,
    enabled: Boolean(developmentIdFromUrl),
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const region = params.get("region");
    const developmentId = params.get("development_id");
    if (region) {
      setRegionFromUrl(REGION_MAP[region] || decodeURIComponent(region));
    } else {
      setRegionFromUrl("");
    }
    if (developmentId) {
      setDevelopmentIdFromUrl(developmentId);
    } else {
      setDevelopmentIdFromUrl("");
    }
  }, [location.search]);

  useEffect(() => {
    if (!options) return;
    const resolvedRegion = normalizeRegionSelection(regionFromUrl || config.region, options.regions || []);
    setConfig((prev) => ({
      ...prev,
      driver: options.drivers?.includes(prev.driver) ? prev.driver : options.drivers?.[0] ?? prev.driver,
      event: options.events?.includes(prev.event) ? prev.event : options.events?.[0] ?? prev.event,
      region: options.regions?.includes(resolvedRegion) ? resolvedRegion : options.regions?.[0] ?? prev.region,
      horizon: options.horizons?.includes(prev.horizon) ? prev.horizon : options.horizons?.[0] ?? prev.horizon,
    }));
  }, [config.region, options, regionFromUrl]);

  useEffect(() => {
    if (!developmentIdFromUrl) {
      setPresetDevelopment(null);
      return;
    }
    if (!options || !dailyBrief?.developments?.length) return;
    const development = dailyBrief.developments.find((item) => item.development_id === developmentIdFromUrl);
    if (!development?.scenario_preset) {
      setPresetDevelopment(null);
      return;
    }

    const preset = development.scenario_preset;
    const resolvedPresetRegion = normalizeRegionSelection(preset.region, options.regions || []);
    setPresetDevelopment(development);
    setConfig((prev) => ({
      ...prev,
      driver: options.drivers?.includes(preset.driver) ? preset.driver : prev.driver,
      event: options.events?.includes(preset.event) ? preset.event : prev.event,
      region: options.regions?.includes(resolvedPresetRegion) ? resolvedPresetRegion : prev.region,
      severity: Number.isFinite(Number(preset.severity)) ? Number(preset.severity) : prev.severity,
      horizon: options.horizons?.includes(preset.horizon) ? preset.horizon : prev.horizon,
    }));
  }, [developmentIdFromUrl, dailyBrief, options]);

  const runScenarioSimulation = async ({ promptTest = false } = {}) => {
    if (promptTest && !scenarioPrompt.trim()) {
      setRunError("Enter a scenario prompt, then click Test Prompt.");
      return;
    }

    setIsRunning(true);
    setResults(null);
    setExecutionLogs([]);
    setRunError("");

    const promptValue = scenarioPrompt.trim();
    try {
      const response = await runScenarioStream(
        {
          ...config,
          scenario_prompt: promptValue || undefined,
        },
        {
          onLog: (log) => {
            setExecutionLogs((prev) => [...prev, log]);
          },
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 260));
      setResults(response);
      if (response?.config) {
        setConfig((prev) => ({
          ...prev,
          driver: response.config.driver || prev.driver,
          event: response.config.event || prev.event,
          region: response.config.region || prev.region,
          severity: Number.isFinite(Number(response.config.severity)) ? Number(response.config.severity) : prev.severity,
          horizon: response.config.horizon || prev.horizon,
        }));
      }
      setGraphRunId((prev) => prev + 1);
    } catch (error) {
      setRunError(describeApiError(error, "Could not run this scenario."));
    } finally {
      setIsRunning(false);
    }
  };

  const handleRun = () => runScenarioSimulation({ promptTest: false });
  const handlePromptTest = () => runScenarioSimulation({ promptTest: true });

  const handleReset = () => {
    if (presetDevelopment?.scenario_preset) {
      const preset = presetDevelopment.scenario_preset;
      const resolvedPresetRegion = normalizeRegionSelection(preset.region, options?.regions || []);
      setConfig({
        driver: options?.drivers?.includes(preset.driver) ? preset.driver : options?.drivers?.[0] ?? DEFAULT_CONFIG.driver,
        event: options?.events?.includes(preset.event) ? preset.event : options?.events?.[0] ?? DEFAULT_CONFIG.event,
        region: options?.regions?.includes(resolvedPresetRegion) ? resolvedPresetRegion : options?.regions?.[0] ?? DEFAULT_CONFIG.region,
        severity: Number.isFinite(Number(preset.severity)) ? Number(preset.severity) : DEFAULT_CONFIG.severity,
        horizon: options?.horizons?.includes(preset.horizon) ? preset.horizon : options?.horizons?.[0] ?? DEFAULT_CONFIG.horizon,
      });
      setScenarioPrompt("");
      setIsRunning(false);
      setResults(null);
      setExecutionLogs([]);
      setRunError("");
      return;
    }

    setConfig({
      driver: options?.drivers?.[0] ?? DEFAULT_CONFIG.driver,
      event: options?.events?.[0] ?? DEFAULT_CONFIG.event,
      region: normalizeRegionSelection(regionFromUrl, options?.regions || []) || options?.regions?.[0] || DEFAULT_CONFIG.region,
      severity: DEFAULT_CONFIG.severity,
      horizon: options?.horizons?.[0] ?? DEFAULT_CONFIG.horizon,
    });
    setScenarioPrompt("");
    setIsRunning(false);
    setResults(null);
    setExecutionLogs([]);
    setRunError("");
  };

  return (
    <div className={`${embedded ? "min-h-0" : "min-h-[calc(100vh-74px)]"} px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6`}>
      <div className="mx-auto max-w-[1550px] space-y-5">
        <motion.div {...reveal}>
          <SurfaceCard tone="strong" className="p-5 sm:p-6">
            <SectionHeading
              eyebrow="What-If Lab"
              title="See What Could Happen Next"
              description="Choose an event, set how big it feels, and Atlas will show which markets and regions may react first."
              action={<div className="atlas-chip">Scenario Walkthrough</div>}
            />
          </SurfaceCard>
        </motion.div>

        {presetDevelopment ? (
          <motion.div {...reveal}>
            <SurfaceCard tone="soft" className="rounded-xl px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">Live Preset Loaded</div>
              <div className="mt-1 flex items-start gap-2 text-sm text-zinc-100">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-200" />
                <span>{presetDevelopment.title}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {presetDevelopment.label} | importance {presetDevelopment.importance} | state {presetDevelopment.state}
              </div>
            </SurfaceCard>
          </motion.div>
        ) : null}

        <motion.div {...reveal} className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <ScenarioControls
            config={config}
            setConfig={setConfig}
            scenarioPrompt={scenarioPrompt}
            setScenarioPrompt={setScenarioPrompt}
            onRun={handleRun}
            onTestPrompt={handlePromptTest}
            onReset={handleReset}
            isRunning={isRunning}
            options={options}
          />
          <div className="space-y-4">
            <SimulationLog logs={executionLogs} isRunning={isRunning} />
            <div className="min-h-[460px]">
              <PropagationGraph isRunning={isRunning} result={results} runId={graphRunId} />
            </div>
            {isLoadingOptions ? <div className="text-xs text-zinc-500">Loading scenario options...</div> : null}
            {optionsError ? <div className="text-xs text-rose-300">{describeApiError(optionsLoadError, "Could not load scenario options.")}</div> : null}
            {runError ? <div className="text-xs text-rose-300">{runError}</div> : null}
          </div>
        </motion.div>

        <motion.div {...reveal}>
          <ScenarioThemeGraphBoard scenarioResult={results} isScenarioRunning={isRunning} />
        </motion.div>

      </div>
    </div>
  );
}
