from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from app.data.repository import DataRepository
from app.engines.confidence_engine import compute_confidence
from app.engines.explainer import make_trace
from app.engines.world_pulse_engine import FactorState, WorldPulseEngine
from app.schemas.historical import (
    HistoricalAnaloguesResponse,
    HistoricalConnection,
    HistoricalRegime,
)


class AnalogueEngine:
    def __init__(self, repository: DataRepository, world_pulse_engine: WorldPulseEngine) -> None:
        self.repository = repository
        self.world_pulse_engine = world_pulse_engine
        self.regimes_payload = repository.curated.historical_regimes()
        self.risk_weights = repository.curated.risk_weights()["analogue_feature_weights"]
        self.templates = repository.curated.explanation_templates()

    async def get_analogues(
        self,
        k: int | None = None,
        *,
        factor_state: FactorState | None = None,
    ) -> HistoricalAnaloguesResponse:
        factor_state = factor_state or await self.world_pulse_engine.compute_factor_state()
        current_factors = factor_state.factors

        features = list(self.risk_weights.keys())
        weight_vec = np.array([self.risk_weights[f] for f in features], dtype=float)
        current_vec = np.array([current_factors.get(f, 0.0) for f in features], dtype=float)

        regimes: list[HistoricalRegime] = []
        similarity_rows: list[tuple[str, int]] = []

        for regime in self.regimes_payload["regimes"]:
            regime_vec = np.array([regime["feature_vector"].get(f, 0.0) for f in features], dtype=float)
            similarity = _weighted_cosine_similarity(current_vec, regime_vec, weight_vec)
            similarity_score = int(round(((similarity + 1.0) / 2.0) * 100.0))

            factor_contribs = []
            for idx, factor in enumerate(features):
                contrib = float(weight_vec[idx] * current_vec[idx] * regime_vec[idx])
                factor_contribs.append((factor, contrib, current_vec[idx]))
            factor_contribs.sort(key=lambda item: abs(item[1]), reverse=True)

            trace = make_trace(
                summary=(
                    f"Similarity to {regime['label']} is {similarity_score}% based on "
                    f"{factor_contribs[0][0]} and {factor_contribs[1][0]} overlap."
                ),
                top_factors=[
                    {
                        "factor": factor,
                        "contribution": contribution,
                        "weight": float(self.risk_weights.get(factor, 0.0)),
                        "value": value,
                    }
                    for factor, contribution, value in factor_contribs[:4]
                ],
            )

            regimes.append(
                HistoricalRegime(
                    id=regime["id"],
                    year=int(regime["year"]),
                    label=regime["label"],
                    x=float(regime["x"]),
                    y=float(regime["y"]),
                    color=regime["color"],
                    size=float(regime["size"]),
                    description=regime["description"],
                    drivers=list(regime["drivers"]),
                    assets=regime["assets"],
                    similarity=similarity_score,
                    trace_id=trace.trace_id,
                )
            )
            similarity_rows.append((regime["label"], similarity_score))

        if k is not None and k > 0:
            top_ids = {
                r.id
                for r in sorted(regimes, key=lambda item: item.similarity, reverse=True)[: min(k, len(regimes))]
            }
            regimes = [regime for regime in regimes if regime.id in top_ids]

        regimes.sort(key=lambda item: item.year)

        connections = [
            HistoricalConnection(**{"from": conn["from"], "to": conn["to"]})
            for conn in self.regimes_payload["connections"]
            if not k
            or conn["from"] in {reg.id for reg in regimes}
            or conn["to"] in {reg.id for reg in regimes}
        ]

        similarity_rows.sort(key=lambda item: item[1], reverse=True)
        top_label, top_score = similarity_rows[0] if similarity_rows else ("N/A", 0)

        explanation = make_trace(
            summary=self.templates["historical"].format(
                analogue=top_label,
                similarity=top_score,
                factor_a="policy",
                factor_b="contagion",
            ),
            top_factors=[
                {
                    "factor": row[0],
                    "contribution": float(row[1]),
                    "weight": 1.0,
                    "value": float(row[1]),
                }
                for row in similarity_rows[:3]
            ],
        )

        confidence = compute_confidence(
            freshness=factor_state.freshness,
            coverage=factor_state.coverage,
            stability=factor_state.stability,
        )

        return HistoricalAnaloguesResponse(
            as_of=datetime.now(tz=timezone.utc),
            regimes=regimes,
            connections=connections,
            confidence=confidence,
            explanation=explanation,
        )


def _weighted_cosine_similarity(a: np.ndarray, b: np.ndarray, w: np.ndarray) -> float:
    wa = a * w
    wb = b * w
    denominator = (np.linalg.norm(wa) * np.linalg.norm(wb))
    if denominator == 0:
        return 0.0
    return float(np.dot(wa, wb) / denominator)
