import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Globe } from "lucide-react";

export default function PageNotFound() {
  return (
    <div className="min-h-[calc(100vh-96px)] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-6">
          <Globe className="w-8 h-8 text-cyan-400" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-slate-400 mb-6">This sector of the macro universe has not been charted yet.</p>
        <Link
          to={createPageUrl("WorldPulse")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20"
        >
          Return to World Pulse
        </Link>
      </div>
    </div>
  );
}