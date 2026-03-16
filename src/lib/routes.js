const ROUTE_OVERRIDES = {
  AtlasFlow: "/",
  WorldPulse: "/world-pulse",
  ScenarioLab: "/scenario-lab",
  HistoricalAtlas: "/memory-vault",
  RiskRadar: "/risk-radar",
  EvidenceExplorer: "/evidence-explorer",
};

function toKebabCase(value = "") {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function getPagePath(pageName = "") {
  const normalized = String(pageName || "").trim();
  if (!normalized) return "/";
  return ROUTE_OVERRIDES[normalized] || `/${toKebabCase(normalized)}`;
}

export function buildAtlasFlowHash(anchorId = "") {
  const hash = String(anchorId || "").replace(/^#/, "").trim();
  return hash ? `/#${hash}` : "/";
}

export const atlasFlowSectionLinks = [
  { id: "signal-desk", label: "World Pulse" },
  { id: "scenario-lab", label: "Scenario Lab" },
  { id: "memory-vault", label: "Memory Vault" },
];
