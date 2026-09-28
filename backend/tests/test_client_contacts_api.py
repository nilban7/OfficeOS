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


def _create_mock_client(org_id: uuid.UUID, client_id: uuid.UUID | None = None) -> Client:
    c = Client(
        id=client_id or uuid.uuid4(),
        organization_id=org_id,
        client_code="CLI-001",
        name="Acme Corp",
        status="active",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    c.contacts = []
    return c


def _create_mock_contact(
    org_id: uuid.UUID,
    client_id: uuid.UUID,
    contact_id: uuid.UUID | None = None,
    name: str = "John Doe",
    is_primary: bool = False,
) -> ClientContact:
    return ClientContact(
        id=contact_id or uuid.uuid4(),
        organization_id=org_id,
        client_id=client_id,
        name=name,
        designation="Manager",
        email="john@example.com",
        phone="+1234567890",
        is_primary=is_primary,
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


# ==========================================
# Client Contacts API Tests
# ==========================================
@pytest.mark.asyncio
async def test_list_contacts_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    mock_session = AsyncMock()

    c1 = _create_mock_contact(org_id, client_id, name="Alice", is_primary=True)
    c2 = _create_mock_contact(org_id, client_id, name="Bob", is_primary=False)

    mock_session.scalars.side_effect = [
        ["client_contacts.view"],
        [c1, c2],
    ]
    mock_session.scalar.return_value = client_id  # client_exists check

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/clients/{client_id}/contacts", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]) == 2
        assert body["data"][0]["name"] == "Alice"
        assert body["data"][0]["is_primary"] is True
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_list_contacts_client_not_found(auth_context) -> None:
    client_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_session.scalars.return_value = ["client_contacts.view"]
    mock_session.scalar.return_value = None  # client does not exist

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/clients/{client_id}/contacts", headers=auth_context["headers"])
        assert res.status_code == 404
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"
        assert body["error"]["message"] == "Client not found"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_contact_first_becomes_primary(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    client_obj = _create_mock_client(org_id, client_id=client_id)

    mock_session.scalars.return_value = ["client_contacts.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # actor_id
        client_obj,  # client exists
        0,  # existing_count is 0 -> should default to is_primary = True
    ]

    payload = {
        "name": "First Contact",
        "designation": "Director",
        "email": "first@client.com",
        "is_primary": False,  # even if false, first contact becomes primary
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/clients/{client_id}/contacts",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "First Contact"
        assert body["data"]["is_primary"] is True
        mock_session.add.assert_called()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_contact_explicit_primary(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.add = MagicMock()

    client_obj = _create_mock_client(org_id, client_id=client_id)

    mock_session.scalars.return_value = ["client_contacts.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # actor_id
        client_obj,  # client exists
        1,  # existing_count is 1
    ]

    payload = {
        "name": "Second Contact",
        "designation": "VP Sales",
        "email": "second@client.com",
        "is_primary": True,
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/clients/{client_id}/contacts",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "Second Contact"
        assert body["data"]["is_primary"] is True
        mock_session.execute.assert_called()  # update query to demote siblings was executed
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_contact_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    contact_id = uuid.uuid4()
    mock_session = AsyncMock()

    contact = _create_mock_contact(org_id, client_id, contact_id=contact_id, name="Jane Smith")

    mock_session.scalars.return_value = ["client_contacts.view"]
    mock_session.scalar.return_value = contact

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                f"/api/v1/clients/{client_id}/contacts/{contact_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "Jane Smith"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_contact_promote_to_primary(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    contact_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.execute = AsyncMock()

    contact = _create_mock_contact(org_id, client_id, contact_id=contact_id, is_primary=False)

    mock_session.scalars.return_value = ["client_contacts.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # actor_id
        contact,  # contact query
    ]

    payload = {
        "is_primary": True,
        "designation": "Chief Operating Officer",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/clients/{client_id}/contacts/{contact_id}",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["is_primary"] is True
        assert body["data"]["designation"] == "Chief Operating Officer"
        mock_session.execute.assert_called()  # update siblings query executed
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_delete_contact_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    client_id = uuid.uuid4()
    contact_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.delete = AsyncMock()

    contact = _create_mock_contact(org_id, client_id, contact_id=contact_id, is_primary=True)
    sibling = _create_mock_contact(org_id, client_id, is_primary=False)

    mock_session.scalars.return_value = ["client_contacts.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # actor_id
        contact,  # query contact to delete
        sibling,  # next sibling to promote to primary
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/clients/{client_id}/contacts/{contact_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["deleted"] is True
        assert sibling.is_primary is True
        mock_session.delete.assert_called_with(contact)
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_contact_rbac_forbidden(auth_context) -> None:
    client_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.scalars.return_value = ["clients.view"]  # lacking client_contacts.manage

    payload = {
        "name": "Forbidden Contact",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/clients/{client_id}/contacts",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'client_contacts.manage' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
