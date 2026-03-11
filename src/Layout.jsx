import React, { useEffect, useState } from "react";
import { Activity, FlaskConical, Landmark, LogOut, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AbstractHeroScene from "@/components/premium/AbstractHeroScene";
import AtlasMark from "@/components/brand/AtlasMark";
import { useAuth } from "@/lib/AuthContext";

const NAV_ITEMS = [
  { name: "Signal Desk", anchorId: "signal-desk", icon: Activity },
  { name: "Scenario Lab", anchorId: "scenario-lab", icon: FlaskConical },
  { name: "Memory Vault", anchorId: "memory-vault", icon: Landmark },
];

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState("signal-desk");
  const { logout, user } = useAuth();

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && NAV_ITEMS.some((item) => item.anchorId === hash)) {
        setActiveAnchor(hash);
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    const updateActiveAnchor = () => {
      const navOffset = 140;
      const sections = NAV_ITEMS.map((item) => {
        const node = document.getElementById(item.anchorId);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          id: item.anchorId,
          topDistance: Math.abs(rect.top - navOffset),
          top: rect.top,
        };
      }).filter(Boolean);

      if (!sections.length) return;

      const scrollBottom = window.innerHeight + window.scrollY;
      const documentBottom = document.documentElement.scrollHeight;
      if (documentBottom - scrollBottom <= 24) {
        setActiveAnchor(sections[sections.length - 1].id);
        return;
      }

      const passedSections = sections.filter((section) => section.top <= navOffset);
      if (passedSections.length) {
        const current = passedSections.sort((a, b) => b.top - a.top)[0];
        setActiveAnchor(current.id);
        return;
      }

      const nearest = sections.sort((a, b) => a.topDistance - b.topDistance)[0];
      setActiveAnchor(nearest.id);
    };

    updateActiveAnchor();
    window.addEventListener("scroll", updateActiveAnchor, { passive: true });
    window.addEventListener("resize", updateActiveAnchor);
    return () => {
      window.removeEventListener("scroll", updateActiveAnchor);
      window.removeEventListener("resize", updateActiveAnchor);
    };
  }, []);

  const handleNavClick = (anchorId) => {
    setActiveAnchor(anchorId);
    setMobileOpen(false);
  };

  return (
    <div className="atlas-app-shell min-h-screen relative text-zinc-100">
      <div className="fixed inset-0 z-0">
        <AbstractHeroScene />
      </div>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-26%] left-[-18%] h-[620px] w-[620px] rounded-full bg-white/[0.03] blur-[155px] drift-slow" />
        <div
          className="absolute bottom-[-24%] right-[-16%] h-[560px] w-[560px] rounded-full bg-white/[0.025] blur-[135px] drift-slow"
          style={{ animationDelay: "-7s" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.025),transparent_48%)]" />
      </div>

      <nav className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto max-w-[1650px] px-4 pt-3 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-white/12 bg-black/30 shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="flex h-[74px] items-center justify-between gap-4 px-4 sm:px-5">
              <a href="#signal-desk" onClick={() => handleNavClick("signal-desk")} className="group flex items-center gap-3">
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/[0.07] shadow-[0_0_32px_rgba(255,255,255,0.06)] transition group-hover:border-white/30">
                  <AtlasMark className="h-7 w-7 drop-shadow-[0_0_14px_rgba(255,255,255,0.12)]" />
                </div>
                <div className="leading-tight shrink-0">
                  <div className="text-[1.1rem] font-semibold tracking-[0.32em] text-zinc-100 sm:text-[1.35rem]">ATLAS</div>
                  <div className="hidden text-[11px] uppercase tracking-[0.28em] text-zinc-500 sm:block">
                    Macro Intelligence System
                  </div>
                </div>
              </a>

              <div className="hidden items-center gap-2 md:flex md:shrink-0">
                {NAV_ITEMS.map((item) => {
                  const isActive = activeAnchor === item.anchorId;
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.anchorId}
                      href={`#${item.anchorId}`}
                      onClick={() => handleNavClick(item.anchorId)}
                      className={`relative atlas-focus-ring flex items-center gap-2 rounded-xl px-4 py-2 text-[15px] font-medium transition ${
                        isActive
                          ? "text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      {isActive ? (
                        <motion.div
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-xl border border-white/25 bg-white/[0.08]"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      ) : null}
                      <Icon className="relative z-10 h-[18px] w-[18px]" />
                      <span className="relative z-10">{item.name}</span>
                    </a>
                  );
                })}
                <button
                  type="button"
                  onClick={logout}
                  className="atlas-focus-ring flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-[15px] font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  <LogOut className="h-[17px] w-[17px]" />
                  <span>{user?.full_name ? `Log Out` : "Log Out"}</span>
                </button>
              </div>

              <button
                className="atlas-focus-ring rounded-md p-2 text-zinc-400 transition hover:text-zinc-100 md:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle navigation"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-auto mt-2 max-w-[1650px] px-4 sm:px-6 lg:px-8 md:hidden"
            >
              <div className="space-y-1 rounded-2xl border border-white/12 bg-black/30 px-4 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                {NAV_ITEMS.map((item) => {
                  const isActive = activeAnchor === item.anchorId;
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.anchorId}
                      href={`#${item.anchorId}`}
                      onClick={() => handleNavClick(item.anchorId)}
                      className={`atlas-focus-ring flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition ${
                        isActive
                          ? "border border-white/20 bg-white/[0.08] text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </a>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  className="atlas-focus-ring flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </nav>

      <main className="relative z-10 min-h-screen pt-[74px]">{children}</main>
    </div>
  );
}
