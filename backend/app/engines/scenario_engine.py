from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from app.data.repository import DataRepository
from app.engines.confidence_engine import compute_confidence
from app.engines.decay import clamp
from app.engines.explainer import make_trace
from app.engines.graph_propagation import EdgeFlow, propagate
from app.engines.world_pulse_engine import WorldPulseEngine
from app.schemas.scenario import (
    ScenarioAssetImpact,
    ScenarioExecutionLog,
    ScenarioGraph,
    ScenarioGraphEdge,
    ScenarioGraphNode,
    ScenarioOptionsResponse,
    ScenarioRunRequest,
    ScenarioRunResponse,
)


class ScenarioEngine:
    def __init__(self, repository: DataRepository, world_pulse_engine: WorldPulseEngine) -> None:
        self.repository = repository
        self.world_pulse_engine = world_pulse_engine
        self.catalog = repository.curated.scenario_catalog()
        self.asset_sensitivity = repository.curated.asset_sensitivity()
        self.top_economies = sorted(
            repository.curated.top_countries(),
            key=lambda row: float(row.get("importance", 0.0)),
            reverse=True,
        )[:50]
        self.region_map: dict[str, str] = {}
        for country in self.top_economies:
            name = str(country.get("name", "")).strip()
            cluster = self._normalize_cluster(str(country.get("cluster", "")))
            if name and cluster:
                self.region_map[name] = cluster

        # Backward compatibility for existing presets and bookmarked links.
        self.region_map.update(
            {
                "Europe": "europe",
                "Middle East": "middleeast",
                "Emerging Markets": "em",
            }
        )
        self.aggregate_to_economy = {
            "europe": "Germany",
            "middle east": "Saudi Arabia",
            "middleeast": "Saudi Arabia",
            "emerging markets": "India",
            "em": "India",
        }
        self.region_aliases = self._build_region_aliases()
        self.economy_options = [name for name in self.region_map if name not in {"Europe", "Middle East", "Emerging Markets"}]
        self.templates = repository.curated.explanation_templates()

    def options(self) -> ScenarioOptionsResponse:
        return ScenarioOptionsResponse(
            drivers=self.catalog["drivers"],
            events=[event["label"] for event in self.catalog["events"]],
            regions=self.economy_options or self.catalog["regions"],
            horizons=self.catalog["horizons"],
        )

    async def run(self, request: ScenarioRunRequest) -> ScenarioRunResponse:
        return await self._simulate(request)

    async def run_stream(
        self,
        request: ScenarioRunRequest,
        *,
        playback_delay_seconds: float = 0.24,
    ) -> AsyncGenerator[dict[str, Any], None]:
        queue: asyncio.Queue[ScenarioExecutionLog] = asyncio.Queue()

        async def _sink(log: ScenarioExecutionLog) -> None:
            await queue.put(log)

        simulation_task = asyncio.create_task(self._simulate(request, log_sink=_sink))
        try:
            while True:
                if simulation_task.done() and queue.empty():
                    break
                try:
                    log_item = await asyncio.wait_for(queue.get(), timeout=0.05)
                except TimeoutError:
                    continue

                yield {"type": "log", "log": log_item.model_dump()}
                if playback_delay_seconds > 0:
                    await asyncio.sleep(playback_delay_seconds)

            result = await simulation_task
            yield {"type": "result", "result": result.model_dump(mode="json", by_alias=True)}
        except Exception:
            if not simulation_task.done():
                simulation_task.cancel()
            raise

    async def _simulate(
        self,
        request: ScenarioRunRequest,
        *,
        log_sink: Callable[[ScenarioExecutionLog], Awaitable[None]] | None = None,
    ) -> ScenarioRunResponse:
        execution_trace: list[ScenarioExecutionLog] = []

        async def _emit(stage: str, message: str, details: dict[str, float | int | str]) -> None:
            log = ScenarioExecutionLog(
                step=len(execution_trace) + 1,
                stage=stage,
                message=message,
                details=details,
            )
            execution_trace.append(log)
            if log_sink is not None:
                await log_sink(log)

        resolved_request, prompt_resolution = self._resolve_prompt_request(request)
        request = resolved_request

        if prompt_resolution:
            await _emit(
                "prompt_interpretation",
                "Resolved natural-language scenario prompt into deterministic engine configuration.",
                prompt_resolution,
            )

        event = self._find_event(request.event)
        if event is None:
            raise ValueError(f"Unsupported scenario event: {request.event}")

        origin_region = self.region_map.get(request.region)
        if not origin_region:
            raise ValueError(f"Unsupported region: {request.region}")
        await _emit(
            "validation",
            "Validated scenario configuration and mapped origin region.",
            {
                "driver": request.driver,
                "event": request.event,
                "origin_region": origin_region,
                "severity": request.severity,
                "horizon": request.horizon,
            },
        )

        horizon_months = int(self.catalog["horizon_months"].get(request.horizon, 12))
        severity_scale = request.severity / 100.0
        await _emit(
            "preprocessing",
            "Calibrated simulation horizon and severity scaling constants.",
            {
                "horizon_months": horizon_months,
                "severity_scale": round(severity_scale, 4),
            },
        )

        world_factor_state = await self.world_pulse_engine.compute_factor_state()
        baseline_factors = world_factor_state.factors
        await _emit(
            "baseline",
            "Loaded live baseline factor state from world pulse inputs.",
            {
                "factor_count": len(baseline_factors),
                "coverage": round(world_factor_state.coverage, 4),
                "freshness": round(world_factor_state.freshness, 4),
                "stability": round(world_factor_state.stability, 4),
            },
        )

        scenario_factors = {
            factor: baseline_factors.get(factor, 0.0) * 0.2
            for factor in set(baseline_factors) | set(event["shock_vector"])
        }
        for factor, value in event["shock_vector"].items():
            scenario_factors[factor] = scenario_factors.get(factor, 0.0) + float(value) * severity_scale

        leading_shock = max(
            event["shock_vector"].items(),
            key=lambda item: abs(float(item[1]) * severity_scale),
        )
        await _emit(
            "shock_injection",
            "Injected selected event shock vector into baseline factors.",
            {
                "shock_terms": len(event["shock_vector"]),
                "leading_factor": leading_shock[0],
                "leading_contribution": round(float(leading_shock[1]) * severity_scale, 4),
                "severity_scale": round(severity_scale, 4),
            },
        )

        region_intensities, edge_flows, _ = propagate(
            edges=self.repository.curated.transmission_edges(),
            origin=origin_region,
            severity=request.severity,
            driver=request.driver,
            max_steps=max(2, min(6, horizon_months // 3)),
            step_decay=0.84,
            flow_threshold=0.015,
        )
        peak_region = max(region_intensities.items(), key=lambda item: item[1])
        await _emit(
            "propagation",
            "Ran directed weighted graph propagation over transmission edges.",
            {
                "activated_regions": len(region_intensities),
                "active_edges": len(edge_flows),
                "max_steps": max(2, min(6, horizon_months // 3)),
                "peak_region": peak_region[0],
                "peak_intensity": round(peak_region[1], 4),
            },
        )

        spillover = sum(value for key, value in region_intensities.items() if key != origin_region) / max(
            1, len(region_intensities) - 1
        )

        scenario_factors["contagion"] = scenario_factors.get("contagion", 0.0) + spillover * 0.85
        scenario_factors["volatility"] = scenario_factors.get("volatility", 0.0) + spillover * 0.65
        scenario_factors["fx"] = scenario_factors.get("fx", 0.0) + spillover * 0.35
        await _emit(
            "spillover_adjustment",
            "Applied spillover adjustments to contagion, volatility, and FX channels.",
            {
                "spillover": round(spillover, 4),
                "contagion": round(scenario_factors.get("contagion", 0.0), 4),
                "volatility": round(scenario_factors.get("volatility", 0.0), 4),
                "fx": round(scenario_factors.get("fx", 0.0), 4),
            },
        )

        graph_nodes, graph_edges = self._build_graph_output(scenario_factors, edge_flows, request.severity)
        await _emit(
            "graph_materialization",
            "Materialized propagation graph nodes/edges from channel intensities.",
            {
                "graph_nodes": len(graph_nodes),
                "graph_edges": len(graph_edges),
            },
        )
        impacts = self._compute_asset_impacts(scenario_factors, severity_scale, horizon_months)
        top_impact = impacts[0] if impacts else None
        await _emit(
            "asset_mapping",
            "Mapped factor pressures into asset-level scenario impacts.",
            {
                "assets_scored": len(impacts),
                "top_asset": top_impact.asset if top_impact else "n/a",
                "top_impact": round(top_impact.impact, 2) if top_impact else 0.0,
                "top_unit": top_impact.unit if top_impact else "n/a",
            },
        )

        confidence = compute_confidence(
            freshness=world_factor_state.freshness,
            coverage=world_factor_state.coverage,
            stability=world_factor_state.stability,
        )
        await _emit(
            "confidence",
            "Computed confidence score from freshness, coverage, and stability.",
            {"confidence_score": confidence.score},
        )

        dominant_factors = sorted(scenario_factors.items(), key=lambda item: abs(item[1]), reverse=True)
        if len(dominant_factors) < 2:
            dominant_factors.extend([("policy", 0.0), ("contagion", 0.0)])

        summary = (
            f"{request.event} from {request.region} propagates into {graph_nodes[-1].label} "
            f"with peak simulated pressure in {dominant_factors[0][0]} and {dominant_factors[1][0]}."
        )

        explanation = make_trace(
            summary=self.templates["scenario"].format(
                event=request.event,
                region=request.region,
                channel_a=dominant_factors[0][0],
                channel_b=dominant_factors[1][0],
                peak_node=graph_nodes[-1].label,
            ),
            top_factors=[
                {
                    "factor": factor,
                    "contribution": contribution,
                    "weight": 1.0,
                    "value": contribution,
                }
                for factor, contribution in dominant_factors[:5]
            ],
        )
        await _emit(
            "finalization",
            "Scenario simulation complete; packaged graph, impacts, confidence, and explanation.",
            {
                "dominant_factor_a": dominant_factors[0][0],
                "dominant_factor_b": dominant_factors[1][0],
                "graph_nodes": len(graph_nodes),
                "graph_edges": len(graph_edges),
            },
        )

        return ScenarioRunResponse(
            as_of=datetime.now(tz=timezone.utc),
            config=request,
            graph=ScenarioGraph(nodes=graph_nodes, edges=graph_edges),
            impacts=impacts,
            summary=summary,
            confidence=confidence,
            explanation=explanation,
            execution_trace=execution_trace,
        )

    def _find_event(self, label: str) -> dict[str, Any] | None:
        for event in self.catalog["events"]:
            if event["label"] == label:
                return event
        return None

    def _normalize_cluster(self, value: str) -> str:
        normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "middle_east": "middleeast",
            "middleeast": "middleeast",
            "united_states": "us",
            "north_america": "us",
            "usa": "us",
            "us": "us",
            "europe": "europe",
            "china": "china",
            "japan": "japan",
            "em": "em",
            "emerging_markets": "em",
        }
        return aliases.get(normalized, normalized or "em")

    def _build_region_aliases(self) -> dict[str, str]:
        aliases: dict[str, str] = {}
        for region in self.region_map:
            aliases[str(region).strip().lower()] = region

        aliases.update(
            {
                "us": "United States",
                "u.s.": "United States",
                "usa": "United States",
                "uk": "United Kingdom",
                "u.k.": "United Kingdom",
                "uae": "United Arab Emirates",
                "korea": "South Korea",
                "saudi": "Saudi Arabia",
                "europe": self.aggregate_to_economy["europe"],
                "middle east": self.aggregate_to_economy["middle east"],
                "middleeast": self.aggregate_to_economy["middleeast"],
                "emerging markets": self.aggregate_to_economy["emerging markets"],
                "em": self.aggregate_to_economy["em"],
            }
        )
        return aliases

    def _resolve_prompt_request(self, request: ScenarioRunRequest) -> tuple[ScenarioRunRequest, dict[str, float | int | str] | None]:
        prompt = str(request.scenario_prompt or "").strip()
        if not prompt:
            return request, None

        driver = request.driver if request.driver in self.catalog["drivers"] else self.catalog["drivers"][0]
        event = request.event if self._find_event(request.event) else self._event_for_driver(driver)
        region = self._canonical_region_name(request.region)
        severity = int(clamp(int(request.severity), 10, 100))
        horizon = request.horizon if request.horizon in self.catalog["horizons"] else self.catalog["horizons"][0]

        parsed_driver, driver_signal_hits = self._extract_prompt_driver(prompt)
        if parsed_driver:
            driver = parsed_driver
            event = self._event_for_driver(driver)

        parsed_event = self._extract_prompt_event(prompt, driver=driver)
        if parsed_event:
            event = parsed_event

        parsed_region, region_signal = self._extract_prompt_region(prompt)
        if parsed_region:
            region = parsed_region

        severity = self._extract_prompt_severity(prompt, default=severity)
        horizon = self._extract_prompt_horizon(prompt, default=horizon)

        event_payload = self._find_event(event)
        if event_payload is None:
            event = self._event_for_driver(driver)
            event_payload = self._find_event(event)
        if event_payload is not None and str(event_payload.get("driver", "")) != driver:
            event = self._event_for_driver(driver)

        if region not in self.region_map:
            region = self._canonical_region_name(region)
        if region not in self.region_map:
            region = self.economy_options[0] if self.economy_options else "United States"

        resolved = ScenarioRunRequest(
            driver=driver,
            event=event,
            region=region,
            severity=int(clamp(severity, 10, 100)),
            horizon=horizon if horizon in self.catalog["horizons"] else self.catalog["horizons"][0],
            scenario_prompt=prompt,
        )
        details: dict[str, float | int | str] = {
            "prompt_chars": len(prompt),
            "driver": resolved.driver,
            "event": resolved.event,
            "region": resolved.region,
            "severity": resolved.severity,
            "horizon": resolved.horizon,
            "driver_signal_hits": driver_signal_hits,
            "region_signal": region_signal or "none",
        }
        return resolved, details

    def _extract_prompt_driver(self, prompt: str) -> tuple[str, int]:
        text = str(prompt or "").lower()
        driver_terms: dict[str, tuple[str, ...]] = {
            "Interest Rates": ("rate", "yield", "fed", "ecb", "boj", "tightening", "easing", "policy path"),
            "Oil Price": ("oil", "crude", "brent", "wti", "energy", "opec", "gas"),
            "Currency": ("fx", "currency", "forex", "usd", "dollar", "yen", "euro", "devaluation"),
            "Trade Policy": ("trade", "tariff", "import", "export", "customs", "supply chain", "sanction"),
            "Technology": ("technology", "tech", "ai", "capex", "chip", "semiconductor", "cloud"),
            "Geopolitical": ("war", "conflict", "geopolitical", "military", "ceasefire", "border"),
        }
        best_driver = ""
        best_hits = 0
        for driver, terms in driver_terms.items():
            hits = sum(1 for term in terms if term in text)
            if hits > best_hits:
                best_hits = hits
                best_driver = driver
        if best_driver and best_hits > 0:
            return best_driver, best_hits
        return "", 0

    def _extract_prompt_event(self, prompt: str, *, driver: str) -> str:
        text = str(prompt or "").lower()
        event_terms: dict[str, tuple[str, ...]] = {
            "Rate Hike +100bp": ("rate hike", "tightening", "hawkish", "yield spike", "policy shock"),
            "Oil Spike to $120": ("oil spike", "energy shock", "crude", "brent", "wti", "supply disruption"),
            "USD Surge +15%": ("usd surge", "dollar strength", "fx shock", "currency shock", "dxy"),
            "Tariff Escalation": ("tariff", "trade war", "import duty", "export restriction", "trade restriction"),
            "AI Capex Boom": ("ai boom", "ai capex", "semiconductor surge", "chip investment", "datacenter build"),
            "Regional Conflict": ("regional conflict", "war", "military", "geopolitical escalation", "missile"),
        }
        for event_label, terms in event_terms.items():
            if any(term in text for term in terms):
                return event_label
        return self._event_for_driver(driver)

    def _extract_prompt_region(self, prompt: str) -> tuple[str, str]:
        text = str(prompt or "").lower()
        alias_keys = sorted(self.region_aliases.keys(), key=len, reverse=True)
        for alias in alias_keys:
            if self._contains_prompt_token(text, alias):
                name = self.region_aliases[alias]
                return self._canonical_region_name(name), alias
        return "", ""

    def _extract_prompt_severity(self, prompt: str, *, default: int) -> int:
        text = str(prompt or "").lower()
        pct_match = re.search(r"(\d{1,3})\s*%", text)
        if pct_match:
            return int(clamp(int(pct_match.group(1)), 10, 100))

        bp_match = re.search(r"(\d{2,3})\s*bp", text)
        if bp_match:
            bps = int(bp_match.group(1))
            scaled = int(round(bps * 0.7))
            return int(clamp(scaled, 10, 100))

        if any(token in text for token in ("extreme", "severe", "aggressive", "critical")):
            return 88
        if any(token in text for token in ("high", "significant", "strong", "stress test")):
            return 76
        if any(token in text for token in ("moderate", "base case", "baseline")):
            return 60
        if any(token in text for token in ("mild", "contained", "limited", "low")):
            return 44
        return int(clamp(default, 10, 100))

    def _extract_prompt_horizon(self, prompt: str, *, default: str) -> str:
        text = str(prompt or "").lower()
        month_match = re.search(r"(\d{1,2})\s*(month|months|mo)\b", text)
        if month_match:
            return self._closest_horizon(int(month_match.group(1)))

        year_match = re.search(r"(\d{1,2})\s*(year|years|yr|yrs)\b", text)
        if year_match:
            years = int(year_match.group(1))
            return self._closest_horizon(years * 12)

        if "short term" in text or "near term" in text:
            return self._closest_horizon(3)
        if "medium term" in text:
            return self._closest_horizon(12)
        if "long term" in text:
            return self._closest_horizon(24)
        return default if default in self.catalog["horizons"] else self.catalog["horizons"][0]

    def _closest_horizon(self, months: int) -> str:
        month_map = {
            label: int(value)
            for label, value in self.catalog.get("horizon_months", {}).items()
            if isinstance(value, (int, float))
        }
        if not month_map:
            return self.catalog["horizons"][0]
        nearest = min(month_map.items(), key=lambda row: abs(int(row[1]) - int(months)))
        return nearest[0]

    def _canonical_region_name(self, value: str) -> str:
        raw = str(value or "").strip()
        if not raw:
            return self.economy_options[0] if self.economy_options else "United States"
        lowered = raw.lower()
        if lowered in self.aggregate_to_economy:
            mapped = self.aggregate_to_economy[lowered]
            if mapped in self.region_map:
                return mapped

        alias_match = self.region_aliases.get(lowered)
        if alias_match:
            return alias_match

        for region_name in self.region_map:
            if region_name.lower() == lowered:
                return region_name
        return raw

    def _contains_prompt_token(self, text: str, token: str) -> bool:
        if not token:
            return False
        normalized = token.lower().strip()
        if normalized in {"u.s.", "u.k."}:
            return normalized in text
        pattern = r"\b" + re.escape(normalized).replace(r"\ ", r"\s+") + r"\b"
        return re.search(pattern, text) is not None

    def _event_for_driver(self, driver: str) -> str:
        for event in self.catalog["events"]:
            if str(event.get("driver", "")) == driver:
                return str(event["label"])
        return str(self.catalog["events"][0]["label"])

    def _build_graph_output(
        self,
        scenario_factors: dict[str, float],
        edge_flows: list[EdgeFlow],
        severity: int,
    ) -> tuple[list[ScenarioGraphNode], list[ScenarioGraphEdge]]:
        graph_def = self.catalog["scenario_graph"]

        activation_priority = {
            "origin": 0,
            "rates": 1,
            "fx": 2,
            "commodities": 3,
            "equities": 4,
            "credit": 5,
            "em": 6,
            "volatility": 7,
        }

        nodes: list[ScenarioGraphNode] = []
        for node in graph_def["nodes"]:
            factor = node.get("factor", "volatility")
            if node["id"] == "origin":
                intensity = clamp(severity / 100.0, 0.0, 1.0)
            else:
                intensity = clamp(abs(scenario_factors.get(factor, 0.0)) / 2.5, 0.0, 1.0)

            nodes.append(
                ScenarioGraphNode(
                    id=node["id"],
                    label=node["label"],
                    x=float(node["x"]),
                    y=float(node["y"]),
                    color=node["color"],
                    intensity=float(round(intensity, 4)),
                    activation_step=activation_priority.get(node["id"], 7),
                )
            )

        flow_lookup: dict[tuple[str, str], tuple[float, int]] = {}
        for flow in edge_flows:
            key = (flow.from_node, flow.to_node)
            previous = flow_lookup.get(key)
            if previous is None or flow.flow > previous[0]:
                flow_lookup[key] = (flow.flow, flow.activation_step)

        edges: list[ScenarioGraphEdge] = []
        for edge in graph_def["edges"]:
            flow, step = flow_lookup.get((edge["from"], edge["to"]), (0.0, activation_priority.get(edge["to"], 6)))
            edges.append(
                ScenarioGraphEdge(
                    **{
                        "from": edge["from"],
                        "to": edge["to"],
                        "weight": float(edge["weight"]),
                        "flow": float(round(clamp(flow + float(edge["weight"]) * 0.15, 0.0, 1.0), 4)),
                        "activation_step": int(step),
                    }
                )
            )

        return nodes, edges

    def _compute_asset_impacts(
        self,
        scenario_factors: dict[str, float],
        severity_scale: float,
        horizon_months: int,
    ) -> list[ScenarioAssetImpact]:
        impacts: list[ScenarioAssetImpact] = []
        horizon_scale = 1.0 + (horizon_months / 24.0) * 0.4

        for asset in self.asset_sensitivity:
            score = 0.0
            for factor, weight in asset["factor_weights"].items():
                score += float(weight) * float(scenario_factors.get(factor, 0.0))

            raw_impact = score * severity_scale * horizon_scale
            if asset["unit"] == "bp":
                impact = round(raw_impact * 32.0, 2)
            else:
                impact = round(raw_impact * 5.0, 2)

            abs_impact = abs(impact)
            if asset["unit"] == "bp":
                if abs_impact >= 28:
                    severity = "critical"
                elif abs_impact >= 18:
                    severity = "high"
                elif abs_impact >= 8:
                    severity = "medium"
                else:
                    severity = "low"
            else:
                if abs_impact >= 9:
                    severity = "critical"
                elif abs_impact >= 5:
                    severity = "high"
                elif abs_impact >= 2.5:
                    severity = "medium"
                else:
                    severity = "low"

            impacts.append(
                ScenarioAssetImpact(
                    asset=asset["asset"],
                    impact=impact,
                    unit=asset["unit"],
                    severity=severity,
                )
            )

        impacts.sort(key=lambda item: abs(item.impact), reverse=True)
        return impacts
