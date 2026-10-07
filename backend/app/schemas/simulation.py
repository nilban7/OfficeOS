from typing import Any

from pydantic import BaseModel, Field


class SimulationRunRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1000)
    category: str = Field(default="workforce")
    parameters: dict[str, Any] | None = None


class SimulationMetric(BaseModel):
    label: str
    current_value: str
    projected_value: str
    delta: str
    unit: str = ""


class SimulationTimelineEvent(BaseModel):
    period: str
    title: str
    impact: str


class SimulationScenario(BaseModel):
    scenario_id: str
    name: str
    description: str
    cost: str
    expected_value: str
    roi_range: str
    risk_level: str  # "Low" | "Medium" | "High"
    is_recommended: bool = False
    timeline: list[SimulationTimelineEvent] = []


class SimulationRunResponse(BaseModel):
    title: str
    summary: str
    category: str
    confidence_score: int
    assumptions: list[str]
    baseline_metrics: list[SimulationMetric]
    scenarios: list[SimulationScenario]
    recommendation: str
    narrative: str


class SimulationPreset(BaseModel):
    id: str
    category: str
    title: str
    description: str
    prompt: str
    parameters: dict[str, Any] = {}
