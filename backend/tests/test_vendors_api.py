import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.identity import Profile
from app.models.procurement import Vendor
from tests.auth_helpers import create_test_token

ALL_PERMISSIONS = [
    "procurement.view",
    "procurement.create",
    "procurement.update",
    "procurement.delete",
    "procurement.approve",
    "purchase_orders.view",
    "purchase_orders.manage",
    "vendors.view",
    "vendors.manage",
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
        email="vendor_admin@example.com",
        first_name="Jane",
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


def _create_mock_vendor(
    org_id: uuid.UUID, vendor_id: uuid.UUID | None = None, code: str = "VND-001"
) -> Vendor:
    return Vendor(
        id=vendor_id or uuid.uuid4(),
        organization_id=org_id,
        vendor_code=code,
        name="Global Cloud Solutions",
        contact_person="Alice Smith",
        email="alice@globalcloud.com",
        phone="+1-555-0199",
        address="500 Cloud Way, Seattle, WA",
        tax_id="US-99887766",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_list_vendors(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    v1 = _create_mock_vendor(org_id, code="VND-001")
    v2 = _create_mock_vendor(org_id, code="VND-002")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    count_res = MagicMock()
    count_res.scalar.return_value = 2

    list_res = MagicMock()
    list_res.scalars.return_value.all.return_value = [v1, v2]

    mock_session.execute.side_effect = [count_res, list_res]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/vendors", headers=auth_context["headers"])
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]["items"]) == 2
    assert data["data"]["items"][0]["vendor_code"] == "VND-001"


@pytest.mark.asyncio
async def test_create_vendor_success(auth_context):
    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    # Duplicate check query returns None
    dup_res = MagicMock()
    dup_res.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = dup_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "vendor_code": "VND-ACME",
        "name": "Acme Supplies Ltd",
        "contact_person": "Bob Acme",
        "email": "contact@acme.com",
        "phone": "+1-555-0100",
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/vendors",
                json=payload,
                headers=auth_context["headers"],
            )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["vendor_code"] == "VND-ACME"
    assert data["data"]["name"] == "Acme Supplies Ltd"


@pytest.mark.asyncio
async def test_create_vendor_duplicate_code_conflict(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    existing = _create_mock_vendor(org_id, code="VND-EXISTING")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    dup_res = MagicMock()
    dup_res.scalar_one_or_none.return_value = existing
    mock_session.execute.return_value = dup_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "vendor_code": "VND-EXISTING",
        "name": "Duplicate Vendor Name",
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/vendors",
                json=payload,
                headers=auth_context["headers"],
            )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 409
    assert "already exists in this organization" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_update_vendor_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    vendor = _create_mock_vendor(org_id)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = vendor
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "contact_person": "New Contact Name",
        "is_active": False,
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.patch(
                f"/api/v1/vendors/{vendor.id}",
                json=payload,
                headers=auth_context["headers"],
            )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)

    assert response.status_code == 200
    assert vendor.contact_person == "New Contact Name"
    assert vendor.is_active is False
