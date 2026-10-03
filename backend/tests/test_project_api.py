import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.client import Client
from app.models.employee import Employee
from app.models.identity import Profile
from app.models.project import Project
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
        email="pm@example.com",
        first_name="Jane",
        last_name="Doe",
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


def _create_mock_project(
    org_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    project_code: str = "PRJ-001",
    name: str = "Alpha Initiative",
    status: str = "planned",
    client: Client | None = None,
    pm: Employee | None = None,
) -> Project:
    p = Project(
        id=project_id or uuid.uuid4(),
        organization_id=org_id,
        client_id=client.id if client else None,
        project_code=project_code,
        name=name,
        description="A major strategic initiative",
        status=status,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        budget=Decimal("50000.00"),
        project_manager_employee_id=pm.id if pm else None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    p.client = client
    p.project_manager = pm
    p.members = []
    return p


@pytest.mark.asyncio
async def test_list_projects_empty(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.scalars.side_effect = [
        ["projects.view"],
        [],
    ]
    count_mock = MagicMock()
    count_mock.scalar.return_value = 0
    mock_session.execute.return_value = count_mock

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/projects", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["items"] == []
        assert body["data"]["meta"]["total"] == 0
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_list_projects_with_data(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    proj1 = _create_mock_project(org_id, project_code="PRJ-001", name="Alpha")
    proj2 = _create_mock_project(org_id, project_code="PRJ-002", name="Beta")

    mock_session.scalars.side_effect = [
        ["projects.view"],
        [proj1, proj2],
    ]
    count_mock = MagicMock()
    count_mock.scalar.return_value = 2
    mock_session.execute.return_value = count_mock

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/projects", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]["items"]) == 2
        assert body["data"]["items"][0]["project_code"] == "PRJ-001"
        assert body["data"]["items"][1]["project_code"] == "PRJ-002"
        assert body["data"]["meta"]["total"] == 2
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_project_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    created_proj = _create_mock_project(org_id, project_code="PRJ-NEW", name="Gamma Initiative")

    mock_session.scalars.return_value = ["projects.create"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        None,  # duplicate code check
        created_proj,  # get_project for response
    ]

    payload = {
        "project_code": "prj-new",
        "name": "Gamma Initiative",
        "description": "Strategic infrastructure project",
        "status": "planned",
        "start_date": "2026-03-01",
        "end_date": "2026-09-30",
        "budget": 75000.00,
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/projects", headers=auth_context["headers"], json=payload)
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["project_code"] == "PRJ-NEW"
        assert body["data"]["name"] == "Gamma Initiative"
        mock_session.add.assert_called()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_project_duplicate_code_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    existing_proj = _create_mock_project(org_id, project_code="PRJ-001")
    mock_session.scalars.return_value = ["projects.create"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        existing_proj,  # duplicate code check finds existing
    ]

    payload = {
        "project_code": "PRJ-001",
        "name": "Another Project",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/projects", headers=auth_context["headers"], json=payload)
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert "already exists" in body["error"]["message"]
        assert body["error"]["code"] == "CONFLICT"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_project_invalid_dates_rejected(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.scalars.return_value = ["projects.create"]

    payload = {
        "project_code": "PRJ-002",
        "name": "Invalid Dates Project",
        "start_date": "2026-10-01",
        "end_date": "2026-05-01",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/projects", headers=auth_context["headers"], json=payload)
        assert res.status_code == 422
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_project_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    proj_id = uuid.uuid4()
    mock_session = AsyncMock()

    proj = _create_mock_project(org_id, project_id=proj_id, project_code="PRJ-001", name="Alpha Initiative")

    mock_session.scalars.return_value = ["projects.view"]
    mock_session.scalar.return_value = proj

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/projects/{proj_id}", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["id"] == str(proj_id)
        assert body["data"]["name"] == "Alpha Initiative"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_project_not_found(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.scalars.return_value = ["projects.view"]
    mock_session.scalar.return_value = None

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/projects/{uuid.uuid4()}", headers=auth_context["headers"])
        assert res.status_code == 404
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_project_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    proj_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    proj = _create_mock_project(org_id, project_id=proj_id, name="Alpha Initiative")

    mock_session.scalars.return_value = ["projects.update"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        proj,  # project lookup
        proj,  # re-fetch
    ]

    payload = {
        "name": "Alpha Initiative Updated",
        "status": "active",
        "budget": 60000.00,
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(f"/api/v1/projects/{proj_id}", headers=auth_context["headers"], json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert proj.name == "Alpha Initiative Updated"
        assert proj.status == "active"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_archive_project_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    proj_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    proj = _create_mock_project(org_id, project_id=proj_id, status="active")

    mock_session.scalars.return_value = ["projects.delete"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        proj,  # project lookup
        proj,  # re-fetch
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(f"/api/v1/projects/{proj_id}", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert proj.status == "cancelled"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
