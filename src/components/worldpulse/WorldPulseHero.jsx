import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, FlaskConical, Landmark, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function WorldPulseHero({
  headlineBrief,
  selectedDevelopment,
  themeBoard = [],
  rightPanel = null,
}) {
  const topThemes = useMemo(() => (themeBoard || []).slice(0, 3), [themeBoard]);
  const scenarioTarget = selectedDevelopment?.development_id
    ? `/?development_id=${encodeURIComponent(selectedDevelopment.development_id)}#scenario-lab`
    : "/#scenario-lab";
  const memoryTarget = "/#memory-vault";

  return (
    <section className="relative">
      <div className="relative z-10 mx-auto max-w-[1650px] px-4 pb-4 pt-3 sm:px-7 sm:pb-5 sm:pt-4 lg:px-10 lg:pb-6 lg:pt-5">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] xl:items-start">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, ease: "easeOut" }}
            className="max-w-4xl"
          >
            <div className="atlas-chip border-white/25 bg-white/[0.07] text-zinc-200">
              <Sparkles className="h-3.5 w-3.5 text-zinc-100" />
              Live Macro Intelligence
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-100 sm:text-5xl lg:text-6xl">
              Signal Confidence For Every
              <span className="atlas-text-gradient block">Global Macro Regime Shift</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              {headlineBrief || "Streaming live developments, transmission pathways, and validated macro signals."}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to={scenarioTarget}
                className="group inline-flex items-center gap-2 rounded-full border border-white/30 bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 transition duration-300 hover:bg-zinc-200"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Run Scenario
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to={memoryTarget}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-zinc-200 transition duration-300 hover:border-white/30 hover:bg-white/[0.08]"
              >
                <Landmark className="h-3.5 w-3.5" />
                Open Memory Vault
              </Link>
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.12 }}
            className="rounded-2xl border border-white/12 bg-black/35 p-4 shadow-[0_16px_38px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-5"
          >
            {rightPanel ? (
              rightPanel
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Theme Pressure</div>
                {topThemes.length ? (
                  topThemes.map((theme) => (
                    <div key={theme.theme_id} className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300">{theme.label}</span>
                      <span className="text-zinc-100">{theme.temperature}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500">No theme telemetry yet.</div>
                )}
              </div>
            )}
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
