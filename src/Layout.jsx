import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BookOpenText,
  FlaskConical,
  Globe2,
  Landmark,
  LogOut,
  Menu,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import AbstractHeroScene from "@/components/premium/AbstractHeroScene";
import AtlasMark from "@/components/brand/AtlasMark";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { fetchHealthStatus } from "@/api/atlasClient";
import { useAuth } from "@/lib/AuthContext";
import { useAtlasSectionNavigation } from "@/lib/sectionNavigation";
import { cn } from "@/lib/utils";
import { atlasFlowSectionLinks, getPagePath } from "@/lib/routes";

const WORKSPACE_ITEMS = [
  {
    page: "AtlasFlow",
    label: "Atlas Flow",
    path: getPagePath("AtlasFlow"),
    icon: Sparkles,
    description: "Unified operating flow for signal, simulation, and memory.",
    shortcut: "G A",
  },
  {
    page: "WorldPulse",
    label: "World Pulse",
    path: getPagePath("WorldPulse"),
    icon: Globe2,
    description: "Live macro signals, spillovers, and critical developments.",
    shortcut: "G S",
  },
  {
    page: "ScenarioLab",
    label: "Scenario Lab",
    path: getPagePath("ScenarioLab"),
    icon: FlaskConical,
    description: "Stress-test transmission paths and policy shocks.",
    shortcut: "G C",
  },
  {
    page: "RiskRadar",
    label: "Risk Radar",
    path: getPagePath("RiskRadar"),
    icon: ShieldAlert,
    description: "Monitor systemic pressure and macro vulnerability clusters.",
    shortcut: "G R",
  },
  {
    page: "EvidenceExplorer",
    label: "Evidence Explorer",
    path: getPagePath("EvidenceExplorer"),
    icon: BookOpenText,
    description: "Inspect the article-level trail behind each narrative.",
    shortcut: "G E",
  },
  {
    page: "HistoricalAtlas",
    label: "Memory Vault",
    path: getPagePath("HistoricalAtlas"),
    icon: Landmark,
    description: "Reopen prior macro discussions and decision state.",
    shortcut: "G M",
  },
];

function formatUtcClock(value) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const goToAtlasSection = useAtlasSectionNavigation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState("signal-desk");
  const [clock, setClock] = useState(() => new Date());

  const atlasFlowPath = getPagePath("AtlasFlow");
  const isAtlasFlowPage = location.pathname === atlasFlowPath;

  const currentWorkspace = useMemo(
    () =>
      WORKSPACE_ITEMS.find((item) => item.path === location.pathname) ||
      WORKSPACE_ITEMS.find((item) => item.page === currentPageName) ||
      WORKSPACE_ITEMS[0],
    [currentPageName, location.pathname],
  );

  const { data: healthData, isError: healthError, isFetching: healthFetching } = useQuery({
    queryKey: ["layout-health"],
    queryFn: fetchHealthStatus,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
    retryDelay: 800,
  });

  const systemStatus = healthError ? "Degraded" : healthFetching && !healthData ? "Syncing" : "Online";
  const statusTone = healthError
    ? "text-rose-200 border-rose-300/25 bg-rose-300/10"
    : "text-emerald-200 border-emerald-300/25 bg-emerald-300/10";

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isAtlasFlowPage) {
      setActiveAnchor("");
      return;
    }

    const hash = String(location.hash || "").replace("#", "").trim();
    if (!hash) {
      setActiveAnchor("signal-desk");
      return;
    }

    const timer = window.setTimeout(() => {
      const node = document.getElementById(hash);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveAnchor(hash);
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isAtlasFlowPage, location.hash]);

  useEffect(() => {
    if (!isAtlasFlowPage) return undefined;

    const updateActiveAnchor = () => {
      const navOffset = 146;
      const sections = atlasFlowSectionLinks
        .map((item) => {
          const node = document.getElementById(item.id);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return {
            id: item.id,
            topDistance: Math.abs(rect.top - navOffset),
            top: rect.top,
          };
        })
        .filter(Boolean);

      if (!sections.length) return;

      const scrollBottom = window.innerHeight + window.scrollY;
      const documentBottom = document.documentElement.scrollHeight;
      if (documentBottom - scrollBottom <= 24) {
        setActiveAnchor(sections[sections.length - 1].id);
        return;
      }

      const passedSections = sections.filter((section) => section.top <= navOffset);
      if (passedSections.length) {
        const current = passedSections.sort((left, right) => right.top - left.top)[0];
        setActiveAnchor(current.id);
        return;
      }

      const nearest = sections.sort((left, right) => left.topDistance - right.topDistance)[0];
      setActiveAnchor(nearest.id);
    };

    updateActiveAnchor();
    window.addEventListener("scroll", updateActiveAnchor, { passive: true });
    window.addEventListener("resize", updateActiveAnchor);
    return () => {
      window.removeEventListener("scroll", updateActiveAnchor);
      window.removeEventListener("resize", updateActiveAnchor);
    };
  }, [isAtlasFlowPage]);

  const jumpToSection = (anchorId) => {
    setCommandOpen(false);
    setMobileOpen(false);
    goToAtlasSection(anchorId);
    setActiveAnchor(anchorId);
  };

  const goToWorkspace = (path) => {
    setCommandOpen(false);
    setMobileOpen(false);
    navigate(path);
  };

  const userLabel = user?.full_name || user?.email || "Analyst Session";

  const renderWorkspaceLink = (item, compact = false) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end
        className={({ isActive }) =>
          cn(
            "atlas-focus-ring group relative block overflow-hidden rounded-2xl border px-3.5 py-3 transition",
            isActive
              ? "border-cyan-300/35 bg-cyan-300/[0.12] text-zinc-100 shadow-[0_0_0_1px_rgba(103,232,249,0.1)_inset]"
              : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100",
          )
        }
      >
        {({ isActive }) => (
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-zinc-100 transition",
                isActive ? "border-cyan-200/35 bg-cyan-300/[0.14]" : "border-white/12 bg-black/25",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{item.label}</div>
                {!compact ? (
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{item.shortcut}</div>
                ) : null}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">{item.description}</div>
            </div>
          </div>
        )}
      </NavLink>
    );
  };

  return (
    <div className="atlas-app-shell min-h-screen text-zinc-100">
      <div className="fixed inset-0 z-0">
        <AbstractHeroScene />
      </div>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute left-[-18%] top-[-26%] h-[620px] w-[620px] rounded-full bg-white/[0.03] blur-[155px] drift-slow" />
        <div
          className="absolute bottom-[-24%] right-[-16%] h-[560px] w-[560px] rounded-full bg-white/[0.025] blur-[135px] drift-slow"
          style={{ animationDelay: "-7s" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.025),transparent_48%)]" />
      </div>

      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto max-w-[1880px] px-3 pt-3 sm:px-4">
          <div className="atlas-terminal-shell rounded-2xl border border-white/10 bg-black/45 shadow-[0_16px_44px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="flex h-[76px] items-center gap-3 px-3 sm:px-4">
              <button
                type="button"
                className="atlas-focus-ring inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] p-2.5 text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100 md:hidden"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-label="Toggle workspace navigation"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={() => goToWorkspace(getPagePath("AtlasFlow"))}
                className="atlas-focus-ring group flex min-w-0 items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2 text-left transition hover:border-white/22 hover:bg-white/[0.06]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/16 bg-black/35 shadow-[0_0_28px_rgba(255,255,255,0.06)]">
                  <AtlasMark className="h-6 w-6 drop-shadow-[0_0_14px_rgba(255,255,255,0.12)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[1rem] font-semibold tracking-[0.26em] text-zinc-100">ATLAS</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Macro Decision OS</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="atlas-focus-ring hidden flex-1 items-center justify-between rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-left transition hover:border-white/20 hover:bg-black/40 md:flex"
              >
                <div className="flex items-center gap-3 text-zinc-300">
                  <Search className="h-4 w-4 text-cyan-200" />
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Command Palette</div>
                    <div className="text-sm text-zinc-100">Jump to any workspace, section, or live tool</div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-zinc-400">
                  Ctrl K
                </div>
              </button>

              <div className="ml-auto hidden items-center gap-2 lg:flex">
                <div className={cn("rounded-xl border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em]", statusTone)}>
                  Sys {systemStatus}
                </div>
                <div className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-300">
                  UTC {formatUtcClock(clock)}
                </div>
                <div className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">View</div>
                  <div className="text-sm text-zinc-100">{currentWorkspace.label}</div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="atlas-focus-ring flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="max-w-[160px] truncate">{userLabel}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="atlas-focus-ring inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] p-2.5 text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100 md:hidden"
                aria-label="Open command palette"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -18, opacity: 0 }}
              className="absolute inset-y-0 left-0 w-[88vw] max-w-[360px] border-r border-white/10 bg-[#05070b]/95 p-4 shadow-[0_20px_48px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Workspace</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">Atlas Terminal</div>
                </div>
                <button
                  type="button"
                  className="atlas-focus-ring rounded-xl border border-white/12 bg-white/[0.04] p-2 text-zinc-300"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close workspace navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-2">{WORKSPACE_ITEMS.map((item) => renderWorkspaceLink(item, true))}</div>

              {isAtlasFlowPage ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Atlas Flow Sections</div>
                  <div className="mt-2 space-y-2">
                    {atlasFlowSectionLinks.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => jumpToSection(item.id)}
                        className={cn(
                          "atlas-focus-ring w-full rounded-xl border px-3 py-2 text-left text-sm transition",
                          activeAnchor === item.id
                            ? "border-cyan-300/35 bg-cyan-300/[0.12] text-zinc-100"
                            : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-zinc-100",
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={logout}
                className="atlas-focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

  <aside className="fixed bottom-0 left-0 top-[94px] z-40 hidden w-[258px] px-3 pb-4 md:block">
        <div className="atlas-workspace-rail flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/38 shadow-[0_18px_46px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Workspace</div>
                <div className="mt-1 text-base font-semibold text-zinc-100">{currentWorkspace.label}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{currentWorkspace.description}</div>
              </div>
              <div
                className={cn(
                  "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                  healthError ? "border-rose-300/25 bg-rose-300/8 text-rose-200" : "border-emerald-300/25 bg-emerald-300/8 text-emerald-200",
                )}
              >
                {systemStatus}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[11px] text-zinc-400">
                {healthData?.service ? `${healthData.service} responding` : healthFetching ? "Checking backend heartbeat..." : "Backend heartbeat unavailable."}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">UTC {formatUtcClock(clock)}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-2">{WORKSPACE_ITEMS.map((item) => renderWorkspaceLink(item))}</div>

            {isAtlasFlowPage ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Atlas Flow Sections</div>
                <div className="mt-2 space-y-2">
                  {atlasFlowSectionLinks.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => jumpToSection(item.id)}
                      className={cn(
                        "atlas-focus-ring flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                        activeAnchor === item.id
                          ? "border-cyan-300/35 bg-cyan-300/[0.12] text-zinc-100"
                          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-zinc-100",
                      )}
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        {activeAnchor === item.id ? "Live" : "Jump"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="relative z-10 min-h-screen pt-[92px] md:pl-[272px]">{children}</main>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Jump to a workspace, Atlas Flow section, or memory surface..." className="border-0 bg-black/70 text-zinc-100 placeholder:text-zinc-500" />
        <CommandList className="max-h-[440px] bg-[#05070b] text-zinc-100">
          <CommandEmpty className="text-zinc-500">No matching workspace command.</CommandEmpty>
          <CommandGroup heading="Workspace Views">
            {WORKSPACE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={`workspace-${item.path}`} value={`${item.label} ${item.description}`} onSelect={() => goToWorkspace(item.path)}>
                  <Icon className="h-4 w-4 text-cyan-200" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span>{item.label}</span>
                    <span className="text-[11px] text-zinc-500">{item.description}</span>
                  </div>
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Atlas Flow Sections">
            {atlasFlowSectionLinks.map((item) => (
              <CommandItem key={`section-${item.id}`} value={`Atlas Flow ${item.label}`} onSelect={() => jumpToSection(item.id)}>
                <Activity className="h-4 w-4 text-emerald-200" />
                <span>{item.label}</span>
                <CommandShortcut>JMP</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
