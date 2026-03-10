from pydantic import BaseModel, Field

from app.schemas.common import ConfidenceTrace, ExplanationTrace, TimestampedResponse


class ScenarioOptionsResponse(BaseModel):
    drivers: list[str]
    events: list[str]
    regions: list[str]
    horizons: list[str]


class ScenarioRunRequest(BaseModel):
    driver: str
    event: str
    region: str
    severity: int = Field(..., ge=10, le=100)
    horizon: str
    scenario_prompt: str | None = Field(default=None, max_length=2000)


class ScenarioGraphNode(BaseModel):
    id: str
    label: str
    x: float
    y: float
    color: str
    intensity: float = Field(..., ge=0.0, le=1.0)
    activation_step: int = Field(..., ge=0)


class ScenarioGraphEdge(BaseModel):
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    weight: float = Field(..., ge=0.0)
    flow: float = Field(..., ge=0.0)
    activation_step: int = Field(..., ge=0)

    model_config = {"populate_by_name": True}


class ScenarioGraph(BaseModel):
    nodes: list[ScenarioGraphNode]
    edges: list[ScenarioGraphEdge]


class ScenarioAssetImpact(BaseModel):
    asset: str
    impact: float
    unit: str
    severity: str


class ScenarioExecutionLog(BaseModel):
    step: int = Field(..., ge=1)
    stage: str
    message: str
    details: dict[str, float | int | str] = Field(default_factory=dict)


class ScenarioRunResponse(TimestampedResponse):
    config: ScenarioRunRequest
    graph: ScenarioGraph
    impacts: list[ScenarioAssetImpact]
    summary: str
    confidence: ConfidenceTrace
    explanation: ExplanationTrace
    execution_trace: list[ScenarioExecutionLog] = Field(default_factory=list)
