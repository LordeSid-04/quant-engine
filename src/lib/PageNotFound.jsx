import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Globe } from "lucide-react";

export default function PageNotFound() {
  return (
    <div className="min-h-[calc(100vh-74px)] flex items-center justify-center p-6">
      <div className="atlas-surface-strong rounded-2xl px-10 py-12 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.06]">
          <Globe className="h-8 w-8 text-zinc-100" />
        </div>
        <h1 className="mb-2 text-4xl font-bold text-zinc-100">404</h1>
        <p className="mb-6 text-zinc-400">This sector of the macro universe has not been charted yet.</p>
        <Link
          to={createPageUrl("WorldPulse")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white px-6 py-3 font-semibold text-zinc-950 transition-all hover:bg-zinc-200"
        >
          Return to World Pulse
        </Link>
      </div>
    </div>
  );
}
