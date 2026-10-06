"""Unit tests for Automations Management API endpoints and execution engine.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.automation import Automation
from app.schemas.automation import (
    AutomationExecutionResponse,
    AutomationResponse,
)
from app.services.automation import AutomationService


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="operator@example.com",
        claims={},
    )


@pytest.fixture
def org_id() -> UUID:
    return uuid4()


@pytest.fixture
def sample_automation(org_id: UUID) -> AutomationResponse:
    return AutomationResponse(
        id=uuid4(),
        organization_id=org_id,
        name="Auto Notify on Leave Approval",
        description="Dispatches notification when employee leave request is approved",
        is_active=True,
        trigger_type="event",
        trigger_config={"event_name": "leave.approved"},
        action_type="notification",
        action_config={"title": "Leave Approved", "message": "Your leave has been approved."},
        created_by_id=uuid4(),
        last_run_at=None,
        last_run_status=None,
        next_run_at=None,
        run_count=0,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def sample_execution(sample_automation: AutomationResponse) -> AutomationExecutionResponse:
    return AutomationExecutionResponse(
        id=uuid4(),
        organization_id=sample_automation.organization_id,
        automation_id=sample_automation.id,
        triggered_by_id=uuid4(),
        trigger_source="manual",
        status="success",
        execution_payload={"test": True},
        result_summary="Dispatched in-app notification successfully.",
        error_message=None,
        duration_ms=45,
        created_at=datetime.now(UTC),
    )


# ---------------------------------------------------------------------------
# API Route Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_automations_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_automation: AutomationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.view"])),
            patch.object(AutomationService, "list_automations", new=AsyncMock(return_value=[sample_automation])),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/automations",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert len(data) == 1
            assert data[0]["name"] == "Auto Notify on Leave Approval"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_automation_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_automation: AutomationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.create"])),
            patch.object(AutomationService, "create_automation", new=AsyncMock(return_value=sample_automation)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.post(
                    "/api/v1/automations",
                    headers={"X-Organization-Id": str(org_id)},
                    json={
                        "name": "Auto Notify on Leave Approval",
                        "description": "Dispatches notification",
                        "trigger_type": "event",
                        "trigger_config": {"event_name": "leave.approved"},
                        "action_type": "notification",
                        "action_config": {"title": "Leave Approved"},
                        "is_active": True,
                    },
                )

            assert res.status_code == 201
            assert res.json()["data"]["name"] == "Auto Notify on Leave Approval"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_automation_detail(
    mock_user: AuthenticatedUser, org_id: UUID, sample_automation: AutomationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.view"])),
            patch.object(AutomationService, "get_automation", new=AsyncMock(return_value=sample_automation)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    f"/api/v1/automations/{sample_automation.id}",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            assert res.json()["data"]["id"] == str(sample_automation.id)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_automation_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_automation: AutomationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.update"])),
            patch.object(AutomationService, "update_automation", new=AsyncMock(return_value=sample_automation)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.put(
                    f"/api/v1/automations/{sample_automation.id}",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"name": "Updated Automation Name"},
                )

            assert res.status_code == 200
            assert res.json()["success"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_toggle_automation(
    mock_user: AuthenticatedUser, org_id: UUID, sample_automation: AutomationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    sample_automation.is_active = False

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.update"])),
            patch.object(AutomationService, "toggle_automation", new=AsyncMock(return_value=sample_automation)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.post(
                    f"/api/v1/automations/{sample_automation.id}/toggle",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"is_active": False},
                )

            assert res.status_code == 200
            assert res.json()["data"]["is_active"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_execute_automation_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_execution: AutomationExecutionResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.execute"])),
            patch.object(AutomationService, "execute_automation", new=AsyncMock(return_value=sample_execution)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.post(
                    f"/api/v1/automations/{sample_execution.automation_id}/execute",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"input_payload": {"test_run": True}},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["status"] == "success"
            assert data["duration_ms"] == 45
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_automation_executions(
    mock_user: AuthenticatedUser, org_id: UUID, sample_execution: AutomationExecutionResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.view"])),
            patch.object(AutomationService, "list_executions", new=AsyncMock(return_value=[sample_execution])),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    f"/api/v1/automations/{sample_execution.automation_id}/executions",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert len(data) == 1
            assert data[0]["status"] == "success"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_automation_authorized(mock_user: AuthenticatedUser, org_id: UUID):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["automations.delete"])),
            patch.object(AutomationService, "delete_automation", new=AsyncMock(return_value=None)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.delete(
                    f"/api/v1/automations/{uuid4()}",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            assert res.json()["success"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_dispatch_event_triggers_leave_approved_automation(
    org_id: UUID, sample_automation: AutomationResponse
):
    mock_session = AsyncMock()
    auto_model = Automation(
        id=sample_automation.id,
        organization_id=org_id,
        name="NOTIFY ON LEAVE APPROVAL",
        description="DISPATCHES AN ALERT WHEN LEAVE IS APPROVED",
        is_active=True,
        trigger_type="event",
        trigger_config={"event_name": "leave.approved"},
        action_type="notification",
        action_config={
            "title": "Leave Approved for {employee_name}",
            "message": "Your leave starting {start_date} has been approved.",
            "route": "/leave",
            "target_recipient": "requester",
        },
        created_by_id=uuid4(),
        run_count=0,
    )
    mock_session.scalars.return_value.all.return_value = [auto_model]
    mock_session.scalar.return_value = auto_model

    recipient_profile_id = uuid4()
    payload = {
        "event": "leave.approved",
        "employee_name": "Alice Smith",
        "recipient_id": str(recipient_profile_id),
        "start_date": "2026-10-10",
        "end_date": "2026-10-12",
        "route": "/leave",
    }

    with patch("app.services.audit.AuditLogService.record_audit_log", new=AsyncMock()):
        executions = await AutomationService.dispatch_event(
            session=mock_session,
            organization_id=org_id,
            event_name="leave.approved",
            payload=payload,
        )

    assert len(executions) == 1
    assert executions[0].status == "success"
    assert executions[0].trigger_source == "event:leave.approved"
    assert auto_model.run_count == 1
    assert auto_model.last_run_status == "success"

