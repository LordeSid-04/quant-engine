from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.data.alpha_vantage_client import AlphaVantageClient
from app.data.db import SupabaseNotConfiguredError, get_supabase_client, safe_execute
from app.data.fred_client import FredClient
from app.data.market_symbols import MARKET_SYMBOL_SPECS, MarketSymbolSpec, all_watchlist_symbols
from app.data.stooq_client import StooqClient
from app.data.twelvedata_client import TwelveDataClient
from app.data.yahoo_client import YahooClient

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


@dataclass(slots=True)
class CuratedDataRepository:
    base_path: Path

    def _read_json(self, file_name: str) -> Any:
        return json.loads((self.base_path / file_name).read_text(encoding="utf-8"))

    def regions(self) -> list[dict[str, Any]]:
        return self._read_json("regions.json")

    def transmission_edges(self) -> list[dict[str, Any]]:
        return self._read_json("transmission_edges.json")

    def region_factor_weights(self) -> dict[str, Any]:
        return self._read_json("region_factor_weights.json")

    def scenario_catalog(self) -> dict[str, Any]:
        return self._read_json("scenario_catalog.json")

    def asset_sensitivity(self) -> list[dict[str, Any]]:
        return self._read_json("asset_sensitivity.json")

    def historical_regimes(self) -> dict[str, Any]:
        return self._read_json("historical_regimes.json")

    def risk_weights(self) -> dict[str, Any]:
        return self._read_json("risk_weights.json")

    def explanation_templates(self) -> dict[str, str]:
        return self._read_json("explanation_templates.json")

    def top_countries(self) -> list[dict[str, Any]]:
        return self._read_json("countries_top50.json")

    def theme_taxonomy(self) -> dict[str, Any]:
        return self._read_json("theme_taxonomy.json")

    def theme_seed_articles(self) -> list[dict[str, Any]]:
        return self._read_json("theme_seed_articles.json")

    def reliable_news_sources(self) -> dict[str, Any]:
        return self._read_json("reliable_news_sources.json")


class DataRepository:
    def __init__(self, curated_base_path: Path) -> None:
        self.settings = get_settings()
        self.curated = CuratedDataRepository(curated_base_path)

        self.stooq = StooqClient()
        self.twelvedata = TwelveDataClient()
        self.alpha_vantage = AlphaVantageClient()
        self.yahoo = YahooClient()
        self.fred = FredClient()

        self._quote_cache: dict[str, dict[str, Any]] = {}
        self._quote_cache_ts: dict[str, datetime] = {}
        self._quote_cache_lock: asyncio.Lock | None = None
        self._quote_cache_lock_loop: asyncio.AbstractEventLoop | None = None
        self._provider_backoff_until: dict[str, datetime] = {}
        self._symbol_refresh_backoff_until: dict[str, datetime] = {}
        self._refresh_concurrency = max(1, min(16, int(self.settings.market_refresh_max_concurrency)))
        self._refresh_semaphore: asyncio.Semaphore | None = None
        self._refresh_semaphore_loop: asyncio.AbstractEventLoop | None = None

        self._risk_snapshot_cache: dict[str, Any] | None = None
        self._world_pulse_snapshot_cache: dict[str, Any] | None = None
        self._daily_brief_snapshot_cache: dict[str, Any] | None = None
        self._daily_brief_history_cache: list[dict[str, Any]] = []
        self._public_memory_entries: list[dict[str, Any]] = []
        self._quote_last_supabase_upsert_ts: dict[str, datetime] = {}
        self._risk_snapshot_last_upsert_ts: datetime | None = None
        self._world_pulse_snapshot_last_upsert_ts: datetime | None = None
        self._daily_brief_snapshot_last_upsert_ts: datetime | None = None

        self._running = False
        self._poll_task: asyncio.Task[None] | None = None
        self._ws_task: asyncio.Task[None] | None = None
        self._startup_prewarm_task: asyncio.Task[None] | None = None

        self._watchlist_symbols = all_watchlist_symbols()
        self._twelvedata_reverse_lookup = self._build_twelvedata_reverse_lookup()

        try:
            self.supabase = get_supabase_client()
        except SupabaseNotConfiguredError:
            self.supabase = None

    async def start_market_streams(self) -> None:
        if self._running or not self.settings.market_background_enabled:
            return

        self._running = True
        if self.supabase is not None:
            asyncio.create_task(
                asyncio.to_thread(self._prime_runtime_cache_from_supabase),
                name="market-supabase-prewarm",
            )
        if self.settings.market_poll_enabled:
            self._poll_task = asyncio.create_task(self._poll_loop(), name="market-poll-loop")

        if self.twelvedata.configured and self.settings.twelvedata_ws_enabled:
            self._ws_task = asyncio.create_task(self._twelvedata_ws_loop(), name="market-twelvedata-ws")

        self._startup_prewarm_task = asyncio.create_task(
            self._warm_runtime_quotes(initial_delay_seconds=8.0),
            name="market-cache-prewarm",
        )

    async def stop_market_streams(self) -> None:
        self._running = False
        tasks = [task for task in [self._poll_task, self._ws_task] if task is not None]
        if not tasks:
            return

        for task in tasks:
            task.cancel()

        await asyncio.gather(*tasks, return_exceptions=True)
        if self._startup_prewarm_task is not None and not self._startup_prewarm_task.done():
            self._startup_prewarm_task.cancel()
            await asyncio.gather(self._startup_prewarm_task, return_exceptions=True)
        self._poll_task = None
        self._ws_task = None
        self._startup_prewarm_task = None

    async def _warm_runtime_quotes(self, *, initial_delay_seconds: float = 0.0) -> None:
        try:
            if initial_delay_seconds > 0:
                await asyncio.sleep(initial_delay_seconds)
            await self.fetch_quotes(self._watchlist_symbols, allow_cache=False)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Initial market quote prewarm skipped due to provider latency.", exc_info=True)

    def market_feed_status(self) -> dict[str, Any]:
        now = _utc_now()
        stale_symbols: list[str] = []
        ttl = max(0.1, float(self.settings.market_cache_ttl_seconds) * 5.0)

        for symbol in self._watchlist_symbols:
            updated_at = self._quote_cache_ts.get(symbol)
            if updated_at is None:
                stale_symbols.append(symbol)
                continue
            age = (now - updated_at).total_seconds()
            if age > ttl:
                stale_symbols.append(symbol)

        return {
            "providers": ["twelvedata", "alpha_vantage", "yahoo", "fred", "stooq", "supabase_cache"],
            "background_enabled": self.settings.market_background_enabled,
            "poll_enabled": self.settings.market_poll_enabled,
            "realtime_poll_seconds": self.settings.market_realtime_poll_seconds,
            "ws_enabled": bool(self.twelvedata.configured and self.settings.twelvedata_ws_enabled),
            "yahoo_enabled": self.settings.yahoo_enabled,
            "cache_size": len(self._quote_cache),
            "stale_symbols": stale_symbols,
            "running": self._running,
            "yahoo_backoff_seconds": _backoff_remaining_seconds(self._provider_backoff_until.get("yahoo")),
            "stooq_backoff_seconds": _backoff_remaining_seconds(self._provider_backoff_until.get("stooq")),
        }

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                symbols = self._symbols_needing_refresh()
                if symbols:
                    await self.fetch_quotes(symbols, allow_cache=False)
            except Exception as exc:  # pragma: no cover
                logger.warning("Market poll loop error: %s", exc)
            await asyncio.sleep(max(0.5, float(self.settings.market_realtime_poll_seconds)))

    async def _twelvedata_ws_loop(self) -> None:
        twelvedata_symbols = sorted(self._twelvedata_reverse_lookup.keys())
        if not twelvedata_symbols:
            return

        while self._running:
            try:
                async for tick in self.twelvedata.stream_prices(twelvedata_symbols):
                    if not self._running:
                        return
                    await self._apply_stream_tick(tick)
            except asyncio.CancelledError:
                return
            except Exception as exc:  # pragma: no cover
                logger.warning("Twelve Data websocket loop error: %s", exc)
            await asyncio.sleep(2)

    async def _apply_stream_tick(self, tick: dict[str, Any]) -> None:
        tv_symbol = str(tick.get("symbol", "")).upper().strip()
        if not tv_symbol:
            return

        frontend_symbols = self._twelvedata_reverse_lookup.get(tv_symbol, [])
        if not frontend_symbols:
            return

        price_value = _to_float(tick.get("price"))
        if price_value is None:
            return

        date_str, time_str = _normalize_stream_timestamp(str(tick.get("timestamp", "")))

        async with self._quote_cache_lock:
            for frontend_symbol in frontend_symbols:
                current = self._quote_cache.get(frontend_symbol, {})
                open_ = _to_float(current.get("open")) or price_value
                high = _max_ignore_none(_to_float(current.get("high")), price_value)
                low = _min_ignore_none(_to_float(current.get("low")), price_value)
                volume = str(tick.get("volume") or current.get("volume") or "0")

                quote = {
                    "symbol": frontend_symbol,
                    "date": date_str or current.get("date") or _utc_now_iso().split("T")[0],
                    "time": time_str or current.get("time") or _utc_now_iso().split("T")[1][:8],
                    "open": _fmt_num(open_),
                    "high": _fmt_num(high),
                    "low": _fmt_num(low),
                    "close": _fmt_num(price_value),
                    "volume": volume,
                    "source_provider": "twelvedata",
                    "source_symbol": tv_symbol,
                    "source_mode": "stream",
                    "source_observed_at": _iso_from_date_time(date_str, time_str),
                    "source_fetched_at": _utc_now_iso(),
                }
                self._quote_cache[frontend_symbol] = quote
                self._quote_cache_ts[frontend_symbol] = _utc_now()
                self._upsert_quote_supabase(frontend_symbol, quote)

    async def fetch_quotes(
        self,
        symbols: list[str],
        *,
        allow_cache: bool = True,
    ) -> dict[str, dict[str, Any] | None]:
        unique_symbols = sorted({self._normalize_symbol(s) for s in symbols if s})
        if not unique_symbols:
            return {}

        async def _load(symbol: str) -> tuple[str, dict[str, Any] | None]:
            async with self._get_refresh_semaphore():
                return symbol, await self._load_single_quote(symbol, allow_cache=allow_cache)

        results = await asyncio.gather(*[_load(symbol) for symbol in unique_symbols])
        return {symbol: quote for symbol, quote in results}

    async def _load_single_quote(self, symbol: str, *, allow_cache: bool) -> dict[str, Any] | None:
        if self._symbol_in_refresh_backoff(symbol):
            fallback_memory = self._quote_cache.get(symbol)
            if fallback_memory is not None:
                return self._quote_response(symbol, fallback_memory, mode_override="stale_memory_cache")
            if allow_cache and not self._running:
                fallback_supabase = self._fetch_quote_from_supabase(symbol)
                if fallback_supabase is not None:
                    return self._quote_response(symbol, fallback_supabase, mode_override="supabase_cache")
            return None

        if allow_cache:
            streaming_active = bool(
                self._running
                and (
                    self.settings.market_poll_enabled
                    or (self.twelvedata.configured and self.settings.twelvedata_ws_enabled)
                )
            )
            cached = self._cache_get_if_fresh(symbol)
            if cached is not None:
                return self._quote_response(symbol, cached, mode_override="memory_cache")

            stale_memory = self._quote_cache.get(symbol)
            if stale_memory is not None and self._running:
                return self._quote_response(symbol, stale_memory, mode_override="stale_memory_cache")

            # Keep request paths fast while the background market loop is active.
            # The poller and websocket stream refresh the cache continuously; if a symbol
            # is not currently available in memory, avoid synchronous provider fanout.
            if streaming_active:
                return None

            stale_supabase = self._fetch_quote_from_supabase(symbol)
            if stale_supabase is not None:
                return self._quote_response(symbol, stale_supabase, mode_override="supabase_cache")

        spec = MARKET_SYMBOL_SPECS.get(symbol)

        quote = await self._fetch_from_twelvedata(symbol, spec)
        if quote:
            self._clear_symbol_refresh_backoff(symbol)
            await self._store_quote(symbol, quote)
            return self._quote_response(symbol, quote)

        quote = await self._fetch_from_alpha_vantage(symbol, spec)
        if quote:
            self._clear_symbol_refresh_backoff(symbol)
            await self._store_quote(symbol, quote)
            return self._quote_response(symbol, quote)

        quote = await self._fetch_from_yahoo(symbol, spec)
        if quote:
            self._clear_symbol_refresh_backoff(symbol)
            await self._store_quote(symbol, quote)
            return self._quote_response(symbol, quote)

        quote = await self._fetch_from_fred(symbol, spec)
        if quote:
            self._clear_symbol_refresh_backoff(symbol)
            await self._store_quote(symbol, quote)
            return self._quote_response(symbol, quote)

        quote = await self._fetch_from_stooq(symbol, spec)
        if quote:
            self._clear_symbol_refresh_backoff(symbol)
            await self._store_quote(symbol, quote)
            return self._quote_response(symbol, quote)

        fallback_memory = self._quote_cache.get(symbol)
        if fallback_memory is not None:
            return self._quote_response(symbol, fallback_memory, mode_override="stale_memory_cache")

        if allow_cache:
            fallback_supabase = self._fetch_quote_from_supabase(symbol)
            if fallback_supabase is not None:
                self._clear_symbol_refresh_backoff(symbol)
                return self._quote_response(symbol, fallback_supabase, mode_override="supabase_cache")
        self._set_symbol_refresh_backoff(symbol)
        return None

    async def _fetch_from_twelvedata(
        self,
        symbol: str,
        spec: MarketSymbolSpec | None,
    ) -> dict[str, Any] | None:
        if not self.twelvedata.configured or spec is None:
            return None

        for candidate in spec.twelvedata_candidates:
            try:
                quote = await self.twelvedata.fetch_quote(candidate)
            except Exception:
                continue
            if quote is None:
                continue

            quote["symbol"] = symbol
            quote["source_provider"] = "twelvedata"
            quote["source_symbol"] = candidate
            quote["source_mode"] = "live_api"
            quote["source_observed_at"] = _iso_from_date_time(str(quote.get("date", "")), str(quote.get("time", "")))
            quote["source_fetched_at"] = _utc_now_iso()
            return _normalize_quote_defaults(quote)
        return None

    async def _fetch_from_alpha_vantage(
        self,
        symbol: str,
        spec: MarketSymbolSpec | None,
    ) -> dict[str, Any] | None:
        if spec is None or spec.alpha_vantage_pair is None:
            return None

        from_currency, to_currency = spec.alpha_vantage_pair
        try:
            quote = await self.alpha_vantage.fetch_fx_quote(from_currency, to_currency)
        except Exception:
            return None

        if quote is None:
            return None

        quote["symbol"] = symbol
        quote["source_provider"] = "alpha_vantage"
        quote["source_symbol"] = f"{from_currency}/{to_currency}"
        quote["source_mode"] = "live_api"
        quote["source_observed_at"] = _iso_from_date_time(str(quote.get("date", "")), str(quote.get("time", "")))
        quote["source_fetched_at"] = _utc_now_iso()
        return _normalize_quote_defaults(quote)

    async def _fetch_from_fred(
        self,
        symbol: str,
        spec: MarketSymbolSpec | None,
    ) -> dict[str, Any] | None:
        if spec is None or spec.fred_series is None:
            return None

        try:
            value = await self.fred.fetch_latest_value(spec.fred_series)
        except Exception:
            return None

        if value is None:
            return None

        now = _utc_now()
        return {
            "symbol": symbol,
            "date": now.date().isoformat(),
            "time": now.time().replace(microsecond=0).isoformat(),
            "open": _fmt_num(value),
            "high": _fmt_num(value),
            "low": _fmt_num(value),
            "close": _fmt_num(value),
            "volume": "0",
            "source_provider": "fred",
            "source_symbol": spec.fred_series,
            "source_mode": "live_api",
            "source_observed_at": now.isoformat(),
            "source_fetched_at": now.isoformat(),
        }

    async def _fetch_from_yahoo(
        self,
        symbol: str,
        spec: MarketSymbolSpec | None,
    ) -> dict[str, Any] | None:
        if spec is None or not self.settings.yahoo_enabled or self._provider_in_backoff("yahoo"):
            return None

        for candidate in spec.yahoo_candidates:
            try:
                quote = await self.yahoo.fetch_quote(candidate)
            except Exception:
                self._set_provider_backoff("yahoo", seconds=60)
                return None

            if quote is None:
                continue

            quote["symbol"] = symbol
            quote["source_provider"] = "yahoo"
            quote["source_symbol"] = candidate
            quote["source_mode"] = "live_api"
            quote["source_observed_at"] = _iso_from_date_time(str(quote.get("date", "")), str(quote.get("time", "")))
            quote["source_fetched_at"] = _utc_now_iso()
            return _normalize_quote_defaults(quote)
        return None

    async def _fetch_from_stooq(
        self,
        symbol: str,
        spec: MarketSymbolSpec | None,
    ) -> dict[str, Any] | None:
        if self._provider_in_backoff("stooq"):
            return None

        stooq_symbol = spec.stooq_symbol if spec and spec.stooq_symbol else symbol
        try:
            fetched = await self.stooq.fetch_quote(stooq_symbol)
        except RuntimeError as exc:
            if "stooq_rate_limited" in str(exc):
                self._set_provider_backoff("stooq", seconds=600)
            else:
                self._set_provider_backoff("stooq", seconds=60)
            return None
        except Exception:
            self._set_provider_backoff("stooq", seconds=60)
            return None

        if fetched is None:
            return None

        return {
            "symbol": symbol,
            "date": fetched.date,
            "time": fetched.time,
            "open": fetched.open,
            "high": fetched.high,
            "low": fetched.low,
            "close": fetched.close,
            "volume": fetched.volume,
            "source_provider": "stooq",
            "source_symbol": stooq_symbol,
            "source_mode": "live_api",
            "source_observed_at": _iso_from_date_time(fetched.date, fetched.time),
            "source_fetched_at": _utc_now_iso(),
        }

    def _provider_in_backoff(self, provider: str) -> bool:
        until = self._provider_backoff_until.get(provider)
        if until is None:
            return False
        return _utc_now() < until

    def _set_provider_backoff(self, provider: str, *, seconds: int) -> None:
        self._provider_backoff_until[provider] = _utc_now() + timedelta(seconds=seconds)

    def _symbol_in_refresh_backoff(self, symbol: str) -> bool:
        until = self._symbol_refresh_backoff_until.get(symbol)
        if until is None:
            return False
        return _utc_now() < until

    def _set_symbol_refresh_backoff(self, symbol: str) -> None:
        seconds = max(1.0, float(self.settings.market_refresh_fail_backoff_seconds))
        self._symbol_refresh_backoff_until[symbol] = _utc_now() + timedelta(seconds=seconds)

    def _clear_symbol_refresh_backoff(self, symbol: str) -> None:
        self._symbol_refresh_backoff_until.pop(symbol, None)

    async def _store_quote(self, symbol: str, quote: dict[str, Any]) -> None:
        async with self._get_quote_cache_lock():
            normalized = _normalize_quote_defaults(quote)
            self._quote_cache[symbol] = normalized
            self._quote_cache_ts[symbol] = _utc_now()
            self._upsert_quote_supabase(symbol, normalized)

    def _cache_get_if_fresh(self, symbol: str) -> dict[str, Any] | None:
        quote = self._quote_cache.get(symbol)
        updated_at = self._quote_cache_ts.get(symbol)
        if quote is None or updated_at is None:
            return None

        age_seconds = (_utc_now() - updated_at).total_seconds()
        if age_seconds > max(0.1, float(self.settings.market_cache_ttl_seconds)):
            return None

        return quote

    def _quote_response(
        self,
        symbol: str,
        quote: dict[str, Any],
        *,
        mode_override: str | None = None,
    ) -> dict[str, Any]:
        normalized = _normalize_quote_defaults(quote)

        cache_time = self._quote_cache_ts.get(symbol)
        if cache_time is not None:
            age_seconds = max(0, int((_utc_now() - cache_time).total_seconds()))
        else:
            fetched = normalized.get("source_fetched_at", "")
            fetched_dt = _parse_iso_utc(fetched)
            age_seconds = 0 if fetched_dt is None else max(0, int((_utc_now() - fetched_dt).total_seconds()))

        mode = mode_override or str(normalized.get("source_mode", "unknown"))
        return {
            "symbol": normalized["symbol"],
            "date": normalized["date"],
            "time": normalized["time"],
            "open": normalized["open"],
            "high": normalized["high"],
            "low": normalized["low"],
            "close": normalized["close"],
            "volume": normalized["volume"],
            "provenance": {
                "provider": str(normalized.get("source_provider", "unknown")),
                "provider_symbol": str(normalized.get("source_symbol", symbol)),
                "mode": mode,
                "observed_at": str(normalized.get("source_observed_at", "")),
                "fetched_at": str(normalized.get("source_fetched_at", "")),
                "age_seconds": age_seconds,
            },
        }

    def _build_twelvedata_reverse_lookup(self) -> dict[str, list[str]]:
        lookup: dict[str, list[str]] = {}
        for frontend_symbol, spec in MARKET_SYMBOL_SPECS.items():
            for candidate in spec.twelvedata_candidates:
                key = candidate.upper()
                lookup.setdefault(key, []).append(frontend_symbol)
        return lookup

    def _normalize_symbol(self, symbol: str) -> str:
        return symbol.strip().lower()

    def _symbols_needing_refresh(self) -> list[str]:
        needed: list[str] = []
        for symbol in self._watchlist_symbols:
            if self._cache_get_if_fresh(symbol) is not None:
                continue
            if self._symbol_in_refresh_backoff(symbol):
                continue
            needed.append(symbol)
        return needed

    def _upsert_quote_supabase(self, symbol: str, quote: dict[str, Any]) -> None:
        if self.supabase is None:
            return
        if not self._should_upsert_quote_to_supabase(symbol):
            return
        payload = {
            "symbol": symbol,
            "date": quote["date"],
            "time": quote["time"],
            "open": quote["open"],
            "high": quote["high"],
            "low": quote["low"],
            "close": quote["close"],
            "volume": quote["volume"],
            "source_provider": quote.get("source_provider", "unknown"),
            "source_symbol": quote.get("source_symbol", symbol),
            "source_mode": quote.get("source_mode", "unknown"),
            "source_observed_at": quote.get("source_observed_at", ""),
            "source_fetched_at": quote.get("source_fetched_at", ""),
            "updated_at": _utc_now_iso(),
        }
        self._dispatch_supabase_write(
            lambda: safe_execute(
                self.supabase.table("market_quotes_latest").upsert(payload, on_conflict="symbol"),
                default=[],
            )
        )

    def _fetch_quote_from_supabase(self, symbol: str) -> dict[str, Any] | None:
        if self.supabase is None:
            return None
        rows = safe_execute(
            self.supabase.table("market_quotes_latest").select("*").eq("symbol", symbol).limit(1),
            default=[],
        )
        if not rows:
            return None
        row = rows[0]
        return {
            "symbol": row.get("symbol", symbol),
            "date": row.get("date", ""),
            "time": row.get("time", ""),
            "open": row.get("open", ""),
            "high": row.get("high", ""),
            "low": row.get("low", ""),
            "close": row.get("close", ""),
            "volume": row.get("volume", ""),
            "source_provider": row.get("source_provider", "supabase_cache"),
            "source_symbol": row.get("source_symbol", symbol),
            "source_mode": row.get("source_mode", "supabase_cache"),
            "source_observed_at": row.get("source_observed_at", ""),
            "source_fetched_at": row.get("source_fetched_at", row.get("updated_at", "")),
        }

    def get_latest_risk_snapshot(self) -> dict[str, Any] | None:
        if self._risk_snapshot_cache is not None:
            return self._risk_snapshot_cache
        if self.supabase is None:
            return self._risk_snapshot_cache
        if self._running:
            return self._risk_snapshot_cache

        rows = safe_execute(
            self.supabase.table("risk_snapshots").select("payload,as_of").order("as_of", desc=True).limit(1),
            default=[],
        )
        if not rows:
            return self._risk_snapshot_cache
        payload = rows[0].get("payload")
        if isinstance(payload, dict):
            self._risk_snapshot_cache = payload
            return payload
        return None

    def save_risk_snapshot(self, payload: dict[str, Any]) -> None:
        self._risk_snapshot_cache = payload
        if self.supabase is None:
            return
        if not self._should_upsert_snapshot(self._risk_snapshot_last_upsert_ts):
            return
        self._risk_snapshot_last_upsert_ts = _utc_now()
        self._dispatch_supabase_write(
            lambda: safe_execute(
                self.supabase.table("risk_snapshots").insert({"payload": payload, "as_of": _utc_now_iso()}),
                default=[],
            )
        )

    def get_latest_world_pulse_snapshot(self) -> dict[str, Any] | None:
        if self._world_pulse_snapshot_cache is not None:
            return self._world_pulse_snapshot_cache
        if self.supabase is None:
            return self._world_pulse_snapshot_cache
        if self._running:
            return self._world_pulse_snapshot_cache

        rows = safe_execute(
            self.supabase.table("world_pulse_snapshots")
            .select("payload,as_of")
            .order("as_of", desc=True)
            .limit(1),
            default=[],
        )
        if not rows:
            return self._world_pulse_snapshot_cache
        payload = rows[0].get("payload")
        if isinstance(payload, dict):
            self._world_pulse_snapshot_cache = payload
            return payload
        return None

    def save_world_pulse_snapshot(self, payload: dict[str, Any]) -> None:
        self._world_pulse_snapshot_cache = payload
        if self.supabase is None:
            return
        if not self._should_upsert_snapshot(self._world_pulse_snapshot_last_upsert_ts):
            return
        self._world_pulse_snapshot_last_upsert_ts = _utc_now()
        self._dispatch_supabase_write(
            lambda: safe_execute(
                self.supabase.table("world_pulse_snapshots").insert({"payload": payload, "as_of": _utc_now_iso()}),
                default=[],
            )
        )

    def get_latest_daily_brief_snapshot(self) -> dict[str, Any] | None:
        if self._daily_brief_snapshot_cache is not None:
            return self._daily_brief_snapshot_cache
        if self.supabase is None:
            return self._daily_brief_snapshot_cache
        if self._running:
            return self._daily_brief_snapshot_cache

        rows = safe_execute(
            self.supabase.table("daily_brief_snapshots").select("payload,as_of").order("as_of", desc=True).limit(1),
            default=[],
        )
        if not rows:
            return self._daily_brief_snapshot_cache
        payload = rows[0].get("payload")
        if isinstance(payload, dict):
            self._daily_brief_snapshot_cache = payload
            return payload
        return None

    def get_daily_brief_history(self, *, limit: int = 20) -> list[dict[str, Any]]:
        bounded_limit = max(1, min(120, int(limit)))
        if self._daily_brief_history_cache:
            return [dict(row) for row in self._daily_brief_history_cache[:bounded_limit]]
        if self.supabase is None:
            return []

        rows = safe_execute(
            self.supabase.table("daily_brief_snapshots")
            .select("payload,as_of")
            .order("as_of", desc=True)
            .limit(bounded_limit),
            default=[],
        )
        if not rows:
            return []
        normalized = [{"payload": row.get("payload"), "as_of": row.get("as_of")} for row in rows]
        self._daily_brief_history_cache = normalized[:60]
        return normalized

    def save_daily_brief_snapshot(self, payload: dict[str, Any]) -> None:
        self._daily_brief_snapshot_cache = payload
        entry = {"payload": payload, "as_of": _utc_now_iso()}
        self._daily_brief_history_cache = [entry] + self._daily_brief_history_cache[:59]

        if self.supabase is None:
            return
        if not self._should_upsert_snapshot(self._daily_brief_snapshot_last_upsert_ts):
            return
        self._daily_brief_snapshot_last_upsert_ts = _utc_now()
        self._dispatch_supabase_write(
            lambda: safe_execute(
                self.supabase.table("daily_brief_snapshots").insert({"payload": payload, "as_of": _utc_now_iso()}),
                default=[],
            )
        )

    def save_public_memory_entry(self, payload: dict[str, Any], *, created_at: str | None = None) -> str:
        entry_id = str(payload.get("id") or f"memory-{_utc_now().strftime('%Y%m%d%H%M%S%f')}")
        row = {
            "id": entry_id,
            "created_at": str(created_at or _utc_now_iso()),
            "payload": payload,
        }
        self._public_memory_entries = [row] + self._public_memory_entries[:199]

        if self.supabase is not None:
            safe_execute(
                self.supabase.table("public_memory_entries").insert(row),
                default=[],
            )
        return entry_id

    def get_public_memory_entries(self, *, theme_id: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        bounded_limit = max(1, min(200, int(limit)))
        normalized_theme = str(theme_id or "").strip().lower()

        entries = [dict(item) for item in self._public_memory_entries]
        if not entries and self.supabase is not None:
            rows = safe_execute(
                self.supabase.table("public_memory_entries").select("*").order("created_at", desc=True).limit(bounded_limit),
                default=[],
            )
            entries = [dict(row) for row in rows]
            if entries:
                self._public_memory_entries = entries[:200]

        if normalized_theme:
            filtered = []
            for row in entries:
                payload = row.get("payload", {})
                if not isinstance(payload, dict):
                    continue
                row_theme = str(payload.get("theme_id", "")).strip().lower()
                if row_theme == normalized_theme:
                    filtered.append(row)
            entries = filtered

        return entries[:bounded_limit]

    def get_public_memory_entry(self, entry_id: str) -> dict[str, Any] | None:
        normalized_id = str(entry_id or "").strip()
        if not normalized_id:
            return None

        entries = [dict(item) for item in self._public_memory_entries]
        if not entries and self.supabase is not None:
            rows = safe_execute(
                self.supabase.table("public_memory_entries").select("*").eq("id", normalized_id).limit(1),
                default=[],
            )
            if rows:
                row = dict(rows[0])
                self._public_memory_entries = [row] + self._public_memory_entries[:199]
                return row
            return None

        for row in entries:
            if str(row.get("id", "")).strip() == normalized_id:
                return row
        return None

    def _dispatch_supabase_write(self, operation: Any) -> None:
        if self.supabase is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            operation()
            return
        loop.create_task(asyncio.to_thread(operation))

    def _should_upsert_quote_to_supabase(self, symbol: str) -> bool:
        interval = max(0.0, float(self.settings.supabase_quote_upsert_interval_seconds))
        if interval <= 0:
            return True
        now = _utc_now()
        last = self._quote_last_supabase_upsert_ts.get(symbol)
        if last is not None and (now - last).total_seconds() < interval:
            return False
        self._quote_last_supabase_upsert_ts[symbol] = now
        return True

    def _should_upsert_snapshot(self, last_upsert: datetime | None) -> bool:
        interval = max(0.0, float(self.settings.supabase_snapshot_upsert_interval_seconds))
        if interval <= 0:
            return True
        if last_upsert is None:
            return True
        return (_utc_now() - last_upsert).total_seconds() >= interval

    def _prime_runtime_cache_from_supabase(self) -> None:
        if self.supabase is None:
            return

        quote_rows = safe_execute(
            self.supabase.table("market_quotes_latest").select("*").in_("symbol", self._watchlist_symbols),
            default=[],
        )
        for row in quote_rows:
            symbol = str(row.get("symbol", "")).strip().lower()
            if not symbol:
                continue
            quote = {
                "symbol": symbol,
                "date": row.get("date", ""),
                "time": row.get("time", ""),
                "open": row.get("open", ""),
                "high": row.get("high", ""),
                "low": row.get("low", ""),
                "close": row.get("close", ""),
                "volume": row.get("volume", ""),
                "source_provider": row.get("source_provider", "supabase_cache"),
                "source_symbol": row.get("source_symbol", symbol),
                "source_mode": "supabase_cache",
                "source_observed_at": row.get("source_observed_at", ""),
                "source_fetched_at": row.get("source_fetched_at", row.get("updated_at", "")),
            }
            normalized = _normalize_quote_defaults(quote)
            self._quote_cache[symbol] = normalized
            fetched_dt = _parse_iso_utc(str(normalized.get("source_fetched_at", "")))
            self._quote_cache_ts[symbol] = fetched_dt or _utc_now()

        risk_rows = safe_execute(
            self.supabase.table("risk_snapshots").select("payload").order("as_of", desc=True).limit(1),
            default=[],
        )
        if risk_rows:
            payload = risk_rows[0].get("payload")
            if isinstance(payload, dict):
                self._risk_snapshot_cache = payload

        world_rows = safe_execute(
            self.supabase.table("world_pulse_snapshots").select("payload").order("as_of", desc=True).limit(1),
            default=[],
        )
        if world_rows:
            payload = world_rows[0].get("payload")
            if isinstance(payload, dict):
                self._world_pulse_snapshot_cache = payload

        brief_rows = safe_execute(
            self.supabase.table("daily_brief_snapshots")
            .select("payload,as_of")
            .order("as_of", desc=True)
            .limit(30),
            default=[],
        )
        if brief_rows:
            normalized = [{"payload": row.get("payload"), "as_of": row.get("as_of")} for row in brief_rows]
            self._daily_brief_history_cache = normalized
            first_payload = normalized[0].get("payload")
            if isinstance(first_payload, dict):
                self._daily_brief_snapshot_cache = first_payload

    def _get_quote_cache_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._quote_cache_lock is None or self._quote_cache_lock_loop is not loop:
            self._quote_cache_lock = asyncio.Lock()
            self._quote_cache_lock_loop = loop
        return self._quote_cache_lock

    def _get_refresh_semaphore(self) -> asyncio.Semaphore:
        loop = asyncio.get_running_loop()
        if self._refresh_semaphore is None or self._refresh_semaphore_loop is not loop:
            self._refresh_semaphore = asyncio.Semaphore(self._refresh_concurrency)
            self._refresh_semaphore_loop = loop
        return self._refresh_semaphore


def _normalize_quote_defaults(quote: dict[str, Any]) -> dict[str, Any]:
    now = _utc_now()
    date = str(quote.get("date") or "").strip() or now.date().isoformat()
    time = str(quote.get("time") or "").strip() or now.time().replace(microsecond=0).isoformat()

    close_num = _to_float(quote.get("close"))
    open_num = _to_float(quote.get("open")) or close_num or 0.0
    high_num = _to_float(quote.get("high"))
    low_num = _to_float(quote.get("low"))

    if high_num is None:
        high_num = close_num if close_num is not None else open_num
    if low_num is None:
        low_num = close_num if close_num is not None else open_num
    if close_num is None:
        close_num = open_num

    source_symbol = str(quote.get("source_symbol") or quote.get("symbol") or "").strip()
    source_observed_at = str(quote.get("source_observed_at") or "").strip() or _iso_from_date_time(date, time)
    source_fetched_at = str(quote.get("source_fetched_at") or "").strip() or now.isoformat()

    return {
        "symbol": str(quote.get("symbol", "")).strip().lower(),
        "date": date,
        "time": time,
        "open": _fmt_num(open_num),
        "high": _fmt_num(high_num),
        "low": _fmt_num(low_num),
        "close": _fmt_num(close_num),
        "volume": str(quote.get("volume") or "0"),
        "source_provider": str(quote.get("source_provider") or "unknown"),
        "source_symbol": source_symbol,
        "source_mode": str(quote.get("source_mode") or "unknown"),
        "source_observed_at": source_observed_at,
        "source_fetched_at": source_fetched_at,
    }


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt_num(value: float | None) -> str:
    if value is None:
        return "0"
    return f"{value:.8f}".rstrip("0").rstrip(".")


def _max_ignore_none(a: float | None, b: float | None) -> float | None:
    values = [value for value in [a, b] if value is not None]
    if not values:
        return None
    return max(values)


def _min_ignore_none(a: float | None, b: float | None) -> float | None:
    values = [value for value in [a, b] if value is not None]
    if not values:
        return None
    return min(values)


def _normalize_stream_timestamp(value: str) -> tuple[str, str]:
    normalized = value.strip().replace("T", " ")
    if not normalized:
        now = _utc_now()
        return now.date().isoformat(), now.time().replace(microsecond=0).isoformat()

    if normalized.isdigit():
        timestamp = datetime.fromtimestamp(int(normalized), tz=timezone.utc)
        return timestamp.date().isoformat(), timestamp.time().replace(microsecond=0).isoformat()

    if " " in normalized:
        date, time = normalized.split(" ", 1)
        return date.strip(), time.strip()

    if len(normalized) == 10:
        return normalized, ""

    return "", normalized


def _iso_from_date_time(date: str, time: str) -> str:
    cleaned_date = str(date or "").strip()
    cleaned_time = str(time or "").strip()
    if cleaned_time and not cleaned_date and "T" in cleaned_time:
        parsed_time = _parse_iso_utc(cleaned_time)
        if parsed_time is not None:
            return parsed_time.isoformat()
    if cleaned_date and cleaned_time:
        combined = f"{cleaned_date}T{cleaned_time}"
        parsed_combined = _parse_iso_utc(combined)
        if parsed_combined is not None:
            return parsed_combined.isoformat()
        if cleaned_time.endswith("Z") or "+" in cleaned_time:
            return combined
        return f"{combined}+00:00"
    if cleaned_date:
        return f"{cleaned_date}T00:00:00+00:00"
    return _utc_now_iso()


def _parse_iso_utc(value: str) -> datetime | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _backoff_remaining_seconds(until: datetime | None) -> int:
    if until is None:
        return 0
    delta = int((until - _utc_now()).total_seconds())
    return max(0, delta)
