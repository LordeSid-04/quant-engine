import React from "react";
import { cn } from "@/lib/utils";

const toneClass = {
  default: "atlas-surface",
  strong: "atlas-surface-strong",
  soft: "atlas-surface-soft",
};

export function SurfaceCard({ className, tone = "default", children, ...props }) {
  return (
    <section className={cn("rounded-2xl", toneClass[tone] || toneClass.default, className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, action, className }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {eyebrow ? <div className="atlas-chip">{eyebrow}</div> : null}
        {title ? <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">{title}</h2> : null}
        {description ? <p className="mt-1.5 max-w-4xl text-sm text-zinc-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatBadge({ label, value, tone = "text-zinc-100", className }) {
  return (
    <div className={cn("atlas-pill", className)}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <span className={cn("ml-2 text-xs font-medium", tone)}>{value}</span>
    </div>
  );
}
