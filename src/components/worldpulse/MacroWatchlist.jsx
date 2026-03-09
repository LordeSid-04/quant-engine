import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Radio, RefreshCw } from "lucide-react";

const REFRESH_MS = 15000;

const SECTIONS = [
  {
    title: "Rates & Policy",
    items: [
      { key: "us2y", label: "US 2Y Treasury", symbol: "2yusy.b", unit: "%", decimals: 3 },
      { key: "us10y", label: "US 10Y Treasury", symbol: "10yusy.b", unit: "%", decimals: 3 },
      { key: "de10y", label: "Germany 10Y Bund", symbol: "10ydey.b", unit: "%", decimals: 3 },
      { key: "jp10y", label: "Japan 10Y Yield", symbol: "10yjpy.b", unit: "%", decimals: 3 },
      { key: "fedPath", label: "Fed Funds (proxy)", symbol: "zq.f", unit: "", decimals: 3 },
    ],
  },
  {
    title: "FX & Dollar",
    items: [
      { key: "dxy", label: "DXY (futures)", symbol: "dx.f", unit: "", decimals: 3 },
      { key: "eurusd", label: "EUR / USD", symbol: "eurusd", unit: "", decimals: 5 },
      { key: "usdjpy", label: "USD / JPY", symbol: "usdjpy", unit: "", decimals: 3 },
      { key: "usdcny", label: "USD / CNY", symbol: "usdcny", unit: "", decimals: 4 },
      { key: "usdsgd", label: "USD / SGD", symbol: "usdsgd", unit: "", decimals: 4 },
    ],
  },
  {
    title: "Commodities",
    items: [
      { key: "brent", label: "Brent Crude", symbol: "cb.f", unit: "", decimals: 2 },
      { key: "wti", label: "WTI Crude", symbol: "cl.f", unit: "", decimals: 2 },
      { key: "gold", label: "Gold", symbol: "gc.f", unit: "", decimals: 2 },
      { key: "copper", label: "Copper", symbol: "hg.f", unit: "", decimals: 2 },
      { key: "natgas", label: "Natural Gas", symbol: "ng.f", unit: "", decimals: 3 },
    ],
  },
  {
    title: "Risk Regime",
    items: [
      { key: "spx", label: "S&P 500", symbol: "^spx", unit: "", decimals: 2 },
      { key: "ndx", label: "Nasdaq 100", symbol: "^ndx", unit: "", decimals: 2 },
      { key: "eem", label: "EM Equity Proxy", symbol: "eem.us", unit: "", decimals: 2 },
      { key: "vix", label: "VIX (futures)", symbol: "vi.f", unit: "", decimals: 2 },
    ],
  },
];

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const formatValue = (value, decimals) => {
  if (value === null || value === undefined) return "--";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

function WatchRow({ item, quote }) {
  const close = quote?.close ?? null;
  const open = quote?.open ?? null;
  const changePct = close !== null && open ? ((close - open) / open) * 100 : null;
  const isUp = changePct !== null ? changePct > 0.02 : false;
  const isDown = changePct !== null ? changePct < -0.02 : false;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-slate-400">{item.label}</div>
        <div className="text-sm font-semibold text-slate-100">
          {formatValue(close, item.decimals)}
          {item.unit}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <div
          className={`inline-flex items-center gap-1 text-[11px] ${
            isUp ? "text-emerald-300" : isDown ? "text-rose-300" : "text-slate-500"
          }`}
        >
          {isUp ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : isDown ? (
            <ArrowDownRight className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          {changePct === null ? "--" : `${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`}
        </div>
        <div className="text-[10px] text-slate-500">{quote?.time ? `${quote.time} UTC` : "Loading..."}</div>
      </div>
    </div>
  );
}

export default function MacroWatchlist() {
  const allItems = useMemo(() => SECTIONS.flatMap((s) => s.items), []);
  const [quotes, setQuotes] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null); // when values changed
  const [lastChecked, setLastChecked] = useState(null); // when poll completed
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const snapshotRef = useRef("");
  const fetchingRef = useRef(false);
  const totalCount = allItems.length;

  const lastUpdatedRelative = useMemo(() => {
    if (!lastUpdated) return "--";
    const diffMs = nowTs - lastUpdated.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec <= 2) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  }, [lastUpdated, nowTs]);

  const availableCount = useMemo(
    () => allItems.filter((item) => Number.isFinite(quotes[item.key]?.close)).length,
    [allItems, quotes]
  );

  const health = useMemo(() => {
    if (!lastChecked) {
      return {
        label: "Syncing",
        className: "border-slate-500/25 bg-slate-500/10 text-slate-300",
      };
    }

    const ageMs = Date.now() - lastChecked.getTime();
    const coverage = totalCount ? availableCount / totalCount : 0;

    if (ageMs > REFRESH_MS * 2) {
      return {
        label: "Stale",
        className: "border-rose-500/25 bg-rose-500/10 text-rose-300",
      };
    }

    if (coverage < 0.8) {
      return {
        label: "Degraded",
        className: "border-amber-500/25 bg-amber-500/10 text-amber-300",
      };
    }

    return {
      label: "Healthy",
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    };
  }, [availableCount, lastChecked, totalCount]);

  const loadQuotes = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsRefreshing(true);

    const next = {};
    await Promise.all(
      allItems.map(async (item) => {
        try {
          const res = await fetch(`/api/stooq?symbol=${encodeURIComponent(item.symbol)}`);
          if (!res.ok) {
            next[item.key] = null;
            return;
          }
          const data = await res.json();
          next[item.key] = {
            close: toNumber(data.close),
            open: toNumber(data.open),
            time: data.time || "",
          };
        } catch {
          next[item.key] = null;
        }
      })
    );

    const snapshot = allItems
      .map((item) => {
        const q = next[item.key];
        return `${item.key}:${q?.close ?? "na"}:${q?.open ?? "na"}:${q?.time ?? ""}`;
      })
      .join("|");

    setQuotes(next);
    setLastChecked(new Date());

    if (snapshot !== snapshotRef.current) {
      snapshotRef.current = snapshot;
      setLastUpdated(new Date());
    }

    setIsRefreshing(false);
    fetchingRef.current = false;
  }, [allItems]);

  useEffect(() => {
    let isMounted = true;

    const safeLoad = async () => {
      if (!isMounted) return;
      await loadQuotes();
    };

    safeLoad();
    const timer = setInterval(safeLoad, REFRESH_MS);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [loadQuotes]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside className="atlas-glass-strong rounded-2xl border border-cyan-500/15 p-4 h-full overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white tracking-wide">Macro Watchlist</h2>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${health.className}`}>
            <Radio className="h-3 w-3" />
            {health.label}
          </span>
          <button
            type="button"
            onClick={loadQuotes}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/10 p-1.5 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="mb-3 text-[10px] text-slate-500">
        Feeds online: <span className="text-slate-300">{availableCount}/{totalCount}</span>
      </div>

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-2">{section.title}</h3>
            <div className="space-y-2">
              {section.items.map((item) => (
                <WatchRow key={item.key} item={item} quote={quotes[item.key]} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] text-slate-500">
        Source: Stooq market feed. Refresh: {Math.round(REFRESH_MS / 1000)}s. Last data change: {lastUpdatedRelative}
      </div>
    </aside>
  );
}
