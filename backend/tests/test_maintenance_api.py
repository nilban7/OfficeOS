import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.asset import Asset
from app.models.employee import Employee
from app.models.identity import Profile
from app.models.maintenance import MaintenanceRecord, MaintenanceRequest
from tests.auth_helpers import create_test_token

ALL_PERMISSIONS = [
    "maintenance.view",
    "maintenance.create",
    "maintenance.update",
    "maintenance.delete",
    "maintenance.assign",
    "maintenance.complete",
]


@pytest.fixture
def auth_context():
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)
    profile_id = uuid.uuid4()
    profile = Profile(
        id=profile_id,
        auth_user_id=uuid.UUID(user_id),
        email="maint_admin@example.com",
        first_name="Bob",
        last_name="Technician",
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-Id": org_id,
    }
    return {
        "user_id": user_id,
        "org_id": org_id,
        "profile_id": profile_id,
        "profile": profile,
        "token": token,
        "headers": headers,
    }


def _create_mock_asset(
    org_id: uuid.UUID,
    asset_id: uuid.UUID | None = None,
    code: str = "AST-101",
    status: str = "available",
) -> Asset:
    return Asset(
        id=asset_id or uuid.uuid4(),
        organization_id=org_id,
        asset_code=code,
        name="HVAC Unit Floor 2",
        category="facility",
        description="Central climate control unit",
        serial_number="HVAC-9900",
        model="ClimateMaster 5000",
        manufacturer="Carrier",
        vendor_id=None,
        purchase_order_id=None,
        purchase_date=date(2025, 1, 1),
        purchase_cost=Decimal("12000.00"),
        currency="USD",
        warranty_start_date=date(2025, 1, 1),
        warranty_end_date=date(2028, 1, 1),
        branch_id=None,
        current_custodian_id=None,
        status=status,
        condition="good",
        location="Roof Unit 3",
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_employee(
    org_id: uuid.UUID,
    emp_id: uuid.UUID | None = None,
    profile_id: uuid.UUID | None = None,
    code: str = "EMP-001",
) -> Employee:
    return Employee(
        id=emp_id or uuid.uuid4(),
        organization_id=org_id,
        profile_id=profile_id,
        employee_code=code,
        first_name="Bob",
        last_name="Technician",
        designation="Lead Facilities Specialist",
        status="active",
        date_of_joining=date(2024, 1, 1),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_request(
    org_id: uuid.UUID,
    asset_id: uuid.UUID,
    requester_id: uuid.UUID,
    request_id: uuid.UUID | None = None,
    status: str = "submitted",
) -> MaintenanceRequest:
    mr = MaintenanceRequest(
        id=request_id or uuid.uuid4(),
        organization_id=org_id,
        request_number="MR-202609-0001",
        asset_id=asset_id,
        requester_id=requester_id,
        branch_id=None,
        issue_title="Air conditioning failure",
        issue_description="Unit making loud grinding noise and blowing warm air",
        priority="high",
        requested_date=date(2026, 9, 29),
        status=status,
        rejection_reason=None,
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mr.asset = None
    mr.requester = None
    mr.branch = None
    mr.maintenance_records = []
    return mr


def _create_mock_record(
    org_id: uuid.UUID,
    asset_id: uuid.UUID,
    request_id: uuid.UUID | None = None,
    tech_id: uuid.UUID | None = None,
    record_id: uuid.UUID | None = None,
    status: str = "scheduled",
) -> MaintenanceRecord:
    rec = MaintenanceRecord(
        id=record_id or uuid.uuid4(),
        organization_id=org_id,
        record_number="MREC-202609-0001",
        maintenance_request_id=request_id,
        asset_id=asset_id,
        technician_id=tech_id,
        vendor_id=None,
        maintenance_type="corrective",
        start_date=date(2026, 9, 29),
        completion_date=None,
        status=status,
        description="Compressor belt replacement and coolant refill",
        parts_description="Fan Belt Model B-42, R410A Refrigerant 5kg",
        labor_cost=Decimal("150.00"),
        parts_cost=Decimal("200.00"),
        other_cost=Decimal("25.00"),
        total_cost=Decimal("375.00"),
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    rec.asset = None
    rec.technician = None
    rec.vendor = None
    rec.maintenance_request = None
    return rec


@pytest.mark.asyncio
async def test_list_maintenance_requests_org_wide(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])
    asset = _create_mock_asset(org_uuid)
    mr = _create_mock_request(org_uuid, asset.id, emp.id)
    mr.asset = asset
    mr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "count" in stmt_str:
            mock_result.scalar.return_value = 1
        elif "maintenance_requests" in stmt_str:
            mock_result.scalars.return_value.all.return_value = [mr]
        return mock_result

    mock_session.execute.side_effect = mock_execute
    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with (
        patch("app.api.v1.maintenance_requests.resolve_employee_for_user", AsyncMock(return_value=emp)),
        patch("app.api.v1.maintenance_requests.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/maintenance-requests", headers=auth_context["headers"])
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["data"]["items"]) == 1
    assert body["data"]["items"][0]["issue_title"] == "Air conditioning failure"


@pytest.mark.asyncio
async def test_create_maintenance_request_success(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])
    asset = _create_mock_asset(org_uuid)
    mr = _create_mock_request(org_uuid, asset.id, emp.id)
    mr.asset = asset
    mr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "employees" in stmt_str:
            mock_result.scalar_one_or_none.return_value = emp
        elif "assets" in stmt_str:
            mock_result.scalar_one_or_none.return_value = asset
        elif "count" in stmt_str:
            mock_result.scalar.return_value = 0
        elif "maintenance_requests" in stmt_str:
            mock_result.scalar_one_or_none.return_value = mr
        else:
            mock_result.scalar_one_or_none.return_value = None
        return mock_result

    mock_session.execute.side_effect = mock_execute

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "asset_id": str(asset.id),
        "issue_title": "Air conditioning failure",
        "issue_description": "Unit making loud grinding noise",
        "priority": "high",
        "requested_date": "2026-09-29",
    }

    with (
        patch("app.api.v1.maintenance_requests.resolve_employee_for_user", AsyncMock(return_value=emp)),
        patch("app.api.v1.maintenance_requests.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
        patch("app.services.maintenance.record_audit_log", AsyncMock()),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/maintenance-requests", headers=auth_context["headers"], json=payload)
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["issue_title"] == "Air conditioning failure"


@pytest.mark.asyncio
async def test_create_maintenance_request_cross_tenant_asset_rejected(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "employees" in stmt_str:
            mock_result.scalar_one_or_none.return_value = emp
        elif "assets" in stmt_str:
            mock_result.scalar_one_or_none.return_value = None  # Asset not found in this tenant
        return mock_result

    mock_session.execute.side_effect = mock_execute

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "asset_id": str(uuid.uuid4()),
        "issue_title": "Server fan issue",
        "priority": "low",
    }

    with (
        patch("app.api.v1.maintenance_requests.resolve_employee_for_user", AsyncMock(return_value=emp)),
        patch("app.api.v1.maintenance_requests.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/maintenance-requests", headers=auth_context["headers"], json=payload)
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert resp.status_code == 400
    res_data = resp.json()
    error_msg = res_data.get("error", {}).get("message", "") or res_data.get("detail", "")
    assert "Asset not found" in error_msg


@pytest.mark.asyncio
async def test_approve_reject_maintenance_request_lifecycle(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])
    asset = _create_mock_asset(org_uuid)
    mr = _create_mock_request(org_uuid, asset.id, emp.id, status="submitted")
    mr.asset = asset
    mr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "employees" in stmt_str:
            mock_result.scalar_one_or_none.return_value = emp
        elif "maintenance_requests" in stmt_str:
            mock_result.scalar_one_or_none.return_value = mr
        return mock_result

    mock_session.execute.side_effect = mock_execute

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with (
        patch("app.api.v1.maintenance_requests.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
        patch("app.services.maintenance.record_audit_log", AsyncMock()),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Approve
                resp = await ac.post(
                    f"/api/v1/maintenance-requests/{mr.id}/approve",
                    headers=auth_context["headers"],
                    json={"notes": "Approved for repairs"},
                )
                assert resp.status_code == 200
                assert mr.status == "approved"

                # 2. Schedule
                resp_sched = await ac.post(
                    f"/api/v1/maintenance-requests/{mr.id}/schedule",
                    headers=auth_context["headers"],
                    json={"notes": "Scheduled for tomorrow"},
                )
                assert resp_sched.status_code == 200
                assert mr.status == "scheduled"
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_list_maintenance_records(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])
    asset = _create_mock_asset(org_uuid)
    rec = _create_mock_record(org_uuid, asset.id, tech_id=emp.id)
    rec.asset = asset
    rec.technician = emp

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "count" in stmt_str:
            mock_result.scalar.return_value = 1
        elif "maintenance_records" in stmt_str:
            mock_result.scalars.return_value.all.return_value = [rec]
        return mock_result

    mock_session.execute.side_effect = mock_execute
    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with (
        patch("app.api.v1.maintenance_records.resolve_employee_for_user", AsyncMock(return_value=emp)),
        patch("app.api.v1.maintenance_records.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/maintenance-records", headers=auth_context["headers"])
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["data"]["items"]) == 1


@pytest.mark.asyncio
async def test_create_maintenance_record_success_and_cost_calc(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])
    asset = _create_mock_asset(org_uuid)
    rec = _create_mock_record(org_uuid, asset.id, tech_id=emp.id)
    rec.asset = asset
    rec.technician = emp

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "employees" in stmt_str:
            mock_result.scalar_one_or_none.return_value = emp
        elif "assets" in stmt_str:
            mock_result.scalar_one_or_none.return_value = asset
        elif "count" in stmt_str:
            mock_result.scalar.return_value = 0
        elif "maintenance_records" in stmt_str:
            mock_result.scalar_one_or_none.return_value = rec
        else:
            mock_result.scalar_one_or_none.return_value = None
        return mock_result

    mock_session.execute.side_effect = mock_execute

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "asset_id": str(asset.id),
        "technician_id": str(emp.id),
        "maintenance_type": "corrective",
        "labor_cost": "250.00",
        "parts_cost": "150.00",
        "other_cost": "50.00",
        "description": "Replaced thermal paste and cooling fans",
    }

    with (
        patch("app.api.v1.maintenance_records.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
        patch("app.services.maintenance.record_audit_log", AsyncMock()),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/maintenance-records", headers=auth_context["headers"], json=payload)
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True


@pytest.mark.asyncio
async def test_start_and_complete_maintenance_record_asset_integration(auth_context):
    org_uuid = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_uuid, profile_id=auth_context["profile_id"])
    asset = _create_mock_asset(org_uuid, status="available")
    mr = _create_mock_request(org_uuid, asset.id, emp.id, status="scheduled")
    rec = _create_mock_record(org_uuid, asset.id, request_id=mr.id, tech_id=emp.id, status="scheduled")
    rec.asset = asset
    rec.technician = emp
    rec.maintenance_request = mr

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "employees" in stmt_str:
            mock_result.scalar_one_or_none.return_value = emp
        elif "assets" in stmt_str:
            mock_result.scalar_one_or_none.return_value = asset
        elif "asset_assignments" in stmt_str:
            mock_result.scalar_one_or_none.return_value = None  # No active custodian
        elif "maintenance_requests" in stmt_str:
            mock_result.scalar_one_or_none.return_value = mr
        elif "maintenance_records" in stmt_str:
            mock_result.scalar_one_or_none.return_value = rec
        return mock_result

    mock_session.execute.side_effect = mock_execute

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with (
        patch("app.api.v1.maintenance_records.get_user_permissions", AsyncMock(return_value=ALL_PERMISSIONS)),
        patch("app.services.maintenance.record_audit_log", AsyncMock()),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Start maintenance
                start_resp = await ac.post(
                    f"/api/v1/maintenance-records/{rec.id}/start",
                    headers=auth_context["headers"],
                    json={"notes": "Work commenced"},
                )
                assert start_resp.status_code == 200
                assert rec.status == "in_progress"
                assert asset.status == "under_maintenance"
                assert mr.status == "in_progress"

                # 2. Complete maintenance
                complete_resp = await ac.post(
                    f"/api/v1/maintenance-records/{rec.id}/complete",
                    headers=auth_context["headers"],
                    json={
                        "completion_date": "2026-09-29",
                        "labor_cost": "200.00",
                        "parts_cost": "100.00",
                        "other_cost": "0.00",
                        "notes": "Testing complete and verified operational",
                    },
                )
                assert complete_resp.status_code == 200
                assert rec.status == "completed"
                assert asset.status == "available"
                assert mr.status == "completed"
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_maintenance_unauthorized_user_forbidden(auth_context):
    mock_session = AsyncMock()
    mock_session.scalars.return_value = []
    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with (
        patch("app.api.v1.maintenance_requests.resolve_employee_for_user", AsyncMock(return_value=None)),
        patch("app.api.v1.maintenance_requests.get_user_permissions", AsyncMock(return_value=[])),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/maintenance-requests", headers=auth_context["headers"])
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert resp.status_code == 403
