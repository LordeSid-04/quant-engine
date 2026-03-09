import React, { useState, useEffect } from "react";
import { FlaskConical } from "lucide-react";
import ScenarioControls from "../components/scenario/ScenarioControls";
import PropagationGraph from "../components/scenario/PropagationGraph";
import ScenarioResults from "../components/scenario/ScenarioResults";

const DEFAULT_CONFIG = {
  driver: "Interest Rates",
  event: "Rate Hike +100bp",
  region: "United States",
  severity: 70,
  horizon: "12 Months",
};

export default function ScenarioLab() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const region = params.get("region");
    if (region) {
      const regionMap = { us: "United States", europe: "Europe", china: "China", middleeast: "Middle East", em: "Emerging Markets", japan: "Japan" };
      if (regionMap[region]) {
        setConfig(prev => ({ ...prev, region: regionMap[region] }));
      }
    }
  }, []);

  const handleRun = () => {
    setIsRunning(true);
    setResults(null);
    setTimeout(() => {
      setResults(config);
      setIsRunning(false);
    }, 4000);
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setIsRunning(false);
    setResults(null);
  };

  return (
    <div className="min-h-[calc(100vh-96px)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Scenario Lab</h1>
            <p className="text-xs text-slate-500">Simulate macroeconomic shocks and visualize global propagation</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          <ScenarioControls
            config={config}
            setConfig={setConfig}
            onRun={handleRun}
            onReset={handleReset}
            isRunning={isRunning}
          />
          <div className="space-y-6">
            <div className="min-h-[450px]">
              <PropagationGraph isRunning={isRunning} results={results} />
            </div>
            {results && <ScenarioResults config={results} />}
          </div>
        </div>
      </div>
    </div>
  );
}