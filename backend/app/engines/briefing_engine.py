from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.data.repository import DataRepository
from app.engines.analogue_engine import AnalogueEngine
from app.engines.decay import clamp
from app.engines.explainer import make_trace
from app.engines.risk_engine import RiskEngine
from app.engines.signal_model_engine import SignalModelEngine
from app.engines.theme_engine import ThemeEngine
from app.engines.world_pulse_engine import WorldPulseEngine
from app.schemas.briefing import (
    CausalChainStep,
    ConclusionProof,
    DailyBriefResponse,
    DevelopmentDetailResponse,
    FeedSourceStatus,
    FeedStatus,
    MarketProofSignal,
    MacroDevelopment,
    MemoryPreviewItem,
    ModelProof,
    NewsNavigatorRequest,
    NewsNavigatorResponse,
    NavigatorAttachment,
    NavigatorAttachmentInsight,
    NavigatorHighlight,
    NavigatorSourceItem,
    NavigatorThemeInsight,
    ProofBundle,
    RecommendedAction,
    RiskPosture,
    ScenarioPreset,
    SpilloverMap,
    SourceProof,
    StandardizedScore,
    StoryGraph,
    StoryGraphEdge,
    StoryGraphNode,
    ThemeBoardItem,
    ThemeDiscussionSnapshot,
    ThemeMemoryResponse,
    ThemeRiskImplication,
    WatchTrigger,
)
from app.schemas.common import ConfidenceComponents, ConfidenceTrace, ExplanationTrace


class BriefingEngine:
    def __init__(
        self,
        repository: DataRepository,
        world_pulse_engine: WorldPulseEngine,
        theme_engine: ThemeEngine,
        risk_engine: RiskEngine,
        analogue_engine: AnalogueEngine,
    ) -> None:
        self.repository = repository
        self.world_pulse_engine = world_pulse_engine
        self.theme_engine = theme_engine
        self.risk_engine = risk_engine
        self.analogue_engine = analogue_engine
        self.settings = get_settings()
        self.signal_model = SignalModelEngine()

        self._scenario_presets: dict[str, dict[str, Any]] = {
            "inflation-shock": {
                "driver": "Interest Rates",
                "event": "Rate Hike +100bp",
                "region": "United States",
                "severity": 72,
                "horizon": "12 Months",
            },
            "monetary-policy": {
                "driver": "Interest Rates",
                "event": "Rate Hike +100bp",
                "region": "United States",
                "severity": 68,
                "horizon": "6 Months",
            },
            "growth-slowdown": {
                "driver": "Trade Policy",
                "event": "Tariff Escalation",
                "region": "Europe",
                "severity": 66,
                "horizon": "12 Months",
            },
            "energy-supply": {
                "driver": "Oil Price",
                "event": "Oil Spike to $120",
                "region": "Middle East",
                "severity": 74,
                "horizon": "6 Months",
            },
            "geopolitical-risk": {
                "driver": "Geopolitical",
                "event": "Regional Conflict",
                "region": "Middle East",
                "severity": 78,
                "horizon": "6 Months",
            },
            "banking-liquidity": {
                "driver": "Currency",
                "event": "USD Surge +15%",
                "region": "United States",
                "severity": 64,
                "horizon": "3 Months",
            },
            "trade-regulation": {
                "driver": "Trade Policy",
                "event": "Tariff Escalation",
                "region": "China",
                "severity": 69,
                "horizon": "12 Months",
            },
        }

    async def get_daily_brief(self, *, window_hours: int, limit: int) -> DailyBriefResponse:
        bounded_window = int(clamp(window_hours, 24, 720))
        bounded_limit = int(clamp(limit, 3, 12))
        snapshot_limit = max(bounded_limit, 8)
        cached = self._cached_daily_brief(limit=bounded_limit, max_age_seconds=55)
        if cached is not None:
            return cached

        factor_state = await self.world_pulse_engine.compute_factor_state()
        world_pulse_task = asyncio.create_task(self.world_pulse_engine.build_world_pulse(factor_state=factor_state))
        risk_radar_task = asyncio.create_task(self.risk_engine.get_risk_radar(factor_state=factor_state))
        analogues_task = asyncio.create_task(self.analogue_engine.get_analogues(k=4, factor_state=factor_state))
        theme_live = await self.theme_engine.get_live_themes(
            window_hours=bounded_window,
            limit=snapshot_limit,
            factor_state=factor_state,
        )
        world_pulse, risk_radar, analogues = await asyncio.gather(world_pulse_task, risk_radar_task, analogues_task)

        model_rows = [
            {
                "theme_id": theme.theme_id,
                "mention_count": theme.mention_count,
                "source_diversity": theme.source_diversity,
                "cross_region_spread": theme.cross_region_spread,
                "market_reaction_raw": theme.market_reaction_score,
                "momentum": theme.momentum,
                "temperature_raw": theme.temperature,
                "velocity_score": clamp(50.0 + float(theme.momentum) * 4.2, 0.0, 100.0),
            }
            for theme in theme_live.themes[:snapshot_limit]
        ]
        scored_map = self.signal_model.score_themes(model_rows)

        developments: list[MacroDevelopment] = []
        aggregated_sources: list[SourceProof] = []
        for theme in theme_live.themes[:snapshot_limit]:
            scored = scored_map.get(theme.theme_id)
            if scored is None:
                continue
            timeline = await self.theme_engine.get_theme_timeline(
                theme_id=theme.theme_id,
                window_hours=min(240, bounded_window * 2),
                max_points=60,
            )
            sources = await self.theme_engine.get_theme_sources(
                theme_id=theme.theme_id,
                window_hours=bounded_window,
                limit=8,
            )
            outlook = scored.outlook_state
            importance = scored.importance_value
            temperature_value = scored.temperature_value
            market_confirmation_value = scored.market_confirmation_value
            market_confirmation_label = self.signal_model.market_confirmation_label(market_confirmation_value)

            scorecard = [
                StandardizedScore(
                    metric="importance",
                    value=importance,
                    percentile=scored.importance_percentile,
                    confidence=scored.confidence,
                    model_version=scored.model_version,
                    status="ok",
                ),
                StandardizedScore(
                    metric="theme_temperature",
                    value=temperature_value,
                    percentile=scored.temperature_percentile,
                    confidence=scored.confidence,
                    model_version=scored.model_version,
                    status="ok",
                ),
                StandardizedScore(
                    metric="market_confirmation",
                    value=market_confirmation_value,
                    percentile=scored.market_confirmation_percentile,
                    confidence=scored.confidence,
                    model_version=scored.model_version,
                    status="ok",
                ),
            ]

            chain = self._causal_chain(theme.theme_id, theme.label, theme.top_regions)
            implications = self._risk_implications(theme.theme_id)
            actions = self._recommended_actions(theme.theme_id)
            triggers = self._watch_triggers(theme, outlook)
            scenario_preset = self._scenario_preset(theme.theme_id)
            narrative_story = self._narrative_story(theme.label, chain)
            story_graph = self._build_story_graph(theme, sources.articles, chain, implications, actions, importance)
            proof_bundle = self._build_proof_bundle(
                theme=theme,
                source_articles=sources.articles,
                factors=factor_state.factors,
                scorecard=scorecard,
                top_features=scored.top_features,
                narrative_story=narrative_story,
                confidence=scored.confidence,
            )
            aggregated_sources.extend(proof_bundle.source_evidence)

            trace = make_trace(
                summary=f"{theme.label} ranked at importance {importance} with outlook {outlook}.",
                top_factors=[
                    {
                        "factor": "temperature",
                        "contribution": float(theme.temperature),
                        "weight": 0.42,
                        "value": float(theme.temperature),
                    },
                    {
                        "factor": "market_reaction",
                        "contribution": float(theme.market_reaction_score),
                        "weight": 0.12,
                        "value": float(theme.market_reaction_score),
                    },
                    {
                        "factor": "mention_count",
                        "contribution": float(theme.mention_count),
                        "weight": 0.20,
                        "value": float(theme.mention_count),
                    },
                ],
            )

            developments.append(
                MacroDevelopment(
                    development_id=f"{theme.theme_id}-{theme_live.as_of.strftime('%Y%m%d%H%M')}",
                    theme_id=theme.theme_id,
                    label=theme.label,
                    title=f"{theme.label}: {outlook.replace('_', ' ')} risk path",
                    executive_summary=theme.summary,
                    state=theme.state,
                    outlook_state=outlook,
                    importance=importance,
                    mention_count=theme.mention_count,
                    source_diversity=theme.source_diversity,
                    market_confirmation=market_confirmation_label,
                    regions=list(theme.top_regions),
                    asset_classes=list(theme.top_assets),
                    causal_chain=chain,
                    risk_implications=implications,
                    recommended_actions=actions,
                    watch_triggers=triggers,
                    source_articles=list(sources.articles),
                    scenario_preset=scenario_preset,
                    narrative_story=narrative_story,
                    scorecard=scorecard,
                    proof_bundle=proof_bundle,
                    story_graph=story_graph,
                    trace_id=trace.trace_id,
                )
            )

        developments.sort(key=lambda item: item.importance, reverse=True)

        theme_board: list[ThemeBoardItem] = []
        for theme in theme_live.themes[:8]:
            scored = scored_map.get(theme.theme_id)
            scorecard = []
            if scored is not None:
                scorecard = [
                    StandardizedScore(
                        metric="importance",
                        value=scored.importance_value,
                        percentile=scored.importance_percentile,
                        confidence=scored.confidence,
                        model_version=scored.model_version,
                        status="ok",
                    ),
                    StandardizedScore(
                        metric="theme_temperature",
                        value=scored.temperature_value,
                        percentile=scored.temperature_percentile,
                        confidence=scored.confidence,
                        model_version=scored.model_version,
                        status="ok",
                    ),
                ]

            theme_board.append(
                ThemeBoardItem(
                    theme_id=theme.theme_id,
                    label=theme.label,
                    state=theme.state,
                    outlook_state=scored.outlook_state if scored else "stable",
                    temperature=scored.temperature_value if scored else theme.temperature,
                    momentum=theme.momentum,
                    top_regions=list(theme.top_regions),
                    top_assets=list(theme.top_assets),
                    market_reaction_score=scored.market_confirmation_value if scored else theme.market_reaction_score,
                    scorecard=scorecard,
                )
            )

        memory_preview = [
            MemoryPreviewItem(
                regime_id=regime.id,
                label=regime.label,
                year=regime.year,
                similarity=regime.similarity,
                why_it_matters=regime.description,
                trace_id=regime.trace_id,
            )
            for regime in sorted(analogues.regimes, key=lambda item: item.similarity, reverse=True)[:3]
        ]

        top_dev = developments[0] if developments else None
        second_dev = developments[1] if len(developments) > 1 else top_dev
        overall_risk = self._overall_risk_value(risk_radar.summary_cards)
        headline_brief = (
            f"{top_dev.label} is the primary macro driver ({top_dev.importance}/100). "
            f"{second_dev.label} remains a secondary pressure point. "
            f"Overall risk index is {overall_risk}/100 with portfolio hedging bias elevated."
            if top_dev and second_dev
            else "Macro signal desk is active, but no ranked developments are currently available."
        )
        feed_status = self._build_feed_status(aggregated_sources, window_hours=bounded_window)

        confidence = self._blend_confidence(theme_live.confidence, world_pulse.confidence, risk_radar.confidence)
        explanation = make_trace(
            summary=(
                f"Daily briefing blended {len(developments)} developments, "
                f"{len(world_pulse.hotspots)} countries, and {len(risk_radar.categories)} risk categories."
            ),
            top_factors=[
                {
                    "factor": development.theme_id,
                    "contribution": float(development.importance),
                    "weight": 1.0,
                    "value": float(development.importance),
                }
                for development in developments[:5]
            ],
        )

        response = DailyBriefResponse(
            as_of=datetime.now(tz=timezone.utc),
            headline_brief=headline_brief,
            feed_status=feed_status,
            developments=developments,
            theme_board=theme_board,
            risk_posture=RiskPosture(
                summary_cards=risk_radar.summary_cards,
                assessment_summary=risk_radar.assessment_summary,
                overall_regime=self._overall_regime(overall_risk),
            ),
            spillover_map=SpilloverMap(
                hotspots=world_pulse.hotspots[:24],
                arcs=world_pulse.arcs[:12],
            ),
            institutional_memory_preview=memory_preview,
            confidence=confidence,
            explanation=explanation,
        )

        self.repository.save_daily_brief_snapshot(response.model_dump(mode="json"))
        if len(response.developments) <= bounded_limit:
            return response
        return response.model_copy(update={"developments": list(response.developments[:bounded_limit])})

    async def get_development_detail(self, development_id: str) -> DevelopmentDetailResponse:
        snapshot = self.repository.get_latest_daily_brief_snapshot() or {}
        developments = snapshot.get("developments", []) if isinstance(snapshot, dict) else []
        match = None
        for item in developments:
            if str(item.get("development_id", "")) == development_id:
                match = item
                break
        if match is None:
            # Development ids are timestamped. If the snapshot rolled between requests,
            # resolve to the latest development row for the same theme id.
            fallback_theme_id = None
            pattern = re.match(r"^(?P<theme>.+)-\d{12}$", development_id.strip())
            if pattern:
                fallback_theme_id = pattern.group("theme")
            if fallback_theme_id:
                for item in developments:
                    if str(item.get("theme_id", "")) == fallback_theme_id:
                        match = item
                        break
        if match is None:
            raise ValueError(f"Unknown development id: {development_id}")

        confidence_payload = snapshot.get("confidence", {})
        explanation_payload = snapshot.get("explanation", {})
        confidence = ConfidenceTrace.model_validate(confidence_payload) if confidence_payload else ConfidenceTrace(
            score=55,
            components=ConfidenceComponents(freshness=0.5, coverage=0.5, stability=0.5),
        )
        explanation = (
            make_trace(
                summary=f"Detailed development lookup for {development_id}.",
                top_factors=[],
            )
            if not explanation_payload
            else ExplanationTrace.model_validate(explanation_payload)
        )

        return DevelopmentDetailResponse(
            as_of=datetime.now(tz=timezone.utc),
            development=MacroDevelopment.model_validate(match),
            confidence=confidence,
            explanation=explanation,
        )

    async def get_feed_status(self, *, window_hours: int = 72) -> FeedStatus:
        cached_feed_status = self._cached_feed_status(max_age_seconds=45)
        if cached_feed_status is not None:
            return cached_feed_status

        live = await self.theme_engine.get_live_themes(window_hours=max(24, min(720, window_hours)), limit=8)
        proofs: list[SourceProof] = []
        for theme in live.themes[:6]:
            sources = await self.theme_engine.get_theme_sources(theme_id=theme.theme_id, window_hours=window_hours, limit=4)
            proofs.extend(
                [
                    SourceProof(
                        article_id=article.article_id,
                        title=article.title,
                        url=article.url,
                        source=article.source,
                        published_at=article.published_at,
                        snippet=article.excerpt,
                        relevance_score=article.relevance_score,
                    )
                    for article in sources.articles
                ]
            )
        return self._build_feed_status(proofs, window_hours=window_hours)

    def _cached_daily_brief(
        self,
        *,
        limit: int,
        max_age_seconds: int,
    ) -> DailyBriefResponse | None:
        snapshot = self.repository.get_latest_daily_brief_snapshot()
        if not isinstance(snapshot, dict) or not snapshot:
            return None

        as_of = _parse_datetime(snapshot.get("as_of"))
        if as_of is None:
            return None

        age_seconds = (datetime.now(tz=timezone.utc) - as_of).total_seconds()
        if age_seconds > max(1, int(max_age_seconds)):
            return None

        try:
            model = DailyBriefResponse.model_validate(snapshot)
        except Exception:
            return None

        if len(model.developments) <= limit:
            return model
        return model.model_copy(update={"developments": list(model.developments[:limit])})

    def _cached_feed_status(self, *, max_age_seconds: int) -> FeedStatus | None:
        snapshot = self.repository.get_latest_daily_brief_snapshot()
        if not isinstance(snapshot, dict) or not snapshot:
            return None

        as_of = _parse_datetime(snapshot.get("as_of"))
        if as_of is None:
            return None

        age_seconds = (datetime.now(tz=timezone.utc) - as_of).total_seconds()
        if age_seconds > max(1, int(max_age_seconds)):
            return None

        feed_payload = snapshot.get("feed_status")
        if not isinstance(feed_payload, dict) or not feed_payload:
            return None
        try:
            return FeedStatus.model_validate(feed_payload)
        except Exception:
            return None

    async def get_theme_memory(self, *, theme_id: str, window_hours: int, limit: int) -> ThemeMemoryResponse:
        bounded_window = int(clamp(window_hours, 24, 2160))
        bounded_limit = int(clamp(limit, 5, 80))

        timeline = await self.theme_engine.get_theme_timeline(
            theme_id=theme_id,
            window_hours=bounded_window,
            max_points=min(250, bounded_limit * 4),
        )
        sources = await self.theme_engine.get_theme_sources(
            theme_id=theme_id,
            window_hours=min(720, bounded_window),
            limit=bounded_limit,
        )
        analogues = await self.analogue_engine.get_analogues(k=6)

        history_rows = self.repository.get_daily_brief_history(limit=40)
        snapshots = self._extract_discussion_history(history_rows, theme_id=theme_id, limit=bounded_limit)
        snapshots.extend(self._public_memory_snapshots(theme_id=theme_id, limit=bounded_limit))
        snapshots.sort(key=lambda item: item.as_of, reverse=True)
        snapshots = snapshots[:bounded_limit]

        latest_live = await self.theme_engine.get_live_themes(window_hours=min(168, bounded_window), limit=10)
        confidence = latest_live.confidence
        explanation = make_trace(
            summary=(
                f"{timeline.label} memory view includes {len(snapshots)} prior discussion snapshots, "
                f"{len(timeline.points)} timeline points, and {len(sources.articles)} source records."
            ),
            top_factors=[
                {
                    "factor": timeline.theme_id,
                    "contribution": float(timeline.points[-1].temperature if timeline.points else 0.0),
                    "weight": 1.0,
                    "value": float(timeline.points[-1].momentum if timeline.points else 0.0),
                }
            ],
        )

        return ThemeMemoryResponse(
            as_of=datetime.now(tz=timezone.utc),
            theme_id=timeline.theme_id,
            label=timeline.label,
            discussion_history=snapshots,
            timeline_points=timeline.points,
            source_articles=sources.articles,
            related_analogues=sorted(analogues.regimes, key=lambda item: item.similarity, reverse=True)[:3],
            confidence=confidence,
            explanation=explanation,
        )

    async def run_news_navigator(self, *, payload: NewsNavigatorRequest) -> NewsNavigatorResponse:
        prompt = payload.prompt.strip()
        horizon = self._normalize_horizon(payload.horizon)
        window_hours = {"daily": 24, "weekly": 168, "monthly": 720}[horizon]

        live = await self.theme_engine.get_live_themes(window_hours=window_hours, limit=10)
        prompt_terms = _extract_keywords(prompt)
        attachment_insights, attachment_terms, attachment_context = self._analyze_attachments(
            attachments=payload.attachments,
            prompt_terms=prompt_terms,
        )
        for term in attachment_terms:
            if term not in prompt_terms:
                prompt_terms.append(term)

        source_pool: list[dict[str, Any]] = []
        seen_source_keys: set[str] = set()
        candidate_themes = [theme for theme in live.themes[:8] if int(theme.mention_count) > 0]
        if not candidate_themes and live.themes:
            candidate_themes = [live.themes[0]]

        async def _load_theme_sources(theme: Any) -> tuple[Any, Any]:
            try:
                payload = await self.theme_engine.get_theme_sources(
                    theme_id=theme.theme_id,
                    window_hours=window_hours,
                    limit=10,
                )
                return theme, payload
            except Exception:
                return theme, None

        source_results = await asyncio.gather(*[_load_theme_sources(theme) for theme in candidate_themes])

        for theme, theme_sources in source_results:
            if theme_sources is None:
                continue
            for article in theme_sources.articles:
                source_key = str(article.article_id or article.url)
                if not source_key or source_key in seen_source_keys:
                    continue
                seen_source_keys.add(source_key)
                source_pool.append(
                    {
                        "theme_id": theme.theme_id,
                        "theme_label": theme.label,
                        "article": article,
                    }
                )

        scored_sources = []
        for row in source_pool:
            article = row["article"]
            source_text = f"{article.title} {article.excerpt}".lower()
            keyword_overlap = sum(1 for term in prompt_terms if term in source_text)
            score = float(
                clamp(
                    float(article.relevance_score) * 0.62 + min(1.0, keyword_overlap / 5.0) * 0.38,
                    0.0,
                    1.0,
                )
            )
            scored_sources.append(
                {
                    **row,
                    "keyword_overlap": keyword_overlap,
                    "score": score,
                }
            )

        scored_sources.sort(
            key=lambda item: (item["score"], item["keyword_overlap"], item["article"].published_at),
            reverse=True,
        )
        selected_sources = scored_sources[:8]

        insight_rows: list[NavigatorThemeInsight] = []
        for theme in live.themes[:10]:
            descriptor = " ".join(
                [
                    theme.label,
                    theme.summary,
                    " ".join(theme.top_regions),
                    " ".join(theme.top_assets),
                ]
            ).lower()
            token_overlap = sum(1 for term in prompt_terms if term in descriptor)
            source_support = sum(1 for row in selected_sources if row["theme_id"] == theme.theme_id)
            relevance = float(
                clamp(
                    token_overlap * 0.14
                    + source_support * 0.18
                    + (theme.temperature / 100.0) * 0.36
                    + (theme.market_reaction_score / 100.0) * 0.32,
                    0.0,
                    1.0,
                )
            )
            if relevance < 0.12 and token_overlap == 0 and source_support == 0:
                continue

            local_region = theme.top_regions[0].upper() if theme.top_regions else "PRIMARY REGION"
            local_asset = theme.top_assets[0] if theme.top_assets else "multi-asset channels"
            local_impact = (
                f"{local_region} is most exposed through {local_asset}; "
                f"monitor funding costs, sector leadership, and event risk over the next {horizon} cycle."
            )
            global_impact = self._global_impact_channel(theme=theme, horizon=horizon)
            rationale = (
                f"{theme.label} is {theme.state}. Temperature {theme.temperature}/100, "
                f"{theme.mention_count} verified mentions, {theme.source_diversity} sources, "
                f"cross-region spread {theme.cross_region_spread}."
            )
            insight_rows.append(
                NavigatorThemeInsight(
                    theme_id=theme.theme_id,
                    label=theme.label,
                    relevance_score=round(relevance, 4),
                    heat_state=theme.state,
                    local_impact=local_impact,
                    global_impact=global_impact,
                    rationale=rationale,
                )
            )

        if not insight_rows and live.themes:
            fallback_theme = live.themes[0]
            insight_rows.append(
                NavigatorThemeInsight(
                    theme_id=fallback_theme.theme_id,
                    label=fallback_theme.label,
                    relevance_score=0.35,
                    heat_state=fallback_theme.state,
                    local_impact="Local impact map is still stabilizing while source density builds.",
                    global_impact="Cross-market channel mapping is currently low-confidence due to limited overlap.",
                    rationale=f"{fallback_theme.label} selected as closest active macro theme.",
                )
            )

        insight_rows.sort(key=lambda item: item.relevance_score, reverse=True)
        insight_rows = insight_rows[:5]
        top_theme = insight_rows[0] if insight_rows else None
        second_theme = insight_rows[1] if len(insight_rows) > 1 else None

        importance_analysis = (
            (
                f"{top_theme.label} is the highest-priority signal for the {horizon} window: "
                f"it leads on source confirmation, market reaction, and narrative persistence."
            )
            if top_theme
            else "No dominant macro signal could be isolated with high confidence from current verified coverage."
        )
        if second_theme:
            importance_analysis += (
                f" Secondary watch item: {second_theme.label}."
            )

        local_impact_analysis = (
            top_theme.local_impact if top_theme else "Local impact assessment is limited until more source depth is available."
        )
        global_impact_analysis = self._global_impact_summary(
            top_theme=top_theme,
            second_theme=second_theme,
            horizon=horizon,
        )
        if attachment_context:
            global_impact_analysis += f" Attachment context: {' '.join(attachment_context[:2])}"

        emerging_theme = next(
            (
                item
                for item in insight_rows
                if item.heat_state.lower() in {"warming", "hot"} and float(item.relevance_score) >= 0.42
            ),
            None,
        )
        emerging_theme_analysis = (
            (
                f"Emerging signal detected: {emerging_theme.label} ({emerging_theme.heat_state}) with broadening evidence."
            )
            if emerging_theme
            else "No new theme has crossed the emerging-signal threshold; current regime is mixed-to-stable."
        )

        highlights: list[NavigatorHighlight] = []
        seen_terms: set[str] = set()
        candidate_terms: list[str] = []
        candidate_terms.extend(prompt_terms[:8])
        for insight in insight_rows[:3]:
            candidate_terms.extend(_extract_keywords(insight.label))
        for source in selected_sources[:4]:
            candidate_terms.extend(_extract_keywords(str(source["article"].title)))
        candidate_terms.extend(attachment_terms[:6])

        for term in candidate_terms:
            normalized_term = term.strip().lower()
            if len(normalized_term) < 4 or normalized_term in seen_terms:
                continue
            seen_terms.add(normalized_term)
            matching_insight = next((item for item in insight_rows if normalized_term in item.label.lower()), None)
            explanation = self._highlight_explanation(
                term=normalized_term,
                insight=matching_insight,
                selected_sources=selected_sources,
                attachment_insights=attachment_insights,
            )
            confidence = 0.86 if matching_insight else 0.72
            highlights.append(
                NavigatorHighlight(
                    term=term,
                    explanation=explanation,
                    confidence=confidence,
                )
            )
            if len(highlights) >= 10:
                break

        source_items = [
            NavigatorSourceItem(
                article_id=row["article"].article_id,
                title=row["article"].title,
                url=row["article"].url,
                source=row["article"].source,
                published_at=row["article"].published_at,
                relevance_score=round(float(row["score"]), 4),
                reason=(
                    f"Supports the {row['theme_label']} narrative with direct prompt relevance and recent publication evidence."
                ),
            )
            for row in selected_sources
        ]

        answer = await self._generate_news_navigator_answer(
            prompt=prompt,
            horizon=horizon,
            attachments=payload.attachments,
            attachment_insights=attachment_insights,
            theme_insights=insight_rows,
            source_items=source_items,
            importance_analysis=importance_analysis,
            local_impact_analysis=local_impact_analysis,
            global_impact_analysis=global_impact_analysis,
            emerging_theme_analysis=emerging_theme_analysis,
        )

        memory_entry_id = self.repository.save_public_memory_entry(
            {
                "id": f"public-memory-{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
                "theme_id": top_theme.theme_id if top_theme else "unclassified",
                "theme_label": top_theme.label if top_theme else "Unclassified",
                "prompt": prompt,
                "response_summary": answer[:1200],
                "horizon": horizon,
                "heat_state": top_theme.heat_state if top_theme else "neutral",
                "relevance_score": top_theme.relevance_score if top_theme else 0.0,
                "local_impact": top_theme.local_impact if top_theme else "",
                "global_impact": top_theme.global_impact if top_theme else "",
                "source_count": len(source_items),
                "attachment_count": len(payload.attachments),
            }
        )

        explanation = make_trace(
            summary=(
                f"News Navigator analyzed {len(source_items)} verified sources, scored "
                f"{len(insight_rows)} macro themes, and persisted memory entry {memory_entry_id}."
            ),
            top_factors=[
                {
                    "factor": row.theme_id,
                    "contribution": float(row.relevance_score * 100.0),
                    "weight": 1.0,
                    "value": float(row.relevance_score),
                }
                for row in insight_rows[:5]
            ],
        )

        return NewsNavigatorResponse(
            as_of=datetime.now(tz=timezone.utc),
            prompt=prompt,
            horizon=horizon,
            answer=answer,
            importance_analysis=importance_analysis,
            local_impact_analysis=local_impact_analysis,
            global_impact_analysis=global_impact_analysis,
            emerging_theme_analysis=emerging_theme_analysis,
            highlights=highlights,
            theme_insights=insight_rows,
            sources=source_items,
            attachment_insights=attachment_insights,
            memory_entry_id=memory_entry_id,
            explanation=explanation,
        )

    def _normalize_horizon(self, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"daily", "day"}:
            return "daily"
        if normalized in {"weekly", "week"}:
            return "weekly"
        if normalized in {"monthly", "month"}:
            return "monthly"
        return "daily"

    async def _generate_news_navigator_answer(
        self,
        *,
        prompt: str,
        horizon: str,
        attachments: list[NavigatorAttachment],
        attachment_insights: list[NavigatorAttachmentInsight],
        theme_insights: list[NavigatorThemeInsight],
        source_items: list[NavigatorSourceItem],
        importance_analysis: str,
        local_impact_analysis: str,
        global_impact_analysis: str,
        emerging_theme_analysis: str,
    ) -> str:
        fallback_answer = self._fallback_news_navigator_answer(
            prompt=prompt,
            horizon=horizon,
            attachment_insights=attachment_insights,
            theme_insights=theme_insights,
            source_items=source_items,
            importance_analysis=importance_analysis,
            local_impact_analysis=local_impact_analysis,
            global_impact_analysis=global_impact_analysis,
            emerging_theme_analysis=emerging_theme_analysis,
        )

        api_key = str(self.settings.openai_api_key or "").strip()
        model = str(self.settings.openai_model or "gpt-4o-mini").strip()
        base_url = str(self.settings.openai_base_url or "https://api.openai.com/v1").rstrip("/")
        if not api_key:
            return fallback_answer

        attachment_lines = []
        for item in attachments[:4]:
            excerpt = (item.text_excerpt or "").strip()
            excerpt_short = excerpt[:450]
            attachment_lines.append(
                f"- {item.file_name} ({item.mime_type}, {item.size_bytes} bytes)"
                + (f": {excerpt_short}" if excerpt_short else "")
            )
        attachment_insight_lines = []
        for row in attachment_insights[:4]:
            attachment_insight_lines.append(
                f"- {row.file_name} [{row.media_type}]: {row.summary} | relevance: {row.relevance} | impact: {row.impact}"
            )

        source_lines = []
        for item in source_items[:8]:
            source_lines.append(
                f"- {item.title} | {item.source} | {item.published_at.isoformat()} | relevance {item.relevance_score:.2f}"
            )
        insight_lines = []
        for item in theme_insights[:5]:
            insight_lines.append(
                f"- {item.label} ({item.heat_state}, relevance {item.relevance_score:.2f}) "
                f"| local: {item.local_impact} | global: {item.global_impact}"
            )

        user_prompt = (
            f"User request:\n{prompt}\n\n"
            f"Time horizon: {horizon}\n\n"
            f"Importance analysis:\n{importance_analysis}\n\n"
            f"Local impact analysis:\n{local_impact_analysis}\n\n"
            f"Global impact analysis:\n{global_impact_analysis}\n\n"
            f"Emerging theme analysis:\n{emerging_theme_analysis}\n\n"
            f"Macro theme analysis:\n" + ("\n".join(insight_lines) if insight_lines else "- none") + "\n\n"
            f"Verified sources:\n" + ("\n".join(source_lines) if source_lines else "- none") + "\n\n"
            f"Uploaded files:\n" + ("\n".join(attachment_lines) if attachment_lines else "- none") + "\n\n"
            f"Attachment interpretation:\n" + ("\n".join(attachment_insight_lines) if attachment_insight_lines else "- none")
        )

        user_content: Any
        image_blocks = []
        for item in attachments[:2]:
            if item.image_data_url and str(item.image_data_url).startswith("data:image/"):
                image_blocks.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": str(item.image_data_url)[:120000]},
                    }
                )
        if image_blocks:
            user_content = [{"type": "text", "text": user_prompt}, *image_blocks]
        else:
            user_content = user_prompt

        request_payload = {
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Atlas News Navigator. Write concise, factual, polished English for both "
                        "asset managers and the public. Keep it structured and brief. Do not mention model "
                        "names, providers, or implementation details. Use only the provided verified context. "
                        "Output with these section headers in plain text: "
                        "Summary, Why It Matters Now, Local Impact, Global Impact, What To Watch."
                    ),
                },
                {"role": "user", "content": user_content},
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=28.0) as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=request_payload,
                )
            if response.status_code == 200:
                payload = response.json()
                choices = payload.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if isinstance(content, str) and content.strip():
                        return content.strip()
        except Exception:
            pass

        return fallback_answer

    def _fallback_news_navigator_answer(
        self,
        *,
        prompt: str,
        horizon: str,
        attachment_insights: list[NavigatorAttachmentInsight],
        theme_insights: list[NavigatorThemeInsight],
        source_items: list[NavigatorSourceItem],
        importance_analysis: str,
        local_impact_analysis: str,
        global_impact_analysis: str,
        emerging_theme_analysis: str,
    ) -> str:
        top = theme_insights[0] if theme_insights else None
        anchor_theme = top.label if top else "the active macro complex"
        top_sources = ", ".join(sorted({item.source for item in source_items[:6]})) if source_items else "limited source coverage"
        attachment_note = (
            " ".join(f"{row.file_name}: {row.summary}" for row in attachment_insights[:2])
            if attachment_insights
            else "No supporting attachments were provided."
        )
        return (
            "Summary\n"
            f"- Request focus: {prompt.strip().rstrip('.')} ({horizon}).\n"
            f"- Primary theme: {anchor_theme}.\n\n"
            "Why It Matters Now\n"
            f"- {importance_analysis}\n"
            f"- Emerging-theme read: {emerging_theme_analysis}\n\n"
            "Local Impact\n"
            f"- {local_impact_analysis}\n\n"
            "Global Impact\n"
            f"- {global_impact_analysis}\n\n"
            "What To Watch\n"
            f"- Verified source set: {top_sources}.\n"
            f"- Attachment signal: {attachment_note}"
        )

    def _analyze_attachments(
        self,
        *,
        attachments: list[NavigatorAttachment],
        prompt_terms: list[str],
    ) -> tuple[list[NavigatorAttachmentInsight], list[str], list[str]]:
        insights: list[NavigatorAttachmentInsight] = []
        extracted_terms: list[str] = []
        context: list[str] = []
        prompt_set = {term.strip().lower() for term in prompt_terms if term.strip()}

        for item in attachments[:4]:
            mime = str(item.mime_type or "application/octet-stream").lower()
            text = str(item.text_excerpt or "").strip()
            file_name = str(item.file_name or "attachment")
            media_type = self._attachment_media_type(mime=mime, file_name=file_name)

            raw_terms = _extract_keywords(text) if text else _extract_keywords(file_name)
            unique_terms: list[str] = []
            seen = set()
            for term in raw_terms:
                normalized = term.strip().lower()
                if not normalized or normalized in seen:
                    continue
                seen.add(normalized)
                unique_terms.append(normalized)
                extracted_terms.append(normalized)
                if len(unique_terms) >= 12:
                    break

            overlap = sum(1 for term in unique_terms if term in prompt_set)
            summary = self._attachment_summary(
                file_name=file_name,
                media_type=media_type,
                text_excerpt=text,
                has_image=bool(item.image_data_url),
            )
            relevance = self._attachment_relevance(media_type=media_type, overlap=overlap, terms=unique_terms)
            impact = self._attachment_impact(media_type=media_type, terms=unique_terms)
            confidence = float(clamp(0.55 + overlap * 0.09 + (0.08 if text else 0.0), 0.45, 0.95))

            insights.append(
                NavigatorAttachmentInsight(
                    file_name=file_name,
                    media_type=media_type,
                    summary=summary,
                    relevance=relevance,
                    impact=impact,
                    confidence=confidence,
                )
            )
            context.append(f"{file_name} indicates {impact.lower()}")

        deduped_terms: list[str] = []
        seen_terms: set[str] = set()
        for term in extracted_terms:
            if term in seen_terms:
                continue
            seen_terms.add(term)
            deduped_terms.append(term)
            if len(deduped_terms) >= 24:
                break
        return insights, deduped_terms, context

    def _attachment_media_type(self, *, mime: str, file_name: str) -> str:
        lower_name = file_name.lower()
        if mime.startswith("image/"):
            return "image"
        if "csv" in mime or lower_name.endswith(".csv"):
            return "table"
        if "json" in mime or lower_name.endswith(".json"):
            return "structured document"
        if "pdf" in mime or lower_name.endswith(".pdf"):
            return "report"
        if mime.startswith("text/") or lower_name.endswith((".txt", ".md")):
            return "text document"
        return "document"

    def _attachment_summary(
        self,
        *,
        file_name: str,
        media_type: str,
        text_excerpt: str,
        has_image: bool,
    ) -> str:
        excerpt = re.sub(r"\s+", " ", text_excerpt).strip()
        if excerpt:
            return f"{media_type.title()} extracted from {file_name}: {excerpt[:160]}."
        if has_image:
            return (
                f"{file_name} is an image. Visual cues are incorporated when multimodal analysis is available; "
                "otherwise filename and context tags are used."
            )
        return f"{file_name} is attached as a {media_type} with limited extractable text."

    def _attachment_relevance(self, *, media_type: str, overlap: int, terms: list[str]) -> str:
        if overlap >= 4:
            return "High alignment with requested topic."
        if overlap >= 2:
            return "Moderate alignment with requested topic."
        if terms:
            return f"Indirectly relevant via {media_type} signals."
        return "Low direct overlap; treated as supporting context."

    def _attachment_impact(self, *, media_type: str, terms: list[str]) -> str:
        joined = " ".join(terms)
        if any(term in joined for term in ["inflation", "cpi", "rates", "yield", "policy"]):
            return "Policy-path sensitivity and rates repricing risk."
        if any(term in joined for term in ["oil", "energy", "gas", "supply", "commodity"]):
            return "Commodity and cost-shock transmission risk."
        if any(term in joined for term in ["credit", "bank", "liquidity", "spread"]):
            return "Funding and credit-spread stress channel."
        if media_type == "image":
            return "Visual context can reinforce narrative direction and event urgency."
        return "Provides additional context for scenario framing and risk monitoring."

    def _global_impact_channel(self, *, theme: Any, horizon: str) -> str:
        theme_id = str(getattr(theme, "theme_id", "")).strip().lower()
        spread = int(getattr(theme, "cross_region_spread", 0) or 0)
        temperature = int(getattr(theme, "temperature", 0) or 0)
        market_reaction = int(getattr(theme, "market_reaction_score", 0) or 0)

        if theme_id in {"inflation-shock", "monetary-policy"}:
            return (
                "Global rates and FX channel is active: front-end yields and USD carry are repricing together, "
                "with spillover into EM duration and equity risk premium."
            )
        if theme_id in {"energy-supply"}:
            return (
                "Commodity pass-through channel is active: oil/gas volatility is feeding inflation breakevens, "
                "shipping costs, and import-sensitive FX pairs."
            )
        if theme_id in {"geopolitical-risk", "trade-regulation"}:
            return (
                "Cross-border risk channel is active: trade-route uncertainty and sanctions risk are widening "
                "credit spreads and lifting volatility hedging demand."
            )
        if theme_id in {"banking-liquidity"}:
            return (
                "Funding channel is active: interbank and credit conditions are tightening, which can transmit "
                "into global risk assets via higher refinancing premia."
            )
        spread_text = "broad" if spread >= 3 else "contained"
        return (
            f"Cross-asset transmission is {spread_text}: temperature {temperature}/100 and market reaction "
            f"{market_reaction}/100 indicate {horizon}-horizon repricing risk across rates, FX, and credit."
        )

    def _global_impact_summary(
        self,
        *,
        top_theme: NavigatorThemeInsight | None,
        second_theme: NavigatorThemeInsight | None,
        horizon: str,
    ) -> str:
        if not top_theme:
            return "Global spillover assessment is low-confidence due to sparse evidence."
        summary = (
            f"{top_theme.global_impact} Key transmission channels for the {horizon} horizon: "
            "sovereign-rate repricing, FX risk premia, and credit-spread dispersion."
        )
        if second_theme:
            summary += f" Secondary link to monitor: {second_theme.label.lower()}."
        return summary

    def _highlight_explanation(
        self,
        *,
        term: str,
        insight: NavigatorThemeInsight | None,
        selected_sources: list[dict[str, Any]],
        attachment_insights: list[NavigatorAttachmentInsight],
    ) -> str:
        source_hits = 0
        for row in selected_sources[:6]:
            article = row.get("article")
            if article is None:
                continue
            haystack = f"{getattr(article, 'title', '')} {getattr(article, 'excerpt', '')}".lower()
            if term in haystack:
                source_hits += 1

        attachment_hits = 0
        for row in attachment_insights:
            haystack = f"{row.summary} {row.impact} {row.relevance}".lower()
            if term in haystack:
                attachment_hits += 1

        if insight:
            return (
                f"Relevance: linked to {insight.label} ({insight.heat_state}). "
                f"Impact: {insight.global_impact} "
                f"Evidence: {source_hits} source hits, {attachment_hits} attachment hits."
            )
        return (
            f"Relevance: appears in verified context. "
            f"Impact: supports cross-market interpretation. "
            f"Evidence: {source_hits} source hits, {attachment_hits} attachment hits."
        )

    def _public_memory_snapshots(self, *, theme_id: str, limit: int) -> list[ThemeDiscussionSnapshot]:
        rows = self.repository.get_public_memory_entries(theme_id=theme_id, limit=limit)
        snapshots: list[ThemeDiscussionSnapshot] = []
        for row in rows:
            payload = row.get("payload", {})
            if not isinstance(payload, dict):
                continue
            as_of = _parse_datetime(row.get("created_at")) or datetime.now(tz=timezone.utc)
            snapshots.append(
                ThemeDiscussionSnapshot(
                    as_of=as_of,
                    title=f"User News Navigator Query: {payload.get('theme_label', 'Unclassified')}",
                    summary=str(payload.get("response_summary", ""))[:380],
                    state=str(payload.get("heat_state", "neutral")),
                    outlook_state="user_query_memory",
                    importance=int(clamp(float(payload.get("relevance_score", 0.0)) * 100.0, 0, 100)),
                    primary_action="Review user-intent signal and align watchlist triggers.",
                )
            )
        return snapshots

    def _build_story_graph(
        self,
        theme: Any,
        articles: list[Any],
        chain: list[CausalChainStep],
        implications: list[ThemeRiskImplication],
        actions: list[RecommendedAction],
        importance: int,
    ) -> StoryGraph:
        article = articles[0] if articles else None
        source_label = article.source if article else "Live News Feed"
        source_title = article.title if article else f"{theme.label} monitoring source"
        implication = implications[0] if implications else None
        action = actions[0] if actions else None

        nodes = [
            StoryGraphNode(
                node_id="source",
                label=source_label,
                node_type="source",
                detail=source_title,
                score=min(100, max(10, importance)),
            ),
            StoryGraphNode(
                node_id="theme",
                label=theme.label,
                node_type="theme",
                detail=f"Theme importance {importance}/100",
                score=importance,
            ),
            StoryGraphNode(
                node_id="policy",
                label=chain[1].title if len(chain) > 1 else "Policy interpretation",
                node_type="policy",
                detail=chain[1].detail if len(chain) > 1 else "Policy path assessment",
                score=min(100, max(20, importance - 6)),
            ),
            StoryGraphNode(
                node_id="asset",
                label=implication.asset_class if implication else "Cross-asset impact",
                node_type="asset",
                detail=implication.rationale if implication else "Asset impact channel",
                score=min(100, max(20, importance - 8)),
            ),
            StoryGraphNode(
                node_id="action",
                label="Risk Action",
                node_type="action",
                detail=action.action if action else "Review risk posture",
                score=min(100, max(20, importance - 5)),
            ),
        ]
        edges = [
            StoryGraphEdge(**{"from": "source", "to": "theme", "label": "evidence", "weight": 0.9}),
            StoryGraphEdge(**{"from": "theme", "to": "policy", "label": "policy path", "weight": 0.86}),
            StoryGraphEdge(**{"from": "policy", "to": "asset", "label": "market transmission", "weight": 0.84}),
            StoryGraphEdge(**{"from": "asset", "to": "action", "label": "portfolio response", "weight": 0.88}),
        ]
        return StoryGraph(nodes=nodes, edges=edges)

    def _build_proof_bundle(
        self,
        *,
        theme: Any,
        source_articles: list[Any],
        factors: dict[str, float],
        scorecard: list[StandardizedScore],
        top_features: list[str],
        narrative_story: str,
        confidence: float,
    ) -> ProofBundle:
        source_evidence = [
            SourceProof(
                article_id=article.article_id,
                title=article.title,
                url=article.url,
                source=article.source,
                published_at=article.published_at,
                snippet=article.excerpt[:200],
                relevance_score=article.relevance_score,
            )
            for article in source_articles[:4]
        ]

        top_factor_rows = sorted(factors.items(), key=lambda item: abs(float(item[1])), reverse=True)[:3]
        market_evidence = [
            MarketProofSignal(
                signal=factor,
                value=round(float(value), 4),
                unit="factor_z",
                observed_at=datetime.now(tz=timezone.utc).isoformat(),
                interpretation=self._factor_interpretation(factor, float(value)),
            )
            for factor, value in top_factor_rows
        ]

        model_evidence = [
            ModelProof(
                model_name="online_importance_temperature_models",
                model_version=scorecard[0].model_version if scorecard else self.signal_model.model_version,
                score_confidence=float(clamp(confidence, 0.0, 1.0)),
                top_features=top_features,
            )
        ]

        top_score = scorecard[0].value if scorecard else 0
        conclusion = ConclusionProof(
            story=narrative_story,
            why_now=f"{theme.label} has elevated live score ({top_score}/100) and active source confirmation.",
            confidence_note=f"Signal confidence {int(clamp(confidence * 100.0, 0.0, 100.0))}% based on data coverage and stability.",
        )
        return ProofBundle(
            source_evidence=source_evidence,
            market_evidence=market_evidence,
            model_evidence=model_evidence,
            conclusion=conclusion,
        )

    def _build_feed_status(self, source_evidence: list[SourceProof], *, window_hours: int = 72) -> FeedStatus:
        by_source: dict[str, list[SourceProof]] = {}
        for proof in source_evidence:
            by_source.setdefault(proof.source, []).append(proof)

        source_rows: list[FeedSourceStatus] = []
        now = datetime.now(tz=timezone.utc)
        bounded_window = float(clamp(float(window_hours), 12.0, 720.0))
        healthy_age_minutes = max(180.0, bounded_window * 60.0)
        elevated_age_minutes = healthy_age_minutes * 1.5
        for source, proofs in by_source.items():
            latest = max(proofs, key=lambda item: item.published_at)
            age_minutes = max(0.0, (now - latest.published_at).total_seconds() / 60.0)
            trust_score = float(clamp(1.0 - age_minutes / max(480.0, healthy_age_minutes * 2.0), 0.2, 0.99))
            is_healthy = age_minutes <= healthy_age_minutes or (
                len(proofs) >= 2 and age_minutes <= elevated_age_minutes
            )
            source_rows.append(
                FeedSourceStatus(
                    source=source,
                    is_healthy=is_healthy,
                    last_published_at=latest.published_at.isoformat(),
                    ingested_articles=len(proofs),
                    trust_score=trust_score,
                )
            )

        source_rows.sort(key=lambda row: (row.is_healthy, row.ingested_articles, row.trust_score), reverse=True)
        healthy_sources = sum(1 for row in source_rows if row.is_healthy)
        return FeedStatus(
            updated_at=now.isoformat(),
            polling_interval_seconds=60,
            healthy_sources=healthy_sources,
            total_sources=len(source_rows),
            sources=source_rows,
        )

    def _narrative_story(self, label: str, chain: list[CausalChainStep]) -> str:
        if len(chain) >= 3:
            first = chain[0].detail.split(".")[0]
            second = chain[1].detail.split(".")[0]
            third = chain[2].detail.split(".")[0]
            return f"{first} -> {second} -> {third}"
        if chain:
            return f"{label} signal -> {chain[0].detail}"
        return f"{label} signal -> policy repricing -> cross-asset volatility"

    def _factor_interpretation(self, factor: str, value: float) -> str:
        direction = "up" if value >= 0 else "down"
        mapping = {
            "rates": f"Rates pressure {direction}",
            "inflation": f"Inflation impulse {direction}",
            "fx": f"FX volatility {direction}",
            "growth": f"Growth pulse {direction}",
            "geopolitics": f"Geopolitical risk {direction}",
            "volatility": f"Volatility regime {direction}",
            "commodity": f"Commodity pressure {direction}",
            "liquidity": f"Liquidity stress {'up' if value <= 0 else 'down'}",
        }
        return mapping.get(factor, f"{factor} contribution {direction}")

    def _extract_discussion_history(
        self,
        rows: list[dict[str, Any]],
        *,
        theme_id: str,
        limit: int,
    ) -> list[ThemeDiscussionSnapshot]:
        items: list[ThemeDiscussionSnapshot] = []
        for row in rows:
            payload = row.get("payload")
            as_of = _parse_datetime(row.get("as_of")) or datetime.now(tz=timezone.utc)
            if not isinstance(payload, dict):
                continue
            developments = payload.get("developments", [])
            if not isinstance(developments, list):
                continue

            for dev in developments:
                if str(dev.get("theme_id", "")).strip().lower() != theme_id.strip().lower():
                    continue
                actions = dev.get("recommended_actions", [])
                primary_action = ""
                if isinstance(actions, list) and actions:
                    primary_action = str(actions[0].get("action", "Review risk posture"))

                items.append(
                    ThemeDiscussionSnapshot(
                        as_of=as_of,
                        title=str(dev.get("title", "")),
                        summary=str(dev.get("executive_summary", "")),
                        state=str(dev.get("state", "neutral")),
                        outlook_state=str(dev.get("outlook_state", "stable")),
                        importance=int(clamp(float(dev.get("importance", 0)), 0, 100)),
                        primary_action=primary_action or "Review risk posture",
                    )
                )
                break

            if len(items) >= limit:
                break
        return items

    def _importance_score(
        self,
        temperature: int,
        mention_count: int,
        source_diversity: int,
        cross_region_spread: int,
        market_reaction_score: int,
    ) -> int:
        mention_score = min(100, mention_count * 9)
        diversity_score = min(100, source_diversity * 18)
        spread_score = min(100, cross_region_spread * 18)
        score = (
            temperature * 0.42
            + mention_score * 0.2
            + diversity_score * 0.14
            + spread_score * 0.12
            + market_reaction_score * 0.12
        )
        return int(clamp(round(score), 0, 100))

    def _derive_outlook_state(self, temperature: int, momentum: float, timeline_points: list[Any]) -> str:
        recent_delta = 0.0
        if len(timeline_points) >= 2:
            recent_delta = float(timeline_points[-1].temperature - timeline_points[-2].temperature)

        blended_delta = momentum * 0.65 + recent_delta * 0.35
        if temperature >= 72 and blended_delta >= -1:
            return "persistent_hot"
        if blended_delta >= 7:
            return "heating_up"
        if blended_delta <= -7:
            return "cooling_down"
        if temperature <= 35:
            return "muted"
        return "stable"

    def _market_confirmation(self, market_reaction_score: int) -> str:
        if market_reaction_score >= 70:
            return "strong"
        if market_reaction_score >= 45:
            return "moderate"
        return "weak"

    def _causal_chain(self, theme_id: str, label: str, regions: list[str]) -> list[CausalChainStep]:
        anchor_region = regions[0].upper() if regions else "G10"
        chains: dict[str, list[tuple[str, str]]] = {
            "inflation-shock": [
                ("Macro catalyst", f"{anchor_region} inflation surprise remains above consensus."),
                ("Policy interpretation", "Central banks are biased to stay restrictive longer."),
                ("Market transmission", "Rates volatility and curve repricing pressure broad risk assets."),
                ("Portfolio implication", "Duration and high-beta exposures need tighter risk budgets."),
            ],
            "monetary-policy": [
                ("Macro catalyst", "Policy communication diverges from prior guidance."),
                ("Policy interpretation", "Rate path uncertainty widens terminal-rate expectations."),
                ("Market transmission", "Front-end yields and FX carry reprice first."),
                ("Portfolio implication", "Macro books should tighten stop-loss levels around policy dates."),
            ],
            "growth-slowdown": [
                ("Macro catalyst", "Activity indicators signal weaker demand momentum."),
                ("Policy interpretation", "Earnings and credit expectations move lower."),
                ("Market transmission", "Equities/credit underperform while defensive duration outperforms."),
                ("Portfolio implication", "Rotate into quality and reduce cyclical beta concentration."),
            ],
            "energy-supply": [
                ("Macro catalyst", "Energy supply disruption tightens oil and gas balance."),
                ("Policy interpretation", "Inflation persistence risk rises despite softer growth."),
                ("Market transmission", "Commodity-linked FX and inflation breakevens move higher."),
                ("Portfolio implication", "Raise commodity hedge coverage and monitor margin shocks."),
            ],
            "geopolitical-risk": [
                ("Macro catalyst", "Geopolitical escalation raises cross-border risk premia."),
                ("Policy interpretation", "Sanctions and logistics frictions impair trade channels."),
                ("Market transmission", "Risk-off flow into USD and volatility instruments accelerates."),
                ("Portfolio implication", "Increase tail hedges and cap concentration in exposed regions."),
            ],
            "banking-liquidity": [
                ("Macro catalyst", "Funding stress and balance-sheet concerns build in banks."),
                ("Policy interpretation", "Policy support expectations rise but credit conditions tighten."),
                ("Market transmission", "Credit spreads and interbank stress indicators widen."),
                ("Portfolio implication", "Reduce lower-quality credit exposure and raise liquidity buffers."),
            ],
            "trade-regulation": [
                ("Macro catalyst", "Trade and regulatory actions constrain cross-border flows."),
                ("Policy interpretation", "Supply chains and sector profitability assumptions reset."),
                ("Market transmission", "Regional equities and FX dispersion increases."),
                ("Portfolio implication", "Diversify supply-chain-sensitive exposures and region concentration."),
            ],
        }

        selected = chains.get(theme_id, chains["monetary-policy"])
        return [
            CausalChainStep(step=index + 1, title=title, detail=detail)
            for index, (title, detail) in enumerate(selected)
        ]

    def _risk_implications(self, theme_id: str) -> list[ThemeRiskImplication]:
        mapping: dict[str, list[ThemeRiskImplication]] = {
            "inflation-shock": [
                ThemeRiskImplication(
                    asset_class="Rates",
                    direction="volatility_up",
                    severity="high",
                    rationale="Front-end policy uncertainty lifts realized volatility.",
                ),
                ThemeRiskImplication(
                    asset_class="Equities",
                    direction="valuation_pressure",
                    severity="medium",
                    rationale="Higher discount rates weigh on long-duration equity multiples.",
                ),
            ],
            "energy-supply": [
                ThemeRiskImplication(
                    asset_class="Commodities",
                    direction="price_up",
                    severity="high",
                    rationale="Supply constraints tighten prompt contracts.",
                ),
                ThemeRiskImplication(
                    asset_class="FX",
                    direction="dispersion_up",
                    severity="medium",
                    rationale="Terms-of-trade divergence drives FX repricing.",
                ),
            ],
            "geopolitical-risk": [
                ThemeRiskImplication(
                    asset_class="Cross-asset",
                    direction="risk_off",
                    severity="high",
                    rationale="Global risk premium rises during conflict escalation.",
                ),
                ThemeRiskImplication(
                    asset_class="Credit",
                    direction="spread_wider",
                    severity="medium",
                    rationale="Funding risk and growth uncertainty widen credit spreads.",
                ),
            ],
        }
        if theme_id in mapping:
            return mapping[theme_id]
        return [
            ThemeRiskImplication(
                asset_class="Multi-asset",
                direction="dispersion_up",
                severity="medium",
                rationale="Theme intensity is increasing cross-asset pricing dispersion.",
            ),
            ThemeRiskImplication(
                asset_class="Liquidity",
                direction="fragility_up",
                severity="medium",
                rationale="Crowded positioning can amplify intraday drawdowns.",
            ),
        ]

    def _recommended_actions(self, theme_id: str) -> list[RecommendedAction]:
        mapping: dict[str, list[RecommendedAction]] = {
            "inflation-shock": [
                RecommendedAction(
                    action="Reduce net duration and rebalance curve exposure.",
                    rationale="Inflation persistence keeps rate-path uncertainty elevated.",
                    horizon="next_24h",
                ),
                RecommendedAction(
                    action="Add explicit rates-volatility hedge overlay.",
                    rationale="Macro data surprises can trigger convex moves.",
                    horizon="next_week",
                ),
            ],
            "geopolitical-risk": [
                RecommendedAction(
                    action="Increase downside equity hedges and FX defensives.",
                    rationale="Risk-off skew steepens during geopolitical shocks.",
                    horizon="next_24h",
                ),
                RecommendedAction(
                    action="Cap concentration in exposed geographies/sectors.",
                    rationale="Cross-border spillovers can be nonlinear.",
                    horizon="next_week",
                ),
            ],
            "energy-supply": [
                RecommendedAction(
                    action="Expand commodity hedge ratio for energy-sensitive books.",
                    rationale="Supply-side shocks can sustain upside convexity in oil/gas.",
                    horizon="next_24h",
                ),
                RecommendedAction(
                    action="Review inflation-sensitive fixed-income sleeves.",
                    rationale="Energy pass-through pressures breakevens and real rates.",
                    horizon="next_week",
                ),
            ],
        }
        if theme_id in mapping:
            return mapping[theme_id]
        return [
            RecommendedAction(
                action="Tighten position limits in affected asset clusters.",
                rationale="Theme temperature and momentum imply faster repricing risk.",
                horizon="next_24h",
            ),
            RecommendedAction(
                action="Run scenario stress linked to this development.",
                rationale="Scenario context quantifies potential P/L tail outcomes.",
                horizon="next_week",
            ),
        ]

    def _watch_triggers(self, theme: Any, outlook: str) -> list[WatchTrigger]:
        top_region = theme.top_regions[0].upper() if theme.top_regions else "GLOBAL"
        return [
            WatchTrigger(
                signal=f"{top_region} macro release surprises",
                hotter_if="Upward surprise + broad cross-asset confirmation",
                cooler_if="In-line print + declining options-implied volatility",
            ),
            WatchTrigger(
                signal=f"{theme.label} source breadth",
                hotter_if="Source diversity and mention velocity keep rising",
                cooler_if=f"Momentum turns negative for two consecutive snapshots ({outlook})",
            ),
        ]

    def _scenario_preset(self, theme_id: str) -> ScenarioPreset:
        raw = self._scenario_presets.get(theme_id, self._scenario_presets["monetary-policy"])
        return ScenarioPreset(
            driver=str(raw["driver"]),
            event=str(raw["event"]),
            region=str(raw["region"]),
            severity=int(raw["severity"]),
            horizon=str(raw["horizon"]),
            baseline_mode="live_blend",
        )

    def _overall_risk_value(self, cards: list[Any]) -> int:
        for card in cards:
            if str(getattr(card, "label", "")).lower() == "overall risk index":
                return int(getattr(card, "value", 0))
        if not cards:
            return 0
        return int(sum(int(getattr(card, "value", 0)) for card in cards) / max(1, len(cards)))

    def _overall_regime(self, overall_risk: int) -> str:
        if overall_risk >= 72:
            return "defensive"
        if overall_risk >= 48:
            return "balanced_caution"
        return "constructive"

    def _blend_confidence(
        self,
        a: ConfidenceTrace,
        b: ConfidenceTrace,
        c: ConfidenceTrace,
    ) -> ConfidenceTrace:
        freshness = (a.components.freshness + b.components.freshness + c.components.freshness) / 3.0
        coverage = (a.components.coverage + b.components.coverage + c.components.coverage) / 3.0
        stability = (a.components.stability + b.components.stability + c.components.stability) / 3.0
        score = int(clamp(round((a.score + b.score + c.score) / 3.0), 0, 100))
        return ConfidenceTrace(
            score=score,
            components=ConfidenceComponents(
                freshness=float(clamp(freshness, 0.0, 1.0)),
                coverage=float(clamp(coverage, 0.0, 1.0)),
                stability=float(clamp(stability, 0.0, 1.0)),
            ),
        )


def _parse_datetime(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _extract_keywords(text: str) -> list[str]:
    raw = re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", str(text or "").lower())
    stop_words = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "that",
        "this",
        "about",
        "what",
        "when",
        "where",
        "which",
        "will",
        "would",
        "could",
        "should",
        "have",
        "has",
        "been",
        "are",
        "was",
        "were",
        "but",
        "you",
        "your",
        "our",
    }
    seen: set[str] = set()
    terms: list[str] = []
    for token in raw:
        if token in stop_words:
            continue
        if token in seen:
            continue
        seen.add(token)
        terms.append(token)
        if len(terms) >= 20:
            break
    return terms
