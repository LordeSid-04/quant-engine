import React from "react";
import { ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import RadialRiskChart from "../components/radar/RadialRiskChart";
import RiskSummaryCards from "../components/radar/RiskSummaryCards";
import { SectionHeading, SurfaceCard } from "@/components/premium/SurfaceCard";
import { fetchRiskRadar, getCachedRiskRadar } from "@/api/atlasClient";

export default function RiskRadar() {
  const cachedRisk = getCachedRiskRadar();
  const { data, isError } = useQuery({
    queryKey: ["risk-radar-live"],
    queryFn: fetchRiskRadar,
    initialData: cachedRisk || undefined,
    staleTime: 15 * 1000,
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-[calc(100vh-74px)] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1300px] space-y-4">
        <SurfaceCard tone="strong" className="p-5 sm:p-6">
          <SectionHeading
            eyebrow="Risk Radar"
            title="Global Macro Risk Architecture"
            description="Continuously tracks systemic pressure channels and emerging macro vulnerability clusters in real time."
            action={<ShieldAlert className="h-5 w-5 text-zinc-200" />}
          />
        </SurfaceCard>

        <RiskSummaryCards items={data?.summary_cards ?? []} />

        <SurfaceCard tone="strong" className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Radial Risk Architecture</h2>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Click nodes for detail</span>
          </div>
          <RadialRiskChart categories={data?.categories ?? []} />
        </SurfaceCard>
        {isError ? <div className="text-xs text-rose-300">Failed to load risk radar data.</div> : null}

        <SurfaceCard tone="soft" className="flex items-start gap-3 rounded-xl p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-zinc-200" />
          <div>
            <h3 className="mb-1 text-sm font-semibold text-zinc-100">Risk Assessment Summary</h3>
            <p className="text-xs leading-relaxed text-zinc-400">{data?.assessment_summary || "Loading assessment summary..."}</p>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
