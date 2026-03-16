import React from "react";
import { motion } from "framer-motion";
import WorldPulse from "./WorldPulse";
import ScenarioLab from "./ScenarioLab";
import HistoricalAtlas from "./HistoricalAtlas";

const SECTION_TRANSITION = {
  duration: 0.55,
  ease: "easeOut",
};

function SectionDivider({ label }) {
  return (
    <div className="mx-auto w-full max-w-[1550px] px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-white/10" />
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500/85">{label}</div>
        <div className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}

export default function AtlasFlow() {
  return (
    <div className="space-y-4 pb-6">
      <motion.section
        id="signal-desk"
        className="scroll-mt-[92px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SECTION_TRANSITION}
      >
        <WorldPulse embedded />
      </motion.section>

      <SectionDivider label="Scenario Lab" />

      <motion.section
        id="scenario-lab"
        className="scroll-mt-[92px]"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={SECTION_TRANSITION}
      >
        <ScenarioLab embedded />
      </motion.section>

      <SectionDivider label="Memory Vault" />

      <motion.section
        id="memory-vault"
        className="scroll-mt-[92px]"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={SECTION_TRANSITION}
      >
        <HistoricalAtlas embedded />
      </motion.section>
    </div>
  );
}
