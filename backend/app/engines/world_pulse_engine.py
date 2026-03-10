from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.data.repository import DataRepository
from app.engines.confidence_engine import compute_confidence
from app.engines.decay import clamp, exp_time_decay
from app.engines.explainer import make_trace
from app.schemas.world_pulse import (
    CountryProfile,
    CountryRelationResponse,
    DataProof,
    DataSourceReference,
    Hotspot,
    RegionAssets,
    TransmissionArc,
    WorldPulseHeader,
    WorldPulseResponse,
)


@dataclass(slots=True)
class FactorState:
    factors: dict[str, float]
    coverage: float
    freshness: float
    stability: float
    provider_mix: dict[str, int]
    latest_market_observation: str
    market_inputs_used: int


class WorldPulseEngine:
    def __init__(self, repository: DataRepository) -> None:
        self.repository = repository
        self.settings = get_settings()

        factor_config = self.repository.curated.region_factor_weights()
        self.indicator_weights: dict[str, dict[str, float]] = factor_config["indicator_symbol_weights"]
        self.symbol_vol_scales: dict[str, float] = factor_config["symbol_vol_scales"]
        self.region_exposure: dict[str, dict[str, float]] = factor_config["region_factor_exposure"]
        self.risk_templates: dict[str, list[str]] = factor_config["risk_templates"]
        self.regions = self.repository.curated.regions()
        self.region_templates = {region["id"]: region for region in self.regions}
        self.countries = self.repository.curated.top_countries()
        self.edges = self.repository.curated.transmission_edges()
        self.templates = self.repository.curated.explanation_templates()

    async def compute_factor_state(self) -> FactorState:
        symbols = list(self.indicator_weights.keys())
        quotes = await self.repository.fetch_quotes(symbols)

        factors: dict[str, float] = {}
        valid = 0
        fresh = 0
        provider_mix: dict[str, int] = {}
        latest_market_observation = ""

        for symbol in symbols:
            quote = quotes.get(symbol)
            if not quote:
                continue

            close = _safe_float(quote.get("close"))
            open_ = _safe_float(quote.get("open"))
            if close is None or open_ is None or open_ == 0:
                continue

            valid += 1
            if quote.get("time"):
                fresh += 1
            provenance = quote.get("provenance", {})
            provider = str(provenance.get("provider", "unknown"))
            provider_mix[provider] = provider_mix.get(provider, 0) + 1
            observed_at = str(provenance.get("observed_at", ""))
            if observed_at and observed_at > latest_market_observation:
                latest_market_observation = observed_at

            move_pct = ((close - open_) / abs(open_)) * 100.0
            scale = max(0.05, float(self.symbol_vol_scales.get(symbol, 1.0)))
            normalized = clamp(move_pct / scale, -3.0, 3.0)

            for factor, weight in self.indicator_weights[symbol].items():
                factors[factor] = factors.get(factor, 0.0) + normalized * float(weight)

        coverage = valid / len(symbols) if symbols else 1.0
        freshness = fresh / valid if valid else 0.0

        last_snapshot = self.repository.get_latest_world_pulse_snapshot() or {}
        previous_factors = last_snapshot.get("factors", {}) if isinstance(last_snapshot, dict) else {}
        stability = _compute_stability(factors, previous_factors)

        # Apply configurable half-life with zero age for live tick; kept explicit for audit explainability.
        half_life = self.settings.time_decay_half_life_hours
        factors = {k: exp_time_decay(v, age_hours=0.0, half_life_hours=half_life) for k, v in factors.items()}

        return FactorState(
            factors=factors,
            coverage=coverage,
            freshness=freshness,
            stability=stability,
            provider_mix=provider_mix,
            latest_market_observation=latest_market_observation,
            market_inputs_used=valid,
        )

    async def build_world_pulse(self, *, factor_state: FactorState | None = None) -> WorldPulseResponse:
        factor_state = factor_state or await self.compute_factor_state()
        factors = factor_state.factors
        hotspot_objects = self._build_country_hotspots(factor_state)
        arc_objects = self._build_global_arcs(hotspot_objects, factors)

        confidence = compute_confidence(
            freshness=factor_state.freshness,
            coverage=factor_state.coverage,
            stability=factor_state.stability,
        )

        top_global_factors = sorted(factors.items(), key=lambda item: abs(item[1]), reverse=True)
        if len(top_global_factors) < 2:
            top_global_factors.extend([("growth", 0.0), ("policy", 0.0)])

        explanation = make_trace(
            summary=self.templates["world_pulse"].format(
                region="Global",
                heat=round(sum(spot.heat for spot in hotspot_objects) / max(1, len(hotspot_objects))),
                factor_a=top_global_factors[0][0],
                contrib_a=round(top_global_factors[0][1], 2),
                factor_b=top_global_factors[1][0],
                contrib_b=round(top_global_factors[1][1], 2),
            ),
            top_factors=[
                {
                    "factor": factor,
                    "contribution": value,
                    "weight": 1.0,
                    "value": value,
                }
                for factor, value in top_global_factors[:5]
            ],
        )

        response = WorldPulseResponse(
            as_of=datetime.now(tz=timezone.utc),
            header=WorldPulseHeader(
                active_regions=len(hotspot_objects),
                transmission_arcs=len(arc_objects),
            ),
            hotspots=hotspot_objects,
            arcs=arc_objects,
            confidence=confidence,
            explanation=explanation,
            data_proof=self._build_data_proof(
                factor_state,
                context="Global transmission overview",
                sources=self._build_global_sources(),
            ),
        )

        self.repository.save_world_pulse_snapshot(
            {
                "as_of": response.as_of.isoformat(),
                "factors": factors,
                "coverage": factor_state.coverage,
                "freshness": factor_state.freshness,
                "stability": factor_state.stability,
                "provider_mix": factor_state.provider_mix,
                "latest_market_observation": factor_state.latest_market_observation,
            }
        )

        return response

    async def build_country_relation(self, from_country: str, to_country: str) -> CountryRelationResponse:
        factor_state = await self.compute_factor_state()
        hotspots = self._build_country_hotspots(factor_state)
        hotspot_lookup = {spot.id: spot for spot in hotspots}

        left = hotspot_lookup.get(from_country.strip().lower())
        right = hotspot_lookup.get(to_country.strip().lower())
        if left is None or right is None:
            raise ValueError("Both countries must exist in the World Pulse country universe.")
        if left.id == right.id:
            raise ValueError("Choose two different countries to build a connection.")

        scores = self._relation_scores(left, right, factor_state.factors)
        dominant_channel = max(scores["channel_scores"].items(), key=lambda item: item[1])[0]
        narrative = (
            f"{left.name} to {right.name}: strongest transmission channel is {dominant_channel}. "
            f"Trade intensity {scores['trade_intensity']} / 100 and geopolitical risk {scores['geopolitical_risk']} / 100. "
            f"Relation quality is {scores['relation_quality_label']} ({scores['relation_quality_score']}/100)."
        )
        arc_trace = make_trace(
            summary=narrative,
            top_factors=[
                {
                    "factor": channel,
                    "contribution": value,
                    "weight": 1.0,
                    "value": value,
                }
                for channel, value in scores["channel_scores"].items()
            ],
        )

        arc = TransmissionArc(
            **{
                "from": left.id,
                "to": right.id,
                "label": f"{left.name} -> {right.name}",
                "color": _relation_quality_color(scores["relation_quality_label"]),
                "intensity": round(scores["relation_strength"] / 100.0, 4),
                "message": f"{dominant_channel} pulse",
                "trace_id": arc_trace.trace_id,
            }
        )

        explanation = make_trace(
            summary=narrative,
            top_factors=[
                {
                    "factor": "trade_intensity",
                    "contribution": scores["trade_intensity"],
                    "weight": 0.35,
                    "value": scores["trade_intensity"],
                },
                {
                    "factor": "financial_linkage",
                    "contribution": scores["financial_linkage"],
                    "weight": 0.30,
                    "value": scores["financial_linkage"],
                },
                {
                    "factor": "policy_divergence",
                    "contribution": -scores["policy_divergence"],
                    "weight": 0.20,
                    "value": scores["policy_divergence"],
                },
                {
                    "factor": "geopolitical_risk",
                    "contribution": -scores["geopolitical_risk"],
                    "weight": 0.15,
                    "value": scores["geopolitical_risk"],
                },
            ],
        )

        return CountryRelationResponse(
            as_of=datetime.now(tz=timezone.utc),
            from_country=left.id,
            to_country=right.id,
            relation_strength=scores["relation_strength"],
            relation_quality_score=scores["relation_quality_score"],
            relation_quality_label=scores["relation_quality_label"],
            trade_intensity=scores["trade_intensity"],
            financial_linkage=scores["financial_linkage"],
            policy_divergence=scores["policy_divergence"],
            geopolitical_risk=scores["geopolitical_risk"],
            channel_scores=scores["channel_scores"],
            dominant_channel=dominant_channel,
            estimated_spillover_bps=scores["estimated_spillover_bps"],
            narrative=narrative,
            arc=arc,
            explanation=explanation,
            data_proof=self._build_data_proof(
                factor_state,
                context=f"{left.name} <-> {right.name} relation",
                sources=self._build_relation_sources(left, right),
            ),
        )

    async def build_country_data_proof(self, country_id: str) -> DataProof:
        factor_state = await self.compute_factor_state()
        country = self._country_by_id(country_id)
        if country is None:
            raise ValueError("Country not found in World Pulse universe.")
        return self._build_data_proof(
            factor_state,
            context=f"{country['name']} country profile",
            sources=self._build_country_sources(country),
        )

    def _build_data_proof(
        self,
        factor_state: FactorState,
        *,
        context: str,
        sources: list[DataSourceReference],
    ) -> DataProof:
        return DataProof(
            context=context,
            methodology="Deterministic weighted-factor scoring + directed relation propagation.",
            deterministic=True,
            market_inputs_used=factor_state.market_inputs_used,
            provider_mix=factor_state.provider_mix,
            latest_market_observation=factor_state.latest_market_observation,
            sources=sources,
        )

    def _build_global_sources(self) -> list[DataSourceReference]:
        return [
            DataSourceReference(
                name="FRED (Federal Reserve Economic Data)",
                url="https://fred.stlouisfed.org/",
                coverage="Rates and macro reference series used in global factor scoring",
            ),
            DataSourceReference(
                name="Yahoo Finance",
                url="https://finance.yahoo.com/",
                coverage="Cross-asset intraday market observations",
            ),
            DataSourceReference(
                name="Twelve Data",
                url="https://twelvedata.com/",
                coverage="Real-time quote stream fallback/primary when configured",
            ),
            DataSourceReference(
                name="World Bank Open Data",
                url="https://data.worldbank.org/",
                coverage="Country structural baseline references",
            ),
            DataSourceReference(
                name="IMF Data",
                url="https://www.imf.org/en/Data",
                coverage="Macro regime reference and policy context",
            ),
        ]

    def _build_country_sources(self, country: dict[str, Any]) -> list[DataSourceReference]:
        country_name = str(country.get("name", "Country"))
        country_slug = _country_slug(country_name)
        return [
            DataSourceReference(
                name=f"World Bank - {country_name}",
                url=f"https://data.worldbank.org/country/{country_slug}",
                coverage=f"Structural macro indicators for {country_name}",
            ),
            DataSourceReference(
                name=f"IMF Country Data - {country_name}",
                url="https://www.imf.org/en/Countries",
                coverage=f"Macroeconomic and policy context for {country_name}",
            ),
            DataSourceReference(
                name="FRED (Federal Reserve Economic Data)",
                url="https://fred.stlouisfed.org/",
                coverage="Rates and market reference series affecting country heat/confidence",
            ),
            DataSourceReference(
                name="Yahoo Finance",
                url="https://finance.yahoo.com/",
                coverage="Live market observations used in cross-asset factor state",
            ),
        ]

    def _build_relation_sources(self, left: Hotspot, right: Hotspot) -> list[DataSourceReference]:
        pair_name = f"{left.name} - {right.name}"
        return [
            DataSourceReference(
                name=f"UN Comtrade - {pair_name}",
                url="https://comtradeplus.un.org/",
                coverage=f"Goods-trade linkage context for {pair_name}",
            ),
            DataSourceReference(
                name=f"IMF Direction of Trade Statistics - {pair_name}",
                url="https://data.imf.org/DOTS",
                coverage=f"Trade-flow directionality for {pair_name}",
            ),
            DataSourceReference(
                name=f"BIS Locational Banking Statistics - {pair_name}",
                url="https://www.bis.org/statistics/bankstats.htm",
                coverage=f"Cross-border financial linkage context for {pair_name}",
            ),
            DataSourceReference(
                name="Yahoo Finance",
                url="https://finance.yahoo.com/",
                coverage="Intraday market state used in relation-strength computation",
            ),
            DataSourceReference(
                name="FRED (Federal Reserve Economic Data)",
                url="https://fred.stlouisfed.org/",
                coverage="Rates/liquidity backdrop for policy and financial channel scoring",
            ),
        ]

    def _country_by_id(self, country_id: str) -> dict[str, Any] | None:
        target = country_id.strip().lower()
        for country in self.countries:
            if str(country.get("id", "")).lower() == target:
                return country
        return None

    def _build_country_hotspots(self, factor_state: FactorState) -> list[Hotspot]:
        factors = factor_state.factors
        hotspots: list[Hotspot] = []

        for country in self.countries:
            cluster = str(country.get("cluster", "em"))
            template = self.region_templates.get(cluster, self.region_templates.get("em", {}))
            exposure = self.region_exposure.get(cluster, self.region_exposure.get("em", {}))
            bias = _country_bias(country)
            adjusted_exposure = {
                factor: float(exposure.get(factor, 0.0)) * 0.78 + float(bias.get(factor, 0.0)) * 0.22
                for factor in set(exposure) | set(bias)
            }

            contribution = _dot(adjusted_exposure, factors)
            base_heat = 46 + float(country.get("importance", 60)) * 0.28
            heat = int(clamp(round(base_heat + contribution * 4.6), 15, 99))
            confidence = int(
                clamp(
                    round(
                        55
                        + float(country.get("importance", 60)) * 0.25
                        + factor_state.coverage * 10
                        + factor_state.stability * 8
                        - abs(contribution) * 1.1
                    ),
                    42,
                    98,
                )
            )

            ranked_factor_pairs = sorted(
                ((factor, adjusted_exposure.get(factor, 0.0) * factors.get(factor, 0.0)) for factor in adjusted_exposure),
                key=lambda item: abs(item[1]),
                reverse=True,
            )
            top_factor_names = [name for name, _ in ranked_factor_pairs[:2] if name] or ["growth", "policy"]

            narratives = _country_narratives(country, top_factor_names)
            regime = (
                f"{country['name']} stress profile is led by {top_factor_names[0]} and {top_factor_names[1]}, "
                f"with strongest transmission through {cluster.replace('_', ' ')} channels."
            )
            risks = _build_risks(top_factor_names, self.risk_templates)

            summary = self.templates["world_pulse"].format(
                region=country["name"],
                heat=heat,
                factor_a=top_factor_names[0],
                contrib_a=round(ranked_factor_pairs[0][1], 2) if ranked_factor_pairs else 0.0,
                factor_b=top_factor_names[1],
                contrib_b=round(ranked_factor_pairs[1][1], 2) if len(ranked_factor_pairs) > 1 else 0.0,
            )
            trace = make_trace(
                summary=summary,
                top_factors=[
                    {
                        "factor": factor,
                        "contribution": value,
                        "weight": adjusted_exposure.get(factor, 0.0),
                        "value": factors.get(factor, 0.0),
                    }
                    for factor, value in ranked_factor_pairs[:4]
                ],
            )

            hotspots.append(
                Hotspot(
                    id=country["id"],
                    name=country["name"],
                    lat=float(country["lat"]),
                    lng=float(country["lng"]),
                    narrative=narratives[0],
                    heat=heat,
                    confidence=confidence,
                    color="#ef4444",
                    regime=regime,
                    narratives=narratives,
                    risks=risks,
                    assets=RegionAssets(**template.get("assets", self.region_templates["us"]["assets"])),
                    cluster=cluster,
                    importance=int(country.get("importance", 60)),
                    profile=CountryProfile(
                        gdp_trillion_usd=float(country.get("gdp_trillion_usd", 0.0)),
                        population_millions=int(country.get("population_millions", 0)),
                        trade_openness=int(clamp(float(country.get("trade_openness", 50)), 0, 400)),
                        policy_rate=float(country.get("policy_rate", 0.0)),
                        inflation=float(country.get("inflation", 0.0)),
                        currency=str(country.get("currency", "")),
                        blocs=[str(item) for item in country.get("blocs", [])],
                        key_sectors=[str(item) for item in country.get("key_sectors", [])],
                        risk_flags=[str(item) for item in country.get("risk_flags", [])],
                    ),
                    trace_id=trace.trace_id,
                )
            )

        hotspots.sort(key=lambda spot: (-spot.importance, spot.name))
        return hotspots

    def _build_global_arcs(self, hotspots: list[Hotspot], factors: dict[str, float]) -> list[TransmissionArc]:
        if len(hotspots) < 2:
            return []

        candidate_nodes = sorted(hotspots, key=lambda spot: (spot.heat * 0.7 + spot.importance * 0.3), reverse=True)[:14]
        scored_pairs: list[tuple[float, Hotspot, Hotspot, dict[str, Any]]] = []
        for idx, left in enumerate(candidate_nodes):
            for right in candidate_nodes[idx + 1 :]:
                scores = self._relation_scores(left, right, factors)
                raw_score = float(scores["relation_strength"])
                scored_pairs.append((raw_score, left, right, scores))

        scored_pairs.sort(key=lambda item: item[0], reverse=True)
        selected_pairs = scored_pairs[:10]

        arcs: list[TransmissionArc] = []
        for _, left, right, scores in selected_pairs:
            dominant_channel = max(scores["channel_scores"].items(), key=lambda item: item[1])[0]
            trace = make_trace(
                summary=(
                    f"{left.name} to {right.name} relation strength {scores['relation_strength']} "
                    f"via {dominant_channel}."
                ),
                top_factors=[
                    {
                        "factor": key,
                        "contribution": value,
                        "weight": 1.0,
                        "value": value,
                    }
                    for key, value in scores["channel_scores"].items()
                ],
            )
            arcs.append(
                TransmissionArc(
                    **{
                        "from": left.id,
                        "to": right.id,
                        "label": f"{left.name} -> {right.name}",
                        "color": "#fb7185",
                        "intensity": round(scores["relation_strength"] / 100.0, 4),
                        "trace_id": trace.trace_id,
                    }
                )
            )
        return arcs

    def _relation_scores(self, left: Hotspot, right: Hotspot, factors: dict[str, float]) -> dict[str, Any]:
        shared_bloc = bool(set(left.profile.blocs) & set(right.profile.blocs))
        same_cluster = left.cluster == right.cluster

        trade_intensity = int(
            clamp(
                round(
                    (left.profile.trade_openness + right.profile.trade_openness) * 0.22
                    + (18 if shared_bloc else 0)
                    + (12 if same_cluster else 4)
                    + abs(factors.get("commodity", 0.0)) * 4
                ),
                0,
                100,
            )
        )

        financial_linkage = int(
            clamp(
                round(
                    (left.importance + right.importance) * 0.42
                    + (12 if left.profile.currency == right.profile.currency else 0)
                    + abs(factors.get("liquidity", 0.0)) * 3
                    + abs(factors.get("rates", 0.0)) * 3
                ),
                0,
                100,
            )
        )

        policy_divergence = int(
            clamp(
                round(
                    abs(left.profile.policy_rate - right.profile.policy_rate) * 4.2
                    + abs(left.profile.inflation - right.profile.inflation) * 2.1
                ),
                0,
                100,
            )
        )

        geopolitical_risk = int(
            clamp(
                round(
                    _pair_geopolitical_modifier(left.id, right.id)
                    + (15 if not shared_bloc else 3)
                    + (10 if not same_cluster else 4)
                    + abs(factors.get("geopolitics", 0.0)) * 4
                ),
                0,
                100,
            )
        )

        channel_scores = {
            "trade": int(clamp(round(trade_intensity * 0.9 + abs(factors.get("fx", 0.0)) * 3), 0, 100)),
            "financial": int(clamp(round(financial_linkage * 0.9 + abs(factors.get("rates", 0.0)) * 3), 0, 100)),
            "policy": int(clamp(round((100 - policy_divergence) * 0.9 + abs(factors.get("policy", 0.0)) * 4), 0, 100)),
            "geopolitical": int(clamp(round((100 - geopolitical_risk) * 0.6 + abs(factors.get("geopolitics", 0.0)) * 7), 0, 100)),
        }

        relation_strength = int(
            clamp(
                round(
                    trade_intensity * 0.34
                    + financial_linkage * 0.28
                    + (100 - policy_divergence) * 0.2
                    + (100 - geopolitical_risk) * 0.18
                ),
                0,
                100,
            )
        )

        relation_quality_score = int(
            clamp(
                round(
                    (100 - geopolitical_risk) * 0.74
                    + (100 - policy_divergence) * 0.22
                    + (8 if shared_bloc else 0)
                    + (4 if same_cluster else 0)
                ),
                0,
                100,
            )
        )
        relation_quality_label = _relation_quality_label(relation_quality_score)

        estimated_spillover_bps = round((left.heat * 0.55 + right.heat * 0.45) * (relation_strength / 100.0) * 0.22, 2)
        return {
            "trade_intensity": trade_intensity,
            "financial_linkage": financial_linkage,
            "policy_divergence": policy_divergence,
            "geopolitical_risk": geopolitical_risk,
            "relation_strength": relation_strength,
            "relation_quality_score": relation_quality_score,
            "relation_quality_label": relation_quality_label,
            "channel_scores": channel_scores,
            "estimated_spillover_bps": estimated_spillover_bps,
        }


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _dot(weights: dict[str, float], values: dict[str, float]) -> float:
    return sum(float(weights.get(k, 0.0)) * float(values.get(k, 0.0)) for k in weights)


def _compute_stability(current: dict[str, float], previous: dict[str, float]) -> float:
    if not current:
        return 0.0
    if not previous:
        return 0.8

    keys = sorted(set(current) | set(previous))
    if not keys:
        return 1.0

    delta = sum(abs(current.get(k, 0.0) - previous.get(k, 0.0)) for k in keys) / len(keys)
    return float(clamp(1.0 - (delta / 4.0), 0.0, 1.0))


def _infer_driver_from_factors(factors: dict[str, float]) -> str:
    if not factors:
        return "Interest Rates"

    mapping = {
        "rates": "Interest Rates",
        "policy": "Interest Rates",
        "commodity": "Oil Price",
        "fx": "Currency",
        "technology": "Technology",
        "geopolitics": "Geopolitical",
    }

    top_factor = max(factors.items(), key=lambda item: abs(item[1]))[0]
    return mapping.get(top_factor, "Trade Policy")


def _build_risks(top_factors: list[str], risk_templates: dict[str, list[str]]) -> list[str]:
    risks: list[str] = []
    for factor in top_factors:
        options = risk_templates.get(factor, [])
        if options:
            risks.append(options[0])
            if len(options) > 1:
                risks.append(options[1])
        if len(risks) >= 3:
            break

    while len(risks) < 3:
        risks.append("Cross-asset repricing risk")

    return risks[:3]


def _country_bias(country: dict[str, Any]) -> dict[str, float]:
    sectors = {str(item).lower() for item in country.get("key_sectors", [])}
    cluster = str(country.get("cluster", "em"))

    base: dict[str, float] = {
        "growth": 0.3,
        "policy": 0.25,
        "fx": 0.2,
        "volatility": 0.2,
        "contagion": 0.2,
        "commodity": 0.2,
        "technology": 0.2,
        "geopolitics": 0.2,
        "rates": 0.2,
        "inflation": 0.2,
        "liquidity": 0.2,
    }

    if "technology" in sectors or "semiconductors" in sectors:
        base["technology"] += 0.55
        base["growth"] += 0.25
    if "energy" in sectors or "oil" in sectors or "lng" in sectors:
        base["commodity"] += 0.6
        base["inflation"] += 0.25
    if "financials" in sectors or "finance" in sectors:
        base["liquidity"] += 0.35
        base["rates"] += 0.22
    if "manufacturing" in sectors or "industrial exports" in sectors:
        base["growth"] += 0.35
        base["fx"] += 0.2

    if cluster in {"middleeast"}:
        base["geopolitics"] += 0.45
    if cluster in {"japan", "europe"}:
        base["rates"] += 0.2
        base["policy"] += 0.2
    if cluster in {"em", "china"}:
        base["contagion"] += 0.35
        base["fx"] += 0.25

    return base


def _country_narratives(country: dict[str, Any], top_factors: list[str]) -> list[str]:
    narratives = [
        f"{country['name']}: {top_factors[0].capitalize()}-led repricing",
        f"{country['name']}: {top_factors[1].capitalize()} transmission watch",
        f"{country['name']}: Cross-asset spillover monitoring",
    ]
    return narratives[:3]


def _pair_geopolitical_modifier(left_id: str, right_id: str) -> int:
    key = tuple(sorted([left_id, right_id]))
    pair_modifiers: dict[tuple[str, str], int] = {
        ("cn", "us"): 34,
        ("cn", "jp"): 22,
        ("in", "pk"): 32,
        ("ru", "ua"): 55,
        ("il", "sa"): 22,
        ("tr", "ru"): 24,
        ("eg", "sa"): 16,
    }
    return pair_modifiers.get(key, 12)


def _relation_quality_label(score: int) -> str:
    if score >= 67:
        return "good"
    if score >= 40:
        return "mixed"
    return "bad"


def _relation_quality_color(label: str) -> str:
    normalized = str(label).strip().lower()
    if normalized == "good":
        return "#22c55e"
    if normalized == "bad":
        return "#f59e0b"
    return "#38bdf8"


def _country_slug(name: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(name))
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")
