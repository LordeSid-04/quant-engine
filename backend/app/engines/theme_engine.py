from __future__ import annotations

import asyncio
import hashlib
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.data.db import safe_execute
from app.data.mediastack_client import MediaStackClient
from app.data.repository import DataRepository
from app.engines.confidence_engine import compute_confidence
from app.engines.decay import clamp
from app.engines.explainer import make_trace
from app.engines.world_pulse_engine import FactorState, WorldPulseEngine
from app.schemas.themes import (
    ThemeLiveItem,
    ThemeLiveResponse,
    ThemeSourceArticle,
    ThemeSourcesResponse,
    ThemeTimelinePoint,
    ThemeTimelineResponse,
)


@dataclass(slots=True)
class ClassifiedArticle:
    article_id: str
    title: str
    url: str
    source: str
    published_at: datetime
    summary: str
    theme_scores: dict[str, float]
    matched_keywords: dict[str, list[str]]
    region_tags: list[str]
    asset_tags: list[str]
    relevance_score: float
    top_theme_id: str


class ThemeEngine:
    def __init__(self, repository: DataRepository, world_pulse_engine: WorldPulseEngine) -> None:
        self.repository = repository
        self.world_pulse_engine = world_pulse_engine
        self.settings = get_settings()

        taxonomy = self.repository.curated.theme_taxonomy()
        self.feed_defs: list[dict[str, str]] = [dict(item) for item in taxonomy.get("feeds", [])]
        self.theme_defs: list[dict[str, Any]] = [dict(item) for item in taxonomy.get("themes", [])]
        self.theme_by_id: dict[str, dict[str, Any]] = {item["id"]: item for item in self.theme_defs}
        self.region_keywords: dict[str, list[str]] = {
            key: [str(term).lower() for term in values] for key, values in taxonomy.get("region_keywords", {}).items()
        }
        self.asset_keywords: dict[str, list[str]] = {
            key: [str(term).lower() for term in values] for key, values in taxonomy.get("asset_keywords", {}).items()
        }
        self.severity_keywords: list[dict[str, Any]] = [dict(item) for item in taxonomy.get("severity_keywords", [])]
        self.source_quality: dict[str, float] = {
            str(key): float(value) for key, value in taxonomy.get("source_quality_weights", {}).items()
        }
        self.mediastack = MediaStackClient()

        self.templates = self.repository.curated.explanation_templates()
        self.seed_articles: list[dict[str, Any]] = self.repository.curated.theme_seed_articles()
        reliable_catalog = self.repository.curated.reliable_news_sources()
        catalog_names = [str(item).lower() for item in reliable_catalog.get("source_names", [])]
        catalog_domains = [str(item).lower() for item in reliable_catalog.get("domains", [])]
        self.reliable_source_names = set(catalog_names + [str(key).lower() for key in self.source_quality.keys()])
        self.reliable_source_domains = set(catalog_domains)

        self._theme_snapshot_cache: dict[str, Any] | None = None
        self._timeline_cache: list[dict[str, Any]] = []
        self._articles_cache: dict[str, dict[str, Any]] = {}
        self._live_response_cache: dict[int, dict[str, Any]] = {}

    async def get_live_themes(
        self,
        *,
        window_hours: int,
        limit: int,
        factor_state: FactorState | None = None,
    ) -> ThemeLiveResponse:
        bounded_window = int(clamp(window_hours, 12, 720))
        bounded_limit = int(clamp(limit, 1, 30))
        now = datetime.now(tz=timezone.utc)

        cache_ttl_seconds = max(3.0, float(self.settings.theme_live_cache_seconds))
        cache_entry = self._live_response_cache.get(bounded_window)
        if cache_entry:
            cached_as_of = _parse_datetime(cache_entry.get("as_of"))
            cached_response = cache_entry.get("response")
            if isinstance(cached_response, ThemeLiveResponse) and cached_as_of is not None:
                age_seconds = (now - cached_as_of).total_seconds()
                if age_seconds <= cache_ttl_seconds:
                    return cached_response.model_copy(update={"themes": list(cached_response.themes[:bounded_limit])})

        factor_state = factor_state or await self.world_pulse_engine.compute_factor_state()
        articles = await self._collect_articles(window_hours=bounded_window)
        classified = self._classify_articles(articles, factor_state.factors)
        previous_snapshot = self._latest_snapshot()
        as_of = now

        theme_items: list[ThemeLiveItem] = []
        for theme in self.theme_defs:
            theme_id = str(theme["id"])
            aggregate = self._aggregate_theme(theme_id, classified, factor_state.factors, bounded_window)
            prev = previous_snapshot.get(theme_id, {}) if isinstance(previous_snapshot, dict) else {}

            prev_temp = _safe_int(prev.get("temperature"), default=aggregate["temperature"])
            prev_state = str(prev.get("state", "neutral"))
            momentum = float(round(aggregate["temperature"] - prev_temp, 2))
            state = self._derive_state(
                temperature=aggregate["temperature"],
                momentum=momentum,
                previous_state=prev_state,
            )

            summary = (
                f"{theme['label']} is {state}. Mentions {aggregate['mention_count']}, "
                f"sources {aggregate['source_diversity']}, cross-region spread {aggregate['cross_region_spread']}."
            )
            trace = make_trace(
                summary=summary,
                top_factors=[
                    {
                        "factor": "mention_velocity",
                        "contribution": aggregate["velocity_score"],
                        "weight": 0.35,
                        "value": aggregate["velocity_score"],
                    },
                    {
                        "factor": "source_diversity",
                        "contribution": aggregate["source_diversity_score"],
                        "weight": 0.25,
                        "value": aggregate["source_diversity"],
                    },
                    {
                        "factor": "market_reaction",
                        "contribution": aggregate["market_reaction_score"],
                        "weight": 0.2,
                        "value": aggregate["market_reaction_score"],
                    },
                ],
            )

            item = ThemeLiveItem(
                theme_id=theme_id,
                label=str(theme["label"]),
                state=state,
                temperature=aggregate["temperature"],
                mention_count=aggregate["mention_count"],
                source_diversity=aggregate["source_diversity"],
                cross_region_spread=aggregate["cross_region_spread"],
                market_reaction_score=aggregate["market_reaction_score"],
                momentum=momentum,
                top_regions=aggregate["top_regions"],
                top_assets=aggregate["top_assets"],
                summary=summary,
                trace_id=trace.trace_id,
            )
            theme_items.append(item)

        theme_items.sort(key=lambda item: (item.temperature, item.mention_count), reverse=True)
        selected = theme_items[:bounded_limit]
        top = selected[:2]
        if len(top) == 1:
            top = top + top

        explanation = make_trace(
            summary=(
                f"Theme monitoring window {bounded_window}h: top active themes are "
                f"{top[0].label} ({top[0].temperature}) and {top[1].label} ({top[1].temperature})."
                if top
                else "Theme monitoring window has no active signals."
            ),
            top_factors=[
                {
                    "factor": item.theme_id,
                    "contribution": float(item.temperature),
                    "weight": 1.0,
                    "value": float(item.mention_count),
                }
                for item in selected[:5]
            ],
        )
        confidence = compute_confidence(
            freshness=factor_state.freshness,
            coverage=factor_state.coverage,
            stability=factor_state.stability,
        )

        self._save_runtime_state(as_of, theme_items, classified)
        self._persist_snapshot(as_of, theme_items)
        self._persist_timeseries(as_of, theme_items)
        self._persist_articles(classified)

        response = ThemeLiveResponse(
            as_of=as_of,
            window_hours=bounded_window,
            themes=selected,
            confidence=confidence,
            explanation=explanation,
        )
        cache_theme_count = max(12, bounded_limit)
        cache_response = response.model_copy(update={"themes": list(theme_items[:cache_theme_count])})
        self._live_response_cache[bounded_window] = {
            "as_of": as_of.isoformat(),
            "response": cache_response,
        }
        return response

    async def get_theme_timeline(
        self,
        *,
        theme_id: str,
        window_hours: int,
        max_points: int,
    ) -> ThemeTimelineResponse:
        normalized_theme_id = self._normalize_theme_id(theme_id)
        bounded_window = int(clamp(window_hours, 12, 2160))
        bounded_points = int(clamp(max_points, 10, 500))

        label = self._theme_label(normalized_theme_id)
        since = datetime.now(tz=timezone.utc) - timedelta(hours=bounded_window)
        rows = self._load_timeseries_rows(normalized_theme_id, since=since)
        if len(rows) < 2:
            await self.get_live_themes(
                window_hours=min(bounded_window, self.settings.theme_news_window_hours),
                limit=min(12, len(self.theme_defs)),
            )
            rows = self._load_timeseries_rows(normalized_theme_id, since=since)

        points = [
            ThemeTimelinePoint(
                as_of=_parse_datetime(row.get("as_of")) or datetime.now(tz=timezone.utc),
                temperature=_safe_int(row.get("temperature"), default=0),
                mention_count=_safe_int(row.get("mention_count"), default=0),
                state=str(row.get("state", "neutral")),
                momentum=float(row.get("momentum", 0.0)),
            )
            for row in rows[-bounded_points:]
        ]
        if len(points) < 2:
            live_snapshot = await self.get_live_themes(
                window_hours=min(max(24, bounded_window), self.settings.theme_news_window_hours),
                limit=max(12, len(self.theme_defs)),
            )
            live_item = next((item for item in live_snapshot.themes if item.theme_id == normalized_theme_id), None)
            points = self._synthesize_timeline_points(
                theme_id=normalized_theme_id,
                window_hours=bounded_window,
                max_points=bounded_points,
                live_item=live_item,
            )

        latest = (
            points[-1]
            if points
            else ThemeTimelinePoint(
                as_of=datetime.now(tz=timezone.utc),
                temperature=0,
                mention_count=0,
                state="neutral",
                momentum=0.0,
            )
        )
        explanation = make_trace(
            summary=(
                f"{label} timeline over {bounded_window}h shows latest temperature {latest.temperature} "
                f"with state {latest.state}."
            ),
            top_factors=[
                {
                    "factor": "temperature",
                    "contribution": float(latest.temperature),
                    "weight": 1.0,
                    "value": float(latest.temperature),
                },
                {
                    "factor": "momentum",
                    "contribution": float(latest.momentum),
                    "weight": 0.7,
                    "value": float(latest.momentum),
                },
            ],
        )

        return ThemeTimelineResponse(
            as_of=datetime.now(tz=timezone.utc),
            theme_id=normalized_theme_id,
            label=label,
            window_hours=bounded_window,
            points=points,
            explanation=explanation,
        )

    async def get_theme_sources(
        self,
        *,
        theme_id: str,
        window_hours: int,
        limit: int,
    ) -> ThemeSourcesResponse:
        normalized_theme_id = self._normalize_theme_id(theme_id)
        bounded_window = int(clamp(window_hours, 12, 720))
        bounded_limit = int(clamp(limit, 1, 100))
        label = self._theme_label(normalized_theme_id)

        since = datetime.now(tz=timezone.utc) - timedelta(hours=bounded_window)
        rows = self._load_article_rows(normalized_theme_id, since=since)
        if not rows:
            await self.get_live_themes(
                window_hours=min(bounded_window, self.settings.theme_news_window_hours),
                limit=min(12, len(self.theme_defs)),
            )
            rows = self._load_article_rows(normalized_theme_id, since=since)

        rows.sort(
            key=lambda row: (
                _parse_datetime(row.get("published_at")) or datetime.now(tz=timezone.utc),
                float(row.get("relevance_score", 0.0)),
            ),
            reverse=True,
        )
        selected_rows = rows[:bounded_limit]
        articles = [
            ThemeSourceArticle(
                article_id=str(row.get("id", "")),
                title=str(row.get("title", "")),
                url=str(row.get("url", "")),
                source=str(row.get("source", "")),
                published_at=_parse_datetime(row.get("published_at")) or datetime.now(tz=timezone.utc),
                region_tags=[str(item) for item in row.get("region_tags", [])],
                asset_tags=[str(item) for item in row.get("asset_tags", [])],
                relevance_score=float(clamp(float(row.get("relevance_score", 0.0)), 0.0, 1.0)),
                matched_keywords=[str(item) for item in row.get("matched_keywords", [])],
                excerpt=str(row.get("summary", "")),
            )
            for row in selected_rows
        ]

        explanation = make_trace(
            summary=(
                f"{label} includes {len(rows)} matched source items in the last {bounded_window}h; "
                f"showing top {len(articles)} by relevance and recency."
            ),
            top_factors=[
                {
                    "factor": article.source,
                    "contribution": float(article.relevance_score * 100.0),
                    "weight": 1.0,
                    "value": float(article.relevance_score),
                }
                for article in articles[:5]
            ],
        )

        return ThemeSourcesResponse(
            as_of=datetime.now(tz=timezone.utc),
            theme_id=normalized_theme_id,
            label=label,
            window_hours=bounded_window,
            total_articles=len(rows),
            articles=articles,
            explanation=explanation,
        )

    async def _collect_articles(self, *, window_hours: int) -> list[dict[str, Any]]:
        now = datetime.now(tz=timezone.utc)
        lower_bound = now - timedelta(hours=window_hours)
        max_articles = max(20, int(self.settings.theme_news_max_articles))

        collected: list[dict[str, Any]] = []
        if self.settings.theme_news_live_enabled:
            api_result, rss_result = await asyncio.gather(
                self._fetch_live_api_items(lower_bound=lower_bound, max_articles=max_articles),
                self._fetch_live_rss_items(lower_bound=lower_bound, max_articles=max_articles),
                return_exceptions=True,
            )
            api_rows = [] if isinstance(api_result, Exception) else list(api_result)
            rss_rows = [] if isinstance(rss_result, Exception) else list(rss_result)
            collected.extend(api_rows)

            # Keep institution-grade RSS feeds as an additional verification layer.
            rss_budget = max(10, min(max_articles, max_articles - len(api_rows) + 8))
            collected.extend(rss_rows[:rss_budget])

        # Guarantee enough verified rows for interactive headline browsing.
        # Live API + RSS rows are preferred; curated historical rows are appended only when
        # live coverage is sparse in the current refresh window.
        min_coverage_floor = min(max_articles, 36)
        if len(collected) < min_coverage_floor:
            remaining_slots = max(0, min_coverage_floor - len(collected))
            if remaining_slots > 0:
                collected.extend(self._seed_backfill(lower_bound=lower_bound, limit=remaining_slots))
            if len(collected) < min_coverage_floor:
                collected.extend(
                    self._seed_backfill(
                        lower_bound=None,
                        limit=max(0, min_coverage_floor - len(collected)),
                    )
                )
        if not collected:
            collected.extend(self._seed_backfill(lower_bound=None, limit=min(max_articles, 36)))

        deduped: dict[str, dict[str, Any]] = {}
        for article in collected:
            key = str(article.get("url", "")).strip().lower() or str(article.get("id", ""))
            if not key:
                continue
            existing = deduped.get(key)
            if existing is None:
                deduped[key] = article
                continue
            if article["published_at"] > existing["published_at"]:
                deduped[key] = article

        rows = sorted(deduped.values(), key=lambda item: item["published_at"], reverse=True)
        return rows[:max_articles]

    async def _fetch_live_api_items(self, *, lower_bound: datetime, max_articles: int) -> list[dict[str, Any]]:
        if not self.mediastack.configured:
            return []

        raw_items = await self.mediastack.fetch_news(
            keywords=self.settings.mediastack_keywords,
            categories=self.settings.mediastack_categories,
            languages=self.settings.mediastack_languages,
            limit=min(max_articles, int(self.settings.mediastack_max_articles)),
        )
        rows: list[dict[str, Any]] = []
        for item in raw_items:
            title = str(item.get("title", "")).strip()
            summary = str(item.get("description", "")).strip()
            url = str(item.get("url", "")).strip()
            source = str(item.get("source", "")).strip() or "mediastack"
            published = _parse_datetime(item.get("published_at")) or datetime.now(tz=timezone.utc)
            if not title or not url:
                continue
            if published < lower_bound:
                continue
            if not self._is_reliable_source(source=source, url=url):
                continue
            rows.append(
                {
                    "id": _make_article_id(url, title),
                    "title": title,
                    "url": url,
                    "source": source,
                    "published_at": published,
                    "summary": summary,
                }
            )

        rows.sort(key=lambda item: item["published_at"], reverse=True)
        return rows[:max_articles]

    def _seed_backfill(self, *, lower_bound: datetime | None, limit: int) -> list[dict[str, Any]]:
        bounded_limit = max(0, int(limit))
        if bounded_limit <= 0:
            return []

        rows: list[dict[str, Any]] = []
        for article in self.seed_articles:
            published = _parse_datetime(article.get("published_at"))
            if published is None:
                continue
            if lower_bound is not None and published < lower_bound:
                continue
            rows.append(
                {
                    "id": article.get("id") or _make_article_id(article.get("url"), article.get("title")),
                    "title": str(article.get("title", "")),
                    "url": str(article.get("url", "")),
                    "source": str(article.get("source", "seed")),
                    "published_at": published,
                    "summary": str(article.get("summary", "")),
                }
            )

            if len(rows) >= bounded_limit:
                break

        return rows

    async def _fetch_live_rss_items(self, *, lower_bound: datetime, max_articles: int) -> list[dict[str, Any]]:
        if not self.feed_defs:
            return []

        timeout = min(max(2.0, float(self.settings.theme_news_rss_timeout_seconds)), 2.75)
        items: list[dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async def fetch_feed(feed: dict[str, Any]) -> list[dict[str, Any]]:
                url = str(feed.get("url", "")).strip()
                source = str(feed.get("source", "rss"))
                if not url:
                    return []
                try:
                    response = await client.get(url)
                except Exception:
                    return []
                if response.status_code != 200 or not response.text:
                    return []
                return self._parse_rss_payload(response.text, source=source, lower_bound=lower_bound)

            results = await asyncio.gather(*(fetch_feed(feed) for feed in self.feed_defs), return_exceptions=True)
            for rows in results:
                if isinstance(rows, Exception):
                    continue
                items.extend(rows)

        items.sort(key=lambda item: item["published_at"], reverse=True)
        return items[:max_articles]

    def _parse_rss_payload(self, payload: str, *, source: str, lower_bound: datetime) -> list[dict[str, Any]]:
        try:
            root = ET.fromstring(payload)
        except ET.ParseError:
            return []

        rows: list[dict[str, Any]] = []
        item_nodes = root.findall(".//item")
        entry_nodes = root.findall(".//{http://www.w3.org/2005/Atom}entry")
        nodes = item_nodes + entry_nodes

        for node in nodes:
            title = _xml_text(node, ["title", "{http://www.w3.org/2005/Atom}title"]).strip()
            summary = _xml_text(
                node,
                [
                    "description",
                    "summary",
                    "{http://www.w3.org/2005/Atom}summary",
                    "{http://www.w3.org/2005/Atom}content",
                ],
            ).strip()
            link = _xml_text(node, ["link", "{http://www.w3.org/2005/Atom}link"]).strip()
            if not link:
                atom_link = node.find("{http://www.w3.org/2005/Atom}link")
                if atom_link is not None:
                    link = str(atom_link.attrib.get("href", "")).strip()

            published_raw = _xml_text(
                node,
                [
                    "pubDate",
                    "published",
                    "updated",
                    "{http://www.w3.org/2005/Atom}published",
                    "{http://www.w3.org/2005/Atom}updated",
                ],
            )
            published = _parse_datetime(published_raw) or datetime.now(tz=timezone.utc)
            if published < lower_bound:
                continue
            if not title or not link:
                continue
            if not self._is_reliable_source(source=source, url=link):
                continue

            rows.append(
                {
                    "id": _make_article_id(link, title),
                    "title": title,
                    "url": link,
                    "source": source,
                    "published_at": published,
                    "summary": summary,
                }
            )
        return rows

    def _is_reliable_source(self, *, source: str, url: str) -> bool:
        normalized_source = self._normalize_source_name(source)
        if normalized_source in self.reliable_source_names:
            return True

        domain = self._extract_domain(url)
        if not domain:
            return False
        if domain in self.reliable_source_domains:
            return True
        return any(domain.endswith(f".{known}") for known in self.reliable_source_domains)

    def _normalize_source_name(self, source: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", " ", str(source or "").strip().lower())
        return re.sub(r"\s+", " ", normalized).strip()

    def _extract_domain(self, url: str) -> str:
        try:
            netloc = urlparse(str(url or "").strip()).netloc.lower()
        except Exception:
            return ""
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc

    def _classify_articles(
        self,
        articles: list[dict[str, Any]],
        factors: dict[str, float],
    ) -> list[ClassifiedArticle]:
        classified: list[ClassifiedArticle] = []
        for article in articles:
            row = self._classify_article(article, factors)
            if row is not None:
                classified.append(row)
        return self._dedupe_near_duplicates(classified)

    def _classify_article(
        self,
        article: dict[str, Any],
        factors: dict[str, float],
    ) -> ClassifiedArticle | None:
        title = str(article.get("title", "")).strip()
        summary = str(article.get("summary", "")).strip()
        text = _normalize_text(" ".join([title, summary]))
        if not text:
            return None

        severity_bonus, severity_matches = _score_weighted_terms(text, self.severity_keywords)
        theme_scores: dict[str, float] = {}
        matched_keywords: dict[str, list[str]] = {}
        for theme in self.theme_defs:
            score, matches = _score_weighted_terms(text, theme.get("keywords", []))
            if score <= 0:
                continue
            market_alignment = self._market_alignment(theme_id=str(theme["id"]), factors=factors)
            total = score + severity_bonus * 0.35 + market_alignment * 1.2
            theme_scores[str(theme["id"])] = total
            matched_keywords[str(theme["id"])] = sorted(set(matches + severity_matches))

        if not theme_scores:
            inferred_theme_id = self._infer_theme_from_source_and_text(source=str(article.get("source", "")), text=text)
            if not inferred_theme_id:
                return None
            market_alignment = self._market_alignment(theme_id=inferred_theme_id, factors=factors)
            inferred_score = 1.25 + severity_bonus * 0.2 + market_alignment * 0.9
            theme_scores[inferred_theme_id] = inferred_score
            matched_keywords[inferred_theme_id] = severity_matches[:4] or ["institutional_update"]

        top_theme_id = max(theme_scores.items(), key=lambda item: item[1])[0]
        top_score = float(theme_scores[top_theme_id])
        region_tags = self._tag_dimensions(text, self.region_keywords)
        asset_tags = self._tag_dimensions(text, self.asset_keywords)

        source = str(article.get("source", "unknown"))
        source_weight = float(self.source_quality.get(source, 0.72))
        relevance = float(
            clamp(
                (top_score / 10.0) * 0.62
                + source_weight * 0.23
                + min(1.0, len(region_tags) / 3.0) * 0.1
                + min(1.0, len(asset_tags) / 3.0) * 0.05,
                0.0,
                1.0,
            )
        )

        return ClassifiedArticle(
            article_id=str(article.get("id", _make_article_id(article.get("url"), title))),
            title=title,
            url=str(article.get("url", "")).strip(),
            source=source,
            published_at=_parse_datetime(article.get("published_at")) or datetime.now(tz=timezone.utc),
            summary=summary,
            theme_scores=theme_scores,
            matched_keywords=matched_keywords,
            region_tags=region_tags,
            asset_tags=asset_tags,
            relevance_score=round(relevance, 4),
            top_theme_id=top_theme_id,
        )

    def _infer_theme_from_source_and_text(self, *, source: str, text: str) -> str:
        normalized_source = self._normalize_source_name(source)
        source_checks = (
            ("federal reserve", "monetary-policy"),
            ("european central bank", "monetary-policy"),
            ("bank of england", "monetary-policy"),
            ("bank of japan", "monetary-policy"),
            ("imf", "growth-slowdown"),
            ("world bank", "growth-slowdown"),
            ("oecd", "growth-slowdown"),
            ("bis", "banking-liquidity"),
        )
        for token, theme_id in source_checks:
            if token in normalized_source:
                return theme_id

        text_checks: list[tuple[tuple[str, ...], str]] = [
            (("inflation", "cpi", "price pressure", "cost pressure"), "inflation-shock"),
            (("rate", "yield", "policy", "tightening", "easing", "central bank"), "monetary-policy"),
            (("growth", "recession", "output", "demand", "gdp"), "growth-slowdown"),
            (("oil", "energy", "gas", "opec", "commodity"), "energy-supply"),
            (("war", "military", "conflict", "sanction", "ceasefire"), "geopolitical-risk"),
            (("liquidity", "funding", "bank", "credit spread", "debt market"), "banking-liquidity"),
            (("tariff", "trade", "export", "import", "supply chain"), "trade-regulation"),
        ]
        for terms, theme_id in text_checks:
            if any(term in text for term in terms):
                return theme_id
        return ""

    def _synthesize_timeline_points(
        self,
        *,
        theme_id: str,
        window_hours: int,
        max_points: int,
        live_item: ThemeLiveItem | None,
    ) -> list[ThemeTimelinePoint]:
        bucket_count = max(12, min(int(max_points), 48))
        now = datetime.now(tz=timezone.utc)
        since = now - timedelta(hours=max(12, int(window_hours)))
        step_hours = max(1.0, float(window_hours) / max(1, bucket_count - 1))
        article_rows = self._load_article_rows(theme_id, since=since)

        anchor_temp = float(live_item.temperature if live_item is not None else 48.0)
        anchor_momentum = float(live_item.momentum if live_item is not None else 0.0)
        prev_state = str(live_item.state if live_item is not None else "neutral")
        prev_temp = anchor_temp

        points: list[ThemeTimelinePoint] = []
        for index in range(bucket_count):
            progress = index / max(1, bucket_count - 1)
            as_of = since + timedelta(hours=step_hours * index)
            bucket_start = as_of - timedelta(hours=max(2.0, step_hours))

            mention_count = 0
            for row in article_rows:
                published = _parse_datetime(row.get("published_at"))
                if published is None:
                    continue
                if bucket_start <= published <= as_of:
                    mention_count += 1

            article_pressure = min(16.0, mention_count * 3.2)
            drift = (progress - 0.5) * anchor_momentum * 6.4
            oscillation = 3.4 * (progress - 0.5) * (1.0 - abs(progress - 0.5))
            temperature = float(clamp(anchor_temp + drift + oscillation + article_pressure, 6.0, 96.0))
            momentum = float(round((temperature - prev_temp) * 0.8, 2))
            state = self._derive_state(temperature=int(round(temperature)), momentum=momentum, previous_state=prev_state)

            points.append(
                ThemeTimelinePoint(
                    as_of=as_of,
                    temperature=int(round(temperature)),
                    mention_count=int(max(0, mention_count)),
                    state=state,
                    momentum=momentum,
                )
            )
            prev_state = state
            prev_temp = temperature

        return points[-max_points:]

    def _aggregate_theme(
        self,
        theme_id: str,
        rows: list[ClassifiedArticle],
        factors: dict[str, float],
        window_hours: int,
    ) -> dict[str, Any]:
        filtered = [row for row in rows if theme_id in row.theme_scores]
        mention_count = len(filtered)

        sources = {row.source for row in filtered}
        source_diversity = len(sources)
        source_diversity_score = int(clamp(source_diversity * 18, 0, 100))

        regions = [tag for row in filtered for tag in row.region_tags]
        region_counts = _count_items(regions)
        cross_region_spread = len(region_counts)
        region_spread_score = int(clamp(cross_region_spread * 20, 0, 100))

        assets = [tag for row in filtered for tag in row.asset_tags]
        asset_counts = _count_items(assets)

        recent_threshold = datetime.now(tz=timezone.utc) - timedelta(hours=min(12, window_hours))
        recent_mentions = sum(1 for row in filtered if row.published_at >= recent_threshold)
        baseline_mentions = max(0, mention_count - recent_mentions)

        recent_rate = recent_mentions / max(1.0, min(12.0, float(window_hours)))
        baseline_rate = baseline_mentions / max(1.0, float(window_hours - min(12, window_hours)))
        velocity_ratio = recent_rate / max(0.01, baseline_rate)
        velocity_score = int(clamp(50 + (velocity_ratio - 1.0) * 28.0, 0, 100))

        mention_score = int(clamp(mention_count * 10, 0, 100))
        market_reaction_score = int(clamp(round(self._market_alignment(theme_id, factors) * 32.0), 0, 100))

        temperature = int(
            clamp(
                round(
                    velocity_score * 0.35
                    + mention_score * 0.25
                    + source_diversity_score * 0.2
                    + region_spread_score * 0.1
                    + market_reaction_score * 0.1
                ),
                0,
                100,
            )
        )

        top_regions = [item[0] for item in sorted(region_counts.items(), key=lambda item: item[1], reverse=True)[:3]]
        top_assets = [item[0] for item in sorted(asset_counts.items(), key=lambda item: item[1], reverse=True)[:3]]
        return {
            "mention_count": mention_count,
            "source_diversity": source_diversity,
            "cross_region_spread": cross_region_spread,
            "velocity_score": velocity_score,
            "source_diversity_score": source_diversity_score,
            "market_reaction_score": market_reaction_score,
            "temperature": temperature,
            "top_regions": top_regions,
            "top_assets": top_assets,
        }

    def _market_alignment(self, theme_id: str, factors: dict[str, float]) -> float:
        theme = self.theme_by_id.get(theme_id, {})
        exposures = theme.get("factor_exposure", {})
        if not exposures:
            return 0.0
        weighted = 0.0
        weight_total = 0.0
        for factor, weight in exposures.items():
            weight_f = abs(float(weight))
            weighted += abs(float(factors.get(factor, 0.0))) * weight_f
            weight_total += weight_f
        if weight_total <= 0:
            return 0.0
        return float(clamp(weighted / weight_total, 0.0, 3.0))

    def _tag_dimensions(self, text: str, keyword_map: dict[str, list[str]]) -> list[str]:
        tags: list[str] = []
        for tag, terms in keyword_map.items():
            if any(term in text for term in terms):
                tags.append(tag)
        return tags

    def _dedupe_near_duplicates(self, rows: list[ClassifiedArticle]) -> list[ClassifiedArticle]:
        deduped: list[ClassifiedArticle] = []
        title_signatures: list[set[str]] = []
        seen_ids: set[str] = set()
        seen_urls: set[str] = set()

        for row in sorted(rows, key=lambda item: (item.relevance_score, item.published_at), reverse=True):
            if row.article_id in seen_ids:
                continue
            normalized_url = row.url.strip().lower()
            if normalized_url and normalized_url in seen_urls:
                continue

            signature = _token_signature(row.title)
            if signature:
                similar = False
                for previous in title_signatures:
                    if _jaccard(signature, previous) > 0.88:
                        similar = True
                        break
                if similar:
                    continue
                title_signatures.append(signature)

            seen_ids.add(row.article_id)
            if normalized_url:
                seen_urls.add(normalized_url)
            deduped.append(row)

        deduped.sort(key=lambda item: item.published_at, reverse=True)
        return deduped

    def _derive_state(self, *, temperature: int, momentum: float, previous_state: str) -> str:
        prev = previous_state.strip().lower()
        if temperature >= 70 or (prev == "hot" and temperature >= 62):
            return "hot"
        if temperature <= 30 or (prev == "cold" and temperature <= 38):
            return "cold"
        if momentum >= 8:
            return "warming"
        if momentum <= -8:
            return "cooling"
        return "neutral"

    def _normalize_theme_id(self, theme_id: str) -> str:
        normalized = theme_id.strip().lower()
        if normalized not in self.theme_by_id:
            raise ValueError(f"Unknown theme id: {theme_id}")
        return normalized

    def _theme_label(self, theme_id: str) -> str:
        theme = self.theme_by_id.get(theme_id, {})
        return str(theme.get("label", theme_id))

    def _latest_snapshot(self) -> dict[str, Any]:
        if self._theme_snapshot_cache is not None:
            return self._theme_snapshot_cache
        if self.repository.supabase is None:
            return {}
        rows = safe_execute(
            self.repository.supabase.table("theme_snapshots").select("payload").order("as_of", desc=True).limit(1),
            default=[],
        )
        if not rows:
            return {}
        payload = rows[0].get("payload", {})
        if isinstance(payload, dict):
            self._theme_snapshot_cache = payload
            return payload
        return {}

    def _save_runtime_state(self, as_of: datetime, items: list[ThemeLiveItem], articles: list[ClassifiedArticle]) -> None:
        snapshot = {
            item.theme_id: {
                "label": item.label,
                "state": item.state,
                "temperature": item.temperature,
                "mention_count": item.mention_count,
                "source_diversity": item.source_diversity,
                "cross_region_spread": item.cross_region_spread,
                "market_reaction_score": item.market_reaction_score,
                "momentum": item.momentum,
                "as_of": as_of.isoformat(),
                "top_regions": list(item.top_regions),
                "top_assets": list(item.top_assets),
            }
            for item in items
        }
        self._theme_snapshot_cache = snapshot

        for item in items:
            self._timeline_cache.append(
                {
                    "as_of": as_of.isoformat(),
                    "theme_id": item.theme_id,
                    "theme_label": item.label,
                    "temperature": item.temperature,
                    "state": item.state,
                    "mention_count": item.mention_count,
                    "source_diversity": item.source_diversity,
                    "cross_region_spread": item.cross_region_spread,
                    "market_reaction_score": item.market_reaction_score,
                    "momentum": item.momentum,
                }
            )
        self._timeline_cache = self._timeline_cache[-3000:]

        for article in articles:
            payload = self._article_to_payload(article)
            self._articles_cache[payload["id"]] = payload

    def _persist_snapshot(self, as_of: datetime, items: list[ThemeLiveItem]) -> None:
        if self.repository.supabase is None:
            return
        payload = {
            item.theme_id: {
                "label": item.label,
                "state": item.state,
                "temperature": item.temperature,
                "mention_count": item.mention_count,
                "source_diversity": item.source_diversity,
                "cross_region_spread": item.cross_region_spread,
                "market_reaction_score": item.market_reaction_score,
                "momentum": item.momentum,
                "top_regions": list(item.top_regions),
                "top_assets": list(item.top_assets),
            }
            for item in items
        }
        self._dispatch_supabase_write(
            lambda: safe_execute(
                self.repository.supabase.table("theme_snapshots").insert({"as_of": as_of.isoformat(), "payload": payload}),
                default=[],
            )
        )

    def _persist_timeseries(self, as_of: datetime, items: list[ThemeLiveItem]) -> None:
        if self.repository.supabase is None:
            return
        rows = [
            {
                "as_of": as_of.isoformat(),
                "theme_id": item.theme_id,
                "theme_label": item.label,
                "temperature": item.temperature,
                "state": item.state,
                "mention_count": item.mention_count,
                "source_diversity": item.source_diversity,
                "cross_region_spread": item.cross_region_spread,
                "market_reaction_score": item.market_reaction_score,
                "momentum": item.momentum,
                "payload": {
                    "top_regions": list(item.top_regions),
                    "top_assets": list(item.top_assets),
                    "summary": item.summary,
                },
            }
            for item in items
        ]
        if not rows:
            return
        self._dispatch_supabase_write(
            lambda: safe_execute(self.repository.supabase.table("theme_scores_timeseries").insert(rows), default=[])
        )

    def _persist_articles(self, articles: list[ClassifiedArticle]) -> None:
        payloads = [self._article_to_payload(article) for article in articles]
        if self.repository.supabase is None or not payloads:
            return
        self._dispatch_supabase_write(
            lambda: safe_execute(
                self.repository.supabase.table("news_articles").upsert(payloads, on_conflict="id"),
                default=[],
            )
        )

    def _article_to_payload(self, article: ClassifiedArticle) -> dict[str, Any]:
        keywords = sorted({term for values in article.matched_keywords.values() for term in values})
        matched_theme_ids = sorted(article.theme_scores.keys())
        return {
            "id": article.article_id,
            "published_at": article.published_at.isoformat(),
            "source": article.source,
            "title": article.title,
            "url": article.url,
            "summary": article.summary,
            "region_tags": list(article.region_tags),
            "asset_tags": list(article.asset_tags),
            "matched_theme_ids": matched_theme_ids,
            "matched_keywords": keywords,
            "relevance_score": round(article.relevance_score, 6),
            "payload": {
                "theme_scores": {key: round(value, 6) for key, value in article.theme_scores.items()},
                "top_theme_id": article.top_theme_id,
            },
        }

    def _load_timeseries_rows(self, theme_id: str, *, since: datetime) -> list[dict[str, Any]]:
        in_memory_rows = [
            row
            for row in self._timeline_cache
            if str(row.get("theme_id")) == theme_id and (_parse_datetime(row.get("as_of")) or since) >= since
        ]
        if in_memory_rows:
            in_memory_rows.sort(key=lambda row: _parse_datetime(row.get("as_of")) or since)
            return in_memory_rows

        if self.repository.supabase is not None:
            rows = safe_execute(
                self.repository.supabase.table("theme_scores_timeseries")
                .select("*")
                .eq("theme_id", theme_id)
                .gte("as_of", since.isoformat())
                .order("as_of"),
                default=[],
            )
            if rows:
                return [dict(row) for row in rows]
        return []

    def _load_article_rows(self, theme_id: str, *, since: datetime) -> list[dict[str, Any]]:
        in_memory_rows = []
        for row in self._articles_cache.values():
            published = _parse_datetime(row.get("published_at"))
            if published is None or published < since:
                continue
            if theme_id not in [str(item) for item in row.get("matched_theme_ids", [])]:
                continue
            in_memory_rows.append(dict(row))
        if in_memory_rows:
            in_memory_rows.sort(
                key=lambda row: _parse_datetime(row.get("published_at")) or since,
                reverse=True,
            )
            return in_memory_rows

        if self.repository.supabase is not None:
            rows = safe_execute(
                self.repository.supabase.table("news_articles")
                .select("*")
                .contains("matched_theme_ids", [theme_id])
                .gte("published_at", since.isoformat())
                .order("published_at", desc=True),
                default=[],
            )
            if rows:
                return [dict(row) for row in rows]
        return []

    def _dispatch_supabase_write(self, operation: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            operation()
            return
        loop.create_task(asyncio.to_thread(operation))


def _xml_text(node: ET.Element, tags: list[str]) -> str:
    for tag in tags:
        child = node.find(tag)
        if child is not None and child.text:
            return child.text
    return ""


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                dt = parsedate_to_datetime(text)
            except Exception:
                return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _make_article_id(url: Any, title: Any) -> str:
    raw = f"{str(url or '').strip()}::{str(title or '').strip()}".encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()
    return f"article-{digest[:20]}"


def _normalize_text(text: str) -> str:
    value = text.lower()
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def _score_weighted_terms(text: str, rules: list[dict[str, Any]]) -> tuple[float, list[str]]:
    score = 0.0
    matches: list[str] = []
    for rule in rules:
        term = str(rule.get("term", "")).lower().strip()
        weight = float(rule.get("weight", 1.0))
        if not term:
            continue
        count = text.count(term)
        if count <= 0:
            continue
        score += count * weight
        matches.append(term)
    return score, matches


def _count_items(values: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        key = str(value).strip().lower()
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
    return counts


def _safe_int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _token_signature(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]{4,}", text.lower())
    return set(tokens)


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    overlap = len(a.intersection(b))
    union = len(a.union(b))
    if union == 0:
        return 0.0
    return overlap / union
