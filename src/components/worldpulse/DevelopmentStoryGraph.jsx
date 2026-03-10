import React, { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Landmark, Newspaper, ShieldCheck, Sparkles } from "lucide-react";

const NODE_TYPE_META = {
  source: {
    title: "Source",
    tone: "text-zinc-200",
    border: "border-zinc-300/45",
    bg: "from-zinc-200/25 to-zinc-50/5",
    icon: Newspaper,
  },
  theme: {
    title: "Theme",
    tone: "text-zinc-100",
    border: "border-zinc-100/50",
    bg: "from-zinc-100/35 to-zinc-100/8",
    icon: Sparkles,
  },
  policy: {
    title: "Policy",
    tone: "text-zinc-200",
    border: "border-zinc-300/35",
    bg: "from-zinc-300/22 to-zinc-200/6",
    icon: Landmark,
  },
  asset: {
    title: "Market",
    tone: "text-zinc-100",
    border: "border-zinc-100/45",
    bg: "from-zinc-100/24 to-zinc-50/6",
    icon: BarChart3,
  },
  action: {
    title: "Action",
    tone: "text-emerald-200",
    border: "border-emerald-200/35",
    bg: "from-emerald-200/25 to-emerald-100/5",
    icon: ShieldCheck,
  },
};

const NODE_TYPE_ORDER = ["source", "theme", "policy", "asset", "action"];

function clipLabel(value, max = 24) {
  const label = String(value || "").trim();
  if (!label) return "Untitled";
  if (label.length <= max) return label;
  return `${label.slice(0, max - 3)}...`;
}

export default function DevelopmentStoryGraph({ graph, onSelectNode, borderless = false }) {
  const [activeNodeId, setActiveNodeId] = useState("");

  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  const pipelineNodes = useMemo(() => {
    const ordered = [];
    const used = new Set();
    NODE_TYPE_ORDER.forEach((type) => {
      const match = nodes.find((node) => node.node_type === type);
      if (match) {
        ordered.push(match);
        used.add(match.node_id);
      }
    });
    nodes.forEach((node) => {
      if (!used.has(node.node_id)) {
        ordered.push(node);
      }
    });
    return ordered;
  }, [nodes]);

  const edgeByLink = useMemo(() => {
    const map = new Map();
    edges.forEach((edge) => {
      map.set(`${edge.from}->${edge.to}`, edge);
    });
    return map;
  }, [edges]);

  const handleSelect = (node) => {
    setActiveNodeId(node.node_id);
    onSelectNode?.(node);
  };

  const frameWidth = useMemo(() => Math.max(680, pipelineNodes.length * 260), [pipelineNodes.length]);

  const rootClass = borderless
    ? "px-0 py-0"
    : "rounded-xl border border-white/10 bg-black/30 px-3 py-3 backdrop-blur-md";
  const railClass = borderless
    ? "overflow-x-auto rounded-lg bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.14),transparent_66%)]"
    : "overflow-x-auto rounded-lg border border-white/10 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.14),transparent_66%)]";

  return (
    <div className={rootClass}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.13em] text-zinc-500">Story Pipeline</div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">select node</div>
      </div>

      {pipelineNodes.length ? (
        <div className={railClass}>
          <div className="mx-auto min-w-full px-4 py-4" style={{ width: `${frameWidth}px` }}>
            <div className="flex items-start">
              {pipelineNodes.map((node, index) => {
                const isActive = activeNodeId === node.node_id;
                const meta = NODE_TYPE_META[node.node_type] || NODE_TYPE_META.theme;
                const Icon = meta.icon;
                const edge = index < pipelineNodes.length - 1 ? edgeByLink.get(`${node.node_id}->${pipelineNodes[index + 1].node_id}`) : null;

                return (
                  <Fragment key={node.node_id}>
                    <motion.button
                      type="button"
                      onClick={() => handleSelect(node)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="atlas-focus-ring flex w-[168px] shrink-0 flex-col items-center rounded-xl px-2 py-2 text-center"
                    >
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl border bg-gradient-to-br shadow-[0_12px_28px_rgba(0,0,0,0.48)] transition ${
                          isActive ? `${meta.border} ${meta.bg}` : "border-white/15 from-zinc-700/20 to-zinc-900/20"
                        }`}
                      >
                        <Icon className={`h-7 w-7 ${isActive ? meta.tone : "text-zinc-400"}`} />
                      </div>
                      <div className={`mt-2 text-[10px] uppercase tracking-[0.12em] ${isActive ? meta.tone : "text-zinc-500"}`}>{meta.title}</div>
                      <div className={`mt-1 min-h-[34px] text-[11px] leading-tight ${isActive ? "text-zinc-100" : "text-zinc-300"}`}>
                        {clipLabel(node.label, 34)}
                      </div>
                    </motion.button>

                    {index < pipelineNodes.length - 1 ? (
                      <div className="mx-1 flex w-[92px] shrink-0 flex-col items-center pt-10">
                        <div className="relative w-full">
                          <div className="h-[2px] w-full rounded-full bg-gradient-to-r from-white/30 via-zinc-100/70 to-white/30" />
                          <ArrowRight className="absolute -right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-300" />
                        </div>
                        <div className="mt-2 line-clamp-2 text-center text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                          {edge?.label || "transmission"}
                        </div>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center text-xs text-zinc-500">No graph data available.</div>
      )}
    </div>
  );
}
