import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.client import Client, ClientContact
from app.models.identity import Profile
from tests.auth_helpers import create_test_token


@pytest.fixture
def auth_context():
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)
    profile_id = uuid.uuid4()
    profile = Profile(
        id=profile_id,
        auth_user_id=uuid.UUID(user_id),
        email="admin@example.com",
        first_name="Alice",
        last_name="Smith",
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


def _create_mock_client(
    org_id: uuid.UUID,
    client_id: uuid.UUID | None = None,
    client_code: str = "CLI-001",
    name: str = "Acme Corp",
    status: str = "active",
) -> Client:
    c = Client(
        id=client_id or uuid.uuid4(),
        organization_id=org_id,
        client_code=client_code,
        name=name,
        legal_name="Acme Corporation Ltd",
        client_type="enterprise",
        email="info@acme.com",
        phone="+1234567890",
        website="https://acme.com",
        address="123 Industrial Way",
        city="Metropolis",
        state="NY",
        postal_code="10001",
        country="USA",
        tax_id="US-123456789",
        status=status,
        notes="Key account",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    c.contacts = []
    return c


# ==========================================
# Client API Tests
# ==========================================
@pytest.mark.asyncio
async def test_list_clients_empty(auth_context) -> None:
    mock_session = AsyncMock()

    # Permissions check
    mock_session.scalars.side_effect = [
        ["clients.view"],
        [],  # items
    ]
    # Count query execution
    count_mock = MagicMock()
    count_mock.scalar.return_value = 0
    mock_session.execute.return_value = count_mock

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/clients", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["items"] == []
        assert body["data"]["meta"]["total"] == 0
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_list_clients_with_data(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    client1 = _create_mock_client(org_id, client_code="CLI-001", name="Alpha Corp")
    client2 = _create_mock_client(org_id, client_code="CLI-002", name="Beta LLC")

    mock_session.scalars.side_effect = [
        ["clients.view"],
        [client1, client2],
    ]
    count_mock = MagicMock()
    count_mock.scalar.return_value = 2
    mock_session.execute.return_value = count_mock

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/clients", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]["items"]) == 2
        assert body["data"]["items"][0]["client_code"] == "CLI-001"
        assert body["data"]["items"][1]["client_code"] == "CLI-002"
        assert body["data"]["meta"]["total"] == 2
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_client_success(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    mock_session.scalars.return_value = ["clients.create"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        None,  # duplicate code check
    ]

    payload = {
        "client_code": "cli-003",  # lowercase, should be normalized to uppercase
        "name": "Stark Industries",
        "legal_name": "Stark Industries Inc.",
        "client_type": "enterprise",
        "email": "tony@stark.com",
        "phone": "+1-555-0100",
        "website": "https://stark.com",
        "address": "10880 Wilshire Blvd",
        "city": "Los Angeles",
        "state": "CA",
        "postal_code": "90024",
        "country": "USA",
        "tax_id": "TAX-9999",
        "status": "active",
        "notes": "High tech defense contractor",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/clients", headers=auth_context["headers"], json=payload)
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["client_code"] == "CLI-003"
        assert body["data"]["name"] == "Stark Industries"
        assert body["data"]["status"] == "active"
        mock_session.add.assert_called()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_client_duplicate_code_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    existing_client = _create_mock_client(org_id, client_code="CLI-001")
    mock_session.scalars.return_value = ["clients.create"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        existing_client,  # duplicate check finds existing
    ]

    payload = {
        "client_code": "CLI-001",
        "name": "Another Corp",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/clients", headers=auth_context["headers"], json=payload)
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert "already exists" in body["error"]["message"]
        assert body["error"]["code"] == "CONFLICT"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_client_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    mock_session = AsyncMock()

    c = _create_mock_client(org_id, client_id=client_id, client_code="CLI-001", name="Wayne Enterprises")
    contact = ClientContact(
        id=uuid.uuid4(),
        organization_id=org_id,
        client_id=client_id,
        name="Bruce Wayne",
        designation="CEO",
        email="bruce@wayne.com",
        phone="+1234567890",
        is_primary=True,
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    c.contacts = [contact]

    mock_session.scalars.return_value = ["clients.view"]
    mock_session.scalar.return_value = c

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/clients/{client_id}", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "Wayne Enterprises"
        assert len(body["data"]["contacts"]) == 1
        assert body["data"]["contacts"][0]["name"] == "Bruce Wayne"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_client_not_found(auth_context) -> None:
    client_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_session.scalars.return_value = ["clients.view"]
    mock_session.scalar.return_value = None

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/clients/{client_id}", headers=auth_context["headers"])
        assert res.status_code == 404
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"
        assert body["error"]["message"] == "Client not found"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_client_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    c = _create_mock_client(org_id, client_id=client_id, client_code="CLI-OLD", name="Old Name")

    mock_session.scalars.return_value = ["clients.update"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        c,  # get client
        None,  # conflict check for new code
    ]

    payload = {
        "client_code": "CLI-NEW",
        "name": "Updated Corp",
        "city": "San Francisco",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(f"/api/v1/clients/{client_id}", headers=auth_context["headers"], json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["client_code"] == "CLI-NEW"
        assert body["data"]["name"] == "Updated Corp"
        assert body["data"]["city"] == "San Francisco"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_archive_client_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    c = _create_mock_client(org_id, client_id=client_id, client_code="CLI-001", name="To Archive")

    mock_session.scalars.return_value = ["clients.delete"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        c,  # get client
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(f"/api/v1/clients/{client_id}", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["status"] == "archived"
        assert c.status == "archived"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_client_rbac_enforcement_forbidden(auth_context) -> None:
    mock_session = AsyncMock()
    # User lacks clients.create permission
    mock_session.scalars.return_value = ["some.other.permission"]

    payload = {
        "client_code": "CLI-099",
        "name": "Denied Corp",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/clients", headers=auth_context["headers"], json=payload)
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'clients.create' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
