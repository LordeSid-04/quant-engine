import React, { useState } from "react";
import { AnimatePresence } from "framer-motion";
import GlobeMap from "../components/worldpulse/GlobeMap";
import IntelligencePanel from "../components/worldpulse/IntelligencePanel";
import WorldPulseHeader from "../components/worldpulse/WorldPulseHeader";
import MacroWatchlist from "../components/worldpulse/MacroWatchlist";

export default function WorldPulse() {
  const [selectedRegion, setSelectedRegion] = useState(null);

  return (
    <div className="h-[calc(100vh-80px)] sm:h-[calc(100vh-96px)] flex flex-col relative">
      <WorldPulseHeader />

      <div className="flex-1 min-h-0 px-2 sm:px-4 pb-3 sm:pb-4 pt-2 sm:pt-3">
        <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 sm:gap-4">
          <div className="min-h-[280px] xl:min-h-0">
            <MacroWatchlist />
          </div>

          <div className="relative min-h-[340px] xl:min-h-0 rounded-2xl overflow-hidden atlas-glass-strong">
            <GlobeMap onSelectRegion={setSelectedRegion} />
            <AnimatePresence>
              {selectedRegion && (
                <IntelligencePanel
                  region={selectedRegion}
                  onClose={() => setSelectedRegion(null)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}