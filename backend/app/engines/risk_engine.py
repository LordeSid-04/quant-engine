from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from app.data.repository import DataRepository
from app.engines.confidence_engine import compute_confidence
from app.engines.decay import clamp
from app.engines.explainer import make_trace
from app.engines.world_pulse_engine import FactorState, WorldPulseEngine
from app.schemas.risk import RiskCategory, RiskRadarResponse, RiskSummaryCard


class RiskEngine:
    def __init__(self, repository: DataRepository, world_pulse_engine: WorldPulseEngine) -> None:
        self.repository = repository
        self.world_pulse_engine = world_pulse_engine
        self.risk_config = repository.curated.risk_weights()
        self.templates = repository.curated.explanation_templates()

    async def get_risk_radar(self, *, factor_state: FactorState | None = None) -> RiskRadarResponse:
        factor_state = factor_state or await self.world_pulse_engine.compute_factor_state()
        factors = factor_state.factors

        categories: list[RiskCategory] = []
        category_scores: dict[str, int] = {}

        for category_id, cfg in self.risk_config["category_weights"].items():
            weighted = _dot(cfg["weights"], factors)
            score = int(clamp(round(50 + weighted * 10.5), 0, 100))
            category_scores[category_id] = score

            top_factor_names = sorted(
                cfg["weights"].keys(),
                key=lambda key: abs(cfg["weights"][key] * factors.get(key, 0.0)),
                reverse=True,
            )
            top_factor_names = top_factor_names[:2]
            description = (
                f"{cfg['label']} is driven by {top_factor_names[0]} and {top_factor_names[1]} "
                f"signals in the latest cross-asset state."
            )
            trace = make_trace(
                summary=description,
                top_factors=[
                    {
                        "factor": factor,
                        "contribution": cfg["weights"][factor] * factors.get(factor, 0.0),
                        "weight": cfg["weights"][factor],
                        "value": factors.get(factor, 0.0),
                    }
                    for factor in top_factor_names
                ],
            )

            categories.append(
                RiskCategory(
                    id=category_id,
                    label=cfg["label"],
                    score=score,
                    color=cfg["color"],
                    angle=int(cfg["angle"]),
                    description=description,
                    trace_id=trace.trace_id,
                )
            )

        cards = self._build_summary_cards(category_scores)

        previous = self.repository.get_latest_risk_snapshot() or {}
        previous_cards = previous.get("summary_cards", {}) if isinstance(previous, dict) else {}

        card_objects: list[RiskSummaryCard] = []
        for card in cards:
            previous_value = int(previous_cards.get(card["label"], card["value"]))
            delta = card["value"] - previous_value
            if delta > 1:
                trend = "up"
            elif delta < -1:
                trend = "down"
            else:
                trend = "flat"

            change = f"{delta:+d}" if delta else "+0"
            trace = make_trace(
                summary=f"{card['label']} moved by {change} to {card['value']}.",
                top_factors=[
                    {
                        "factor": card["label"],
                        "contribution": delta,
                        "weight": 1.0,
                        "value": card["value"],
                    }
                ],
            )
            card_objects.append(
                RiskSummaryCard(
                    label=card["label"],
                    value=card["value"],
                    change=change,
                    trend=trend,
                    color=card["color"],
                    trace_id=trace.trace_id,
                )
            )

        dominant = sorted(categories, key=lambda c: c.score, reverse=True)
        if len(dominant) < 2:
            dominant = dominant + dominant

        assessment = (
            f"Top risk concentration sits in {dominant[0].label} ({dominant[0].score}) "
            f"and {dominant[1].label} ({dominant[1].score}), with active spillover into cross-asset volatility."
        )

        explanation = make_trace(
            summary=self.templates["risk"].format(
                category_a=dominant[0].label,
                score_a=dominant[0].score,
                category_b=dominant[1].label,
                score_b=dominant[1].score,
            ),
            top_factors=[
                {
                    "factor": category.id,
                    "contribution": category.score,
                    "weight": self.risk_config["overall_weights"].get(category.id, 0.0),
                    "value": category.score,
                }
                for category in dominant[:4]
            ],
        )

        confidence = compute_confidence(
            freshness=factor_state.freshness,
            coverage=factor_state.coverage,
            stability=factor_state.stability,
        )

        self.repository.save_risk_snapshot(
            {
                "as_of": datetime.now(tz=timezone.utc).isoformat(),
                "summary_cards": {card.label: card.value for card in card_objects},
                "categories": {category.id: category.score for category in categories},
            }
        )

        return RiskRadarResponse(
            as_of=datetime.now(tz=timezone.utc),
            summary_cards=card_objects,
            categories=categories,
            assessment_summary=assessment,
            confidence=confidence,
            explanation=explanation,
        )

    def _build_summary_cards(self, category_scores: dict[str, int]) -> list[dict[str, str | int]]:
        weighted_overall = 0.0
        for key, weight in self.risk_config["overall_weights"].items():
            weighted_overall += float(weight) * float(category_scores.get(key, 50))

        volatility = float(category_scores.get("volatility", 50))
        contagion = float(category_scores.get("contagion", 50))
        liquidity = float(category_scores.get("liquidity", 50))

        systemic_stress = int(clamp(round((0.45 * contagion + 0.35 * volatility + 0.2 * (100 - liquidity))), 0, 100))
        narrative_divergence = int(clamp(round(np.std(list(category_scores.values())) * 2.2 + 35), 0, 100))
        tail_risk = int(clamp(round(volatility * 0.6 + contagion * 0.35 + (100 - liquidity) * 0.25), 0, 100))

        return [
            {
                "label": "Overall Risk Index",
                "value": int(clamp(round(weighted_overall), 0, 100)),
                "color": "#f97316",
            },
            {
                "label": "Systemic Stress",
                "value": systemic_stress,
                "color": "#22d3ee",
            },
            {
                "label": "Narrative Divergence",
                "value": narrative_divergence,
                "color": "#a78bfa",
            },
            {
                "label": "Tail Risk Premium",
                "value": tail_risk,
                "color": "#fbbf24",
            },
        ]


def _dot(weights: dict[str, float], values: dict[str, float]) -> float:
    return float(sum(float(weights.get(k, 0.0)) * float(values.get(k, 0.0)) for k in weights))
