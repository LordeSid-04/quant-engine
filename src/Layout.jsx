import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Globe, FlaskConical, Landmark, ShieldAlert, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { name: "World Pulse", page: "WorldPulse", icon: Globe },
  { name: "Scenario Lab", page: "ScenarioLab", icon: FlaskConical },
  { name: "Historical Atlas", page: "HistoricalAtlas", icon: Landmark },
  { name: "Risk Radar", page: "RiskRadar", icon: ShieldAlert },
];

export default function Layout({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0e1a] relative">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-500/[0.03] blur-[120px] drift-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/[0.03] blur-[100px] drift-slow" style={{ animationDelay: '-10s' }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-amber-500/[0.02] blur-[80px] drift-slow" style={{ animationDelay: '-5s' }} />
      </div>

      {/* Top Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="atlas-glass-strong border-b border-white/[0.04]">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20 sm:h-24">
              {/* Logo */}
              <Link to={createPageUrl("WorldPulse")} className="flex items-center gap-3 sm:gap-4 group">
                <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 opacity-80 group-hover:opacity-100 transition-opacity" />
                  <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-white relative z-10" />
                </div>
                <div>
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-white">ATLAS</span>
                  <span className="hidden sm:inline text-[11px] uppercase tracking-[0.24em] text-slate-400 ml-2">Macro Intelligence</span>
                </div>
              </Link>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center gap-2">
                {NAV_ITEMS.map((item) => {
                  const isActive = currentPageName === item.page;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.page}
                      to={createPageUrl(item.page)}
                      className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-300 ${
                        isActive
                          ? "text-cyan-200"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg bg-white/[0.08] border border-cyan-400/25 shadow-[0_0_24px_rgba(34,211,238,0.16)]"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <Icon className="w-[17px] h-[17px] relative z-10" />
                      <span className="relative z-10">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile toggle */}
              <button
                className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
        <div className="atlas-aurora-line" />

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden atlas-glass-strong border-b border-white/[0.04]"
            >
              <div className="px-4 py-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const isActive = currentPageName === item.page;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.page}
                      to={createPageUrl(item.page)}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "text-cyan-300 bg-white/[0.06]"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Main content */}
      <main className="pt-20 sm:pt-24 min-h-screen relative z-10">
        {children}
      </main>
    </div>
  );
}