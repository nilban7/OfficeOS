import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.asset import Asset, AssetAssignment
from app.models.employee import Employee
from app.models.identity import Profile
from tests.auth_helpers import create_test_token

ALL_PERMISSIONS = [
    "assets.view",
    "assets.create",
    "assets.update",
    "assets.delete",
    "assets.assign",
    "assets.return",
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
        email="asset_admin@example.com",
        first_name="Alice",
        last_name="Admin",
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
    code: str = "AST-001",
    status: str = "available",
) -> Asset:
    return Asset(
        id=asset_id or uuid.uuid4(),
        organization_id=org_id,
        asset_code=code,
        name="MacBook Pro 16",
        category="it_equipment",
        description="M3 Max Developer Laptop",
        serial_number="SN-12345678",
        model="MacBookPro18,1",
        manufacturer="Apple",
        vendor_id=None,
        purchase_order_id=None,
        purchase_date=date(2026, 1, 15),
        purchase_cost=Decimal("3499.00"),
        currency="USD",
        warranty_start_date=date(2026, 1, 15),
        warranty_end_date=date(2029, 1, 15),
        branch_id=None,
        current_custodian_id=None,
        status=status,
        condition="good",
        location="Floor 3, Tech Bay",
        notes="High-spec engineering workstation",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_assignment(
    org_id: uuid.UUID,
    asset_id: uuid.UUID,
    emp_id: uuid.UUID,
    is_active: bool = True,
) -> AssetAssignment:
    return AssetAssignment(
        id=uuid.uuid4(),
        organization_id=org_id,
        asset_id=asset_id,
        employee_id=emp_id,
        branch_id=None,
        assigned_date=datetime.now(UTC).date(),
        returned_date=None if is_active else datetime.now(UTC).date(),
        assignment_notes="Assigned for project work",
        return_notes=None,
        assigned_by_id=None,
        returned_by_id=None,
        is_active=is_active,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_list_assets_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    a1 = _create_mock_asset(org_id, code="AST-001")
    a2 = _create_mock_asset(org_id, code="AST-002")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.return_value = 2  # count_query

    list_res = MagicMock()
    list_res.scalars.return_value.all.return_value = [a1, a2]
    mock_session.execute.return_value = list_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/api/v1/assets", headers=auth_context["headers"])
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]["items"]) == 2


@pytest.mark.asyncio
async def test_get_asset_details_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        asset,  # get_asset query
        None,  # active assignment query
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get(f"/api/v1/assets/{asset_id}", headers=auth_context["headers"])
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["asset_code"] == "AST-001"


@pytest.mark.asyncio
async def test_create_asset_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    created_asset = _create_mock_asset(org_id, code="AST-2026-001")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        None,  # duplicate asset_code check in service
        created_asset,  # refetch after insert
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "asset_code": "AST-2026-001",
        "name": "Dell UltraSharp 32 4K Monitor",
        "category": "it_equipment",
        "purchase_cost": 799.99,
        "currency": "USD",
        "status": "available",
        "condition": "new",
    }

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.post("/api/v1/assets", headers=auth_context["headers"], json=payload)
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["asset_code"] == "AST-2026-001"


@pytest.mark.asyncio
async def test_create_asset_duplicate_code_conflict(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    existing_asset = _create_mock_asset(org_id, code="AST-2026-001")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        existing_asset,  # duplicate asset_code check returns existing!
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "asset_code": "AST-2026-001",
        "name": "Dell UltraSharp 32 4K Monitor",
        "category": "it_equipment",
    }

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.post("/api/v1/assets", headers=auth_context["headers"], json=payload)
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_update_asset_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        asset,  # get asset for update
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "name": "MacBook Pro 16 (Updated)",
        "condition": "fair",
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.patch(
                f"/api/v1/assets/{asset_id}", headers=auth_context["headers"], json=payload
            )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert asset.name == "MacBook Pro 16 (Updated)"
    assert asset.condition == "fair"


@pytest.mark.asyncio
async def test_delete_asset_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id, status="available")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        asset,  # get asset
        None,  # active assignment check
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.delete(
                f"/api/v1/assets/{asset_id}", headers=auth_context["headers"]
            )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


@pytest.mark.asyncio
async def test_delete_asset_assigned_error(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id, status="assigned")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        asset,  # get asset
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.delete(
                f"/api/v1/assets/{asset_id}", headers=auth_context["headers"]
            )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_assign_asset_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id, status="available")
    emp = Employee(
        id=emp_id,
        organization_id=org_id,
        employee_code="EMP-001",
        first_name="Bob",
        last_name="Engineer",
        designation="Software Engineer",
        status="active",
        date_of_joining=date(2025, 1, 1),
    )

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    assignment = _create_mock_assignment(org_id, asset_id, emp_id)
    mock_session.scalar.side_effect = [
        asset,  # get asset
        emp,  # validate employee exists
        None,  # active assignment check
        assignment,  # refetch assignment
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "employee_id": str(emp_id),
        "assigned_date": str(datetime.now(UTC).date()),
        "assignment_notes": "Primary work laptop",
    }

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.post(
                    f"/api/v1/assets/{asset_id}/assign",
                    headers=auth_context["headers"],
                    json=payload,
                )
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert asset.status == "assigned"
    assert asset.current_custodian_id == emp_id


@pytest.mark.asyncio
async def test_return_asset_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id, status="assigned")
    asset.current_custodian_id = emp_id
    active_assignment = _create_mock_assignment(org_id, asset_id, emp_id, is_active=True)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.scalar.side_effect = [
        asset,  # get asset
        active_assignment,  # active assignment query
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "returned_date": str(datetime.now(UTC).date()),
        "return_notes": "Returned upon project completion",
        "condition": "good",
        "status": "available",
    }

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.post(
                    f"/api/v1/assets/{asset_id}/return",
                    headers=auth_context["headers"],
                    json=payload,
                )
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert active_assignment.is_active is False
    assert asset.status == "available"
    assert asset.current_custodian_id is None


@pytest.mark.asyncio
async def test_list_asset_assignments(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    asset_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    asset = _create_mock_asset(org_id, asset_id=asset_id)
    a1 = _create_mock_assignment(org_id, asset_id, emp_id, is_active=False)
    a2 = _create_mock_assignment(org_id, asset_id, emp_id, is_active=True)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    list_res = MagicMock()
    list_res.scalars.return_value.all.return_value = [a2, a1]

    mock_session.scalar.side_effect = [
        asset,  # get asset in service
    ]
    mock_session.execute.return_value = list_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    with patch("app.api.v1.assets.resolve_employee_for_user", new_callable=AsyncMock) as mock_res:
        mock_res.return_value = None
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get(
                    f"/api/v1/assets/{asset_id}/assignments",
                    headers=auth_context["headers"],
                )
        finally:
            app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]["items"]) == 2
