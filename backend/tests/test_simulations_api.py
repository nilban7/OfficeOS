"""Unit tests for What If? Business Simulations API endpoints."""

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.schemas.simulation import (
    SimulationMetric,
    SimulationPreset,
    SimulationRunResponse,
    SimulationScenario,
    SimulationTimelineEvent,
)
from app.services.simulation import SimulationService


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="executive@example.com",
        claims={},
    )


@pytest.fixture
def org_id() -> UUID:
    return uuid4()


@pytest.fixture
def sample_response() -> SimulationRunResponse:
    return SimulationRunResponse(
        title="Workforce Simulation: Hiring 5 Interns",
        summary="Simulating hiring 5 interns for 3 months.",
        category="workforce",
        confidence_score=78,
        assumptions=["Intern stipend held constant at 15,000/month."],
        baseline_metrics=[
            SimulationMetric(
                label="Monthly Payroll",
                current_value="₹18.4L",
                projected_value="₹19.15L",
                delta="+₹0.75L/mo",
            )
        ],
        scenarios=[
            SimulationScenario(
                scenario_id="scenario_b",
                name="Scenario B — Hire 3 Interns (Optimal)",
                description="Right-size cohort.",
                cost="₹1.35L",
                expected_value="₹2.7L – ₹3.5L",
                roi_range="100% – 159%",
                risk_level="Low",
                is_recommended=True,
                timeline=[
                    SimulationTimelineEvent(
                        period="Month 1",
                        title="Integration",
                        impact="Smooth onboarding.",
                    )
                ],
            )
        ],
        recommendation="Scenario B provides the best risk-adjusted return.",
        narrative="### Executive Simulation Breakdown\n\nOptimal return.",
    )


@pytest.mark.asyncio
async def test_get_simulation_presets(mock_user: AuthenticatedUser, org_id: UUID) -> None:
    mock_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.view"])),
            patch.object(
                SimulationService,
                "get_presets",
                return_value=[
                    SimulationPreset(
                        id="hire_interns",
                        category="workforce",
                        title="Hire 5 Interns",
                        description="Simulate adding 5 interns.",
                        prompt="What if I hire 5 interns?",
                        parameters={},
                    )
                ],
            ),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                resp = await client.get(
                    "/api/v1/simulations/presets",
                    headers={"X-Organization-Id": str(org_id)},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["id"] == "hire_interns"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_run_simulation_authorized(
    mock_user: AuthenticatedUser,
    org_id: UUID,
    sample_response: SimulationRunResponse,
) -> None:
    mock_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.view"])),
            patch(
                "app.api.v1.simulations.get_user_permissions",
                new=AsyncMock(return_value=["ai.view", "ai.use"]),
            ),
            patch.object(
                SimulationService,
                "run_simulation",
                new=AsyncMock(return_value=sample_response),
            ),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                payload = {
                    "prompt": "What if I hire 5 interns for 3 months at ₹15,000/month?",
                    "category": "workforce",
                }
                resp = await client.post(
                    "/api/v1/simulations/run",
                    json=payload,
                    headers={"X-Organization-Id": str(org_id)},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["category"] == "workforce"
        assert body["data"]["confidence_score"] == 78
        assert len(body["data"]["scenarios"]) == 1
        assert body["data"]["scenarios"][0]["is_recommended"] is True
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_tenant_session, None)
